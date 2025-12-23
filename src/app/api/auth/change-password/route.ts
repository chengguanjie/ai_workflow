import { NextRequest } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, '密码至少6位'),
  confirmPassword: z.string().min(6, '密码至少6位'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
})

// POST: 修改密码（首次登录必须修改密码）
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const { newPassword } = changePasswordSchema.parse(body)

    // 更新密码并清除 mustChangePassword 标记
    const passwordHash = await hash(newPassword, 12)

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'password.changed',
        resource: 'user',
        resourceId: session.user.id,
        detail: {
          reason: 'first_login',
        },
        userId: session.user.id,
        organizationId: session.user.organizationId,
      },
    })

    return ApiResponse.success({
      message: '密码修改成功',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return ApiResponse.error(issues[0]?.message || '输入验证失败', 400)
    }

    console.error('Change password error:', error)
    return ApiResponse.error('修改密码失败', 500)
  }
}
