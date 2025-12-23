import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { Role, InvitationType } from '@prisma/client'
import { randomBytes } from 'crypto'

// 生成安全的随机 token
function generateToken(): string {
  return randomBytes(32).toString('hex')
}

// GET: 获取所有邀请
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 只有 OWNER 和 ADMIN 可以查看邀请
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('权限不足', 403)
    }

    const invitations = await prisma.invitation.findMany({
      where: {
        organizationId: session.user.organizationId,
        acceptedAt: null, // 只获取未接受的邀请
      },
      select: {
        id: true,
        email: true,
        role: true,
        type: true,
        token: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        createdAt: true,
        invitedById: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // 判断邀请是否过期或已用完
    const processedInvitations = invitations.map(inv => ({
      ...inv,
      isExpired: new Date(inv.expiresAt) < new Date(),
      isUsedUp: inv.usedCount >= inv.maxUses,
      inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/invite/${inv.token}`,
    }))

    return ApiResponse.success({ invitations: processedInvitations })
  } catch (error) {
    console.error('Failed to get invitations:', error)
    return ApiResponse.error('获取邀请列表失败', 500)
  }
}

// POST: 创建邀请
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 只有 OWNER 和 ADMIN 可以邀请成员
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const {
      type = 'EMAIL',
      email,
      role = 'MEMBER',
      departmentId,
      expiresInDays = 7,
      maxUses = 1,
    } = body

    // 验证类型
    if (!Object.values(InvitationType).includes(type)) {
      return ApiResponse.error('无效的邀请类型', 400)
    }

    // 验证角色
    if (!Object.values(Role).includes(role)) {
      return ApiResponse.error('无效的角色', 400)
    }

    // 不能邀请 OWNER
    if (role === 'OWNER') {
      return ApiResponse.error('不能邀请 OWNER 角色', 400)
    }

    // ADMIN 不能邀请 ADMIN
    if (session.user.role === 'ADMIN' && role === 'ADMIN') {
      return ApiResponse.error('ADMIN 不能邀请 ADMIN 角色', 403)
    }

    // 邮件邀请必须提供邮箱
    if (type === 'EMAIL') {
      if (!email || !email.trim()) {
        return ApiResponse.error('邮件邀请需要提供邮箱地址', 400)
      }

      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return ApiResponse.error('无效的邮箱格式', 400)
      }

      // 检查邮箱是否已是成员
      const existingMember = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })

      if (existingMember) {
        return ApiResponse.error('该邮箱已是团队成员', 400)
      }

      // 检查是否有待处理的邀请
      const existingInvitation = await prisma.invitation.findFirst({
        where: {
          email: email.toLowerCase(),
          organizationId: session.user.organizationId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      })

      if (existingInvitation) {
        return ApiResponse.error('该邮箱已有待处理的邀请', 400)
      }
    }

    // 验证部门（如果提供）
    if (departmentId) {
      const department = await prisma.department.findFirst({
        where: {
          id: departmentId,
          organizationId: session.user.organizationId,
        },
      })
      if (!department) {
        return ApiResponse.error('部门不存在', 400)
      }
    }

    // 计算过期时间
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + Math.min(expiresInDays, 30)) // 最多30天

    // 创建邀请
    const invitation = await prisma.invitation.create({
      data: {
        email: type === 'EMAIL' ? email.toLowerCase() : null,
        role,
        type,
        token: generateToken(),
        expiresAt,
        maxUses: type === 'LINK' ? Math.min(maxUses, 100) : 1, // 链接最多100次
        organizationId: session.user.organizationId,
        invitedById: session.user.id,
        departmentId: departmentId || null,
      },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'invitation.created',
        resource: 'invitation',
        resourceId: invitation.id,
        detail: {
          type,
          email: invitation.email,
          role,
          expiresAt: expiresAt.toISOString(),
        },
        userId: session.user.id,
        organizationId: session.user.organizationId,
      },
    })

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/invite/${invitation.token}`

    // TODO: 如果是邮件邀请，发送邮件
    // if (type === 'EMAIL') {
    //   await sendInvitationEmail(email, inviteUrl, session.user.organizationName)
    // }

    return ApiResponse.success({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        type: invitation.type,
        expiresAt: invitation.expiresAt,
        maxUses: invitation.maxUses,
        inviteUrl,
      },
    })
  } catch (error) {
    console.error('Failed to create invitation:', error)
    return ApiResponse.error('创建邀请失败', 500)
  }
}
