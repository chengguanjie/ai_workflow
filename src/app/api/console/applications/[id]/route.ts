import { NextRequest } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import { hash } from 'bcryptjs'
import { ApiResponse } from '@/lib/api/api-response'
import type { PlatformRole } from '@prisma/client'

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

// GET - 获取申请详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:read')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  const application = await prisma.orgApplication.findUnique({
    where: { id },
  })

  if (!application) {
    return ApiResponse.error('申请不存在', 404)
  }

  return ApiResponse.success(application)
}

// PUT - 审批申请
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:create')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { action, rejectReason, plan = 'FREE', apiQuota = 10000 } = body as {
      action: 'approve' | 'reject'
      rejectReason?: string
      plan?: string
      apiQuota?: number
    }

    // 获取申请
    const application = await prisma.orgApplication.findUnique({
      where: { id },
    })

    if (!application) {
      return ApiResponse.error('申请不存在', 404)
    }

    if (application.status !== 'PENDING') {
      return ApiResponse.error('该申请已处理', 400)
    }

    if (action === 'reject') {
      // 拒绝申请
      if (!rejectReason) {
        return ApiResponse.error('请填写拒绝原因', 400)
      }

      await prisma.orgApplication.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectReason,
          reviewedAt: new Date(),
          reviewedById: session.user.id,
        },
      })

      // 记录审计日志
      await prisma.platformAuditLog.create({
        data: {
          action: 'REJECT_APPLICATION',
          resource: 'application',
          resourceId: id,
          detail: {
            orgName: application.orgName,
            contactEmail: application.contactEmail,
            rejectReason,
          },
          adminId: session.user.id,
        },
      })

      return ApiResponse.success({
        status: 'REJECTED',
        message: '已拒绝申请',
      })
    } else if (action === 'approve') {
      // 通过申请 - 创建企业和用户

      // 再次检查邮箱是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { email: application.contactEmail },
      })

      if (existingUser) {
        return ApiResponse.error('该邮箱已被使用', 400)
      }

      // 生成密码
      const tempPassword = generatePassword()
      const passwordHash = await hash(tempPassword, 12)

      // 创建企业和用户（事务）
      const organization = await prisma.organization.create({
        data: {
          name: application.orgName,
          industry: application.industry,
          website: application.website,
          phone: application.phone,
          address: application.address,
          description: application.description,
          plan: plan as 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
          apiQuota,
          status: 'ACTIVE',
          createdByAdminId: session.user.id,
          securitySettings: {
            passwordMinLength: 8,
            passwordRequireUppercase: false,
            passwordRequireNumber: false,
            passwordRequireSymbol: false,
            sessionTimeout: 10080, // 7天
            maxLoginAttempts: 5,
            ipWhitelist: [],
            twoFactorRequired: false,
          },
          users: {
            create: {
              email: application.contactEmail,
              name: application.contactName,
              passwordHash,
              role: 'OWNER',
              isActive: true,
            },
          },
        },
        include: {
          users: {
            where: { role: 'OWNER' },
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      })

      // 更新申请状态
      await prisma.orgApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedById: session.user.id,
          organizationId: organization.id,
        },
      })

      // 记录审计日志
      await prisma.platformAuditLog.create({
        data: {
          action: 'APPROVE_APPLICATION',
          resource: 'application',
          resourceId: id,
          detail: {
            orgName: application.orgName,
            contactEmail: application.contactEmail,
            organizationId: organization.id,
            plan,
          },
          adminId: session.user.id,
        },
      })

      return ApiResponse.success({
        status: 'APPROVED',
        message: '已通过申请',
        organization: {
          id: organization.id,
          name: organization.name,
        },
        owner: {
          id: organization.users[0].id,
          email: organization.users[0].email,
          name: organization.users[0].name,
          tempPassword,
        },
      })
    } else {
      return ApiResponse.error('无效的操作', 400)
    }
  } catch (error) {
    console.error('审批申请失败:', error)
    return ApiResponse.error('审批失败', 500)
  }
}
