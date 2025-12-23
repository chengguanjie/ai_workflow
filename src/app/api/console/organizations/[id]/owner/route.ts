import { NextRequest, NextResponse } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import { hash } from 'bcryptjs'
import type { PlatformRole } from '@prisma/client'
import { ApiResponse } from '@/lib/api/api-response'

// 生成随机密码
function generatePassword(length = 12): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// POST - 创建或重置企业主账号
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  // 只有超级管理员可以管理企业主
  if (!hasPermission(session.user.role as PlatformRole, 'user:reset-password')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { action, email, name, password } = body as {
      action: 'create' | 'reset-password'
      email?: string
      name?: string
      password?: string
    }

    // 检查企业是否存在
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: 'OWNER' },
        },
      },
    })

    if (!organization) {
      return ApiResponse.error('企业不存在', 404)
    }

    if (action === 'create') {
      // 创建新企业主
      if (!email || !name) {
        return ApiResponse.error('邮箱和姓名为必填项', 400)
      }

      // 检查邮箱是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { email },
      })

      if (existingUser) {
        return ApiResponse.error('该邮箱已被使用', 400)
      }

      // 如果已有企业主，将其降级为管理员
      if (organization.users.length > 0) {
        await prisma.user.updateMany({
          where: {
            organizationId: id,
            role: 'OWNER',
          },
          data: {
            role: 'ADMIN',
          },
        })
      }

      // 生成密码
      const tempPassword = password || generatePassword()
      const passwordHash = await hash(tempPassword, 12)

      // 创建新企业主
      const newOwner = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'OWNER',
          organizationId: id,
          isActive: true,
        },
      })

      // 记录审计日志
      await prisma.platformAuditLog.create({
        data: {
          action: 'CREATE_OWNER',
          resource: 'user',
          resourceId: newOwner.id,
          detail: {
            organizationId: id,
            organizationName: organization.name,
            email,
            previousOwner: organization.users[0]?.email,
          },
          adminId: session.user.id,
        },
      })

      return ApiResponse.success({
        id: newOwner.id,
        email: newOwner.email,
        name: newOwner.name,
        tempPassword: password ? undefined : tempPassword,
      })
    } else if (action === 'reset-password') {
      // 重置企业主密码
      const owner = organization.users[0]

      if (!owner) {
        return ApiResponse.error('该企业没有企业主', 400)
      }

      // 生成新密码
      const tempPassword = password || generatePassword()
      const passwordHash = await hash(tempPassword, 12)

      // 更新密码
      await prisma.user.update({
        where: { id: owner.id },
        data: { passwordHash },
      })

      // 记录审计日志
      await prisma.platformAuditLog.create({
        data: {
          action: 'RESET_PASSWORD',
          resource: 'user',
          resourceId: owner.id,
          detail: {
            organizationId: id,
            organizationName: organization.name,
            email: owner.email,
          },
          adminId: session.user.id,
        },
      })

      return ApiResponse.success({
        id: owner.id,
        email: owner.email,
        tempPassword: password ? undefined : tempPassword,
      })
    } else {
      return ApiResponse.error('无效的操作类型', 400)
    }
  } catch (error) {
    console.error('企业主管理失败:', error)
    return ApiResponse.error('操作失败', 500)
  }
}
