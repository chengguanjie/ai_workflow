import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET: 验证邀请 token 并获取邀请信息
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: '缺少邀请 token' }, { status: 400 })
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
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

    // 检查邮件邀请是否已被接受
    if (invitation.type === 'EMAIL' && invitation.acceptedAt) {
      return NextResponse.json({ error: '邀请已被接受' }, { status: 400 })
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        type: invitation.type,
        organization: invitation.organization,
        department: invitation.department,
      },
    })
  } catch (error) {
    console.error('Failed to verify invitation:', error)
    return NextResponse.json({ error: '验证邀请失败' }, { status: 500 })
  }
}
