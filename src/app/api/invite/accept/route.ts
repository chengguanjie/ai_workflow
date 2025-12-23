import { NextRequest } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { z } from 'zod'

const acceptSchema = z.object({
  token: z.string().min(1, '缺少邀请 token'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少6位'),
  name: z.string().min(1, '姓名不能为空'),
})

// POST: 接受邀请并注册
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, email, password, name } = acceptSchema.parse(body)

    // 获取邀请信息
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        organization: true,
        department: true,
      },
    })

    if (!invitation) {
      return ApiResponse.error('邀请不存在或已失效', 404)
    }

    // 检查是否过期
    if (new Date(invitation.expiresAt) < new Date()) {
      return ApiResponse.error('邀请已过期', 400)
    }

    // 检查是否已用完
    if (invitation.usedCount >= invitation.maxUses) {
      return ApiResponse.error('邀请已达到使用上限', 400)
    }

    // 邮件邀请必须使用指定邮箱
    if (invitation.type === 'EMAIL') {
      if (invitation.acceptedAt) {
        return ApiResponse.error('邀请已被接受', 400)
      }
      if (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
        return ApiResponse.error('邮箱地址与邀请不匹配', 400)
      }
    }

    // 检查邮箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      return ApiResponse.error('该邮箱已被注册', 400)
    }

    // 创建用户
    const passwordHash = await hash(password, 12)

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: invitation.role,
        organizationId: invitation.organizationId,
        departmentId: invitation.departmentId,
      },
    })

    // 更新邀请状态
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        acceptedAt: invitation.type === 'EMAIL' ? new Date() : undefined,
        usedCount: { increment: 1 },
      },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'invitation.accepted',
        resource: 'user',
        resourceId: user.id,
        detail: {
          invitationId: invitation.id,
          invitationType: invitation.type,
          userEmail: user.email,
          userName: user.name,
          role: invitation.role,
          departmentId: invitation.departmentId,
        },
        userId: user.id,
        organizationId: invitation.organizationId,
      },
    })

    return ApiResponse.created({
      message: '加入成功',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: invitation.organizationId,
        organizationName: invitation.organization.name,
        departmentId: invitation.departmentId,
        departmentName: invitation.department?.name,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return ApiResponse.error(issues[0]?.message || '输入验证失败', 400)
    }

    console.error('Accept invitation error:', error)
    return ApiResponse.error('接受邀请失败', 500)
  }
}
