import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'

// 获取审计日志列表
export async function GET(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const action = searchParams.get('action')
    const resource = searchParams.get('resource')
    const adminId = searchParams.get('adminId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Record<string, unknown> = {}

    if (action) {
      where.action = action
    }
    if (resource) {
      where.resource = resource
    }
    if (adminId) {
      where.adminId = adminId
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate)
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        ;(where.createdAt as Record<string, Date>).lte = end
      }
    }

    const [logs, total] = await Promise.all([
      prisma.platformAuditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.platformAuditLog.count({ where }),
    ])

    // 获取筛选选项
    const [actions, resources, admins] = await Promise.all([
      prisma.platformAuditLog.findMany({
        select: { action: true },
        distinct: ['action'],
      }),
      prisma.platformAuditLog.findMany({
        select: { resource: true },
        distinct: ['resource'],
      }),
      prisma.platformAdmin.findMany({
        select: { id: true, email: true, name: true },
      }),
    ])

    return NextResponse.json({
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      filters: {
        actions: actions.map((a) => a.action),
        resources: resources.map((r) => r.resource),
        admins,
      },
    })
  } catch (error) {
    console.error('获取审计日志失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}
