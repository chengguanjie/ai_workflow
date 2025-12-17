import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'
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
      },
    })

    if (!invitation) {
      return NextResponse.json({ error: '邀请不存在或已失效' }, { status: 404 })
    }

    // 检查是否过期
    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json({ error: '邀请已过期' }, { status: 400 })
    }

    // 检查是否已用完
    if (invitation.usedCount >= invitation.maxUses) {
      return NextResponse.json({ error: '邀请已达到使用上限' }, { status: 400 })
    }

    // 邮件邀请必须使用指定邮箱
    if (invitation.type === 'EMAIL') {
      if (invitation.acceptedAt) {
        return NextResponse.json({ error: '邀请已被接受' }, { status: 400 })
      }
      if (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ error: '邮箱地址与邀请不匹配' }, { status: 400 })
      }
    }

    // 检查邮箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      // 如果用户已存在但不在这个组织，可以考虑加入（暂不支持）
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 })
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
        },
        userId: user.id,
        organizationId: invitation.organizationId,
      },
    })

    return NextResponse.json({
      message: '加入成功',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: invitation.organizationId,
        organizationName: invitation.organization.name,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return NextResponse.json(
        { error: issues[0]?.message || '输入验证失败' },
        { status: 400 }
      )
    }

    console.error('Accept invitation error:', error)
    return NextResponse.json({ error: '接受邀请失败' }, { status: 500 })
  }
}
