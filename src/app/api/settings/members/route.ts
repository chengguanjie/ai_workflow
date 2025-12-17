import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET: 获取所有成员
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const members = await prisma.user.findMany({
      where: {
        organizationId: session.user.organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [
        { role: 'asc' }, // OWNER 排最前
        { createdAt: 'asc' },
      ],
    })

    // 计算角色排序权重
    const roleOrder = { OWNER: 0, ADMIN: 1, EDITOR: 2, MEMBER: 3, VIEWER: 4 }
    const sortedMembers = members.sort((a, b) => {
      return (roleOrder[a.role as keyof typeof roleOrder] || 99) -
             (roleOrder[b.role as keyof typeof roleOrder] || 99)
    })

    return NextResponse.json({ members: sortedMembers })
  } catch (error) {
    console.error('Failed to get members:', error)
    return NextResponse.json({ error: '获取成员列表失败' }, { status: 500 })
  }
}
