import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET: 获取审计日志
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有 OWNER 和 ADMIN 可以查看审计日志
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const action = searchParams.get('action')
    const resource = searchParams.get('resource')
    const userId = searchParams.get('userId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // 构建查询条件
    const where: Record<string, unknown> = {
      organizationId: session.user.organizationId,
    }

    if (action) {
      where.action = { contains: action }
    }

    if (resource) {
      where.resource = resource
    }

    if (userId) {
      where.userId = userId
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate)
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(endDate)
      }
    }

    // 获取总数
    const total = await prisma.auditLog.count({ where })

    // 获取日志列表
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })

    // 获取关联的用户信息
    const userIds = [...new Set(logs.map(log => log.userId).filter(Boolean))] as string[]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })

    const userMap = new Map(users.map(u => [u.id, u]))

    // 组装返回数据
    const logsWithUsers = logs.map(log => ({
      ...log,
      user: log.userId ? userMap.get(log.userId) : null,
    }))

    return NextResponse.json({
      logs: logsWithUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Failed to get audit logs:', error)
    return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 })
  }
}
