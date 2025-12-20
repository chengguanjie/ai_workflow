/**
 * 平台管理后台 - 反馈管理 API
 *
 * GET  /api/console/platform-feedback - 获取所有企业的反馈列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { Prisma } from '@prisma/client'

// 获取反馈列表
export async function GET(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const source = searchParams.get('source')
    const organizationId = searchParams.get('organizationId')
    const search = searchParams.get('search')
    const priority = searchParams.get('priority')

    const where: Prisma.PlatformFeedbackWhereInput = {}

    if (status) {
      where.status = status as Prisma.EnumPlatformFeedbackStatusFilter
    }
    if (type) {
      where.type = type as Prisma.EnumPlatformFeedbackTypeFilter
    }
    if (source) {
      where.source = source as Prisma.EnumPlatformFeedbackSourceFilter
    }
    if (organizationId) {
      where.organizationId = organizationId
    }
    if (priority) {
      where.priority = priority as Prisma.EnumPlatformFeedbackPriorityFilter
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
        { organization: { name: { contains: search } } },
      ]
    }

    const [feedbacks, total] = await Promise.all([
      prisma.platformFeedback.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.platformFeedback.count({ where }),
    ])

    // 统计数据
    const stats = await prisma.platformFeedback.groupBy({
      by: ['status'],
      _count: true,
    })

    const statusCounts = {
      PENDING: 0,
      PROCESSING: 0,
      REPLIED: 0,
      RESOLVED: 0,
      CLOSED: 0,
    }
    stats.forEach((s) => {
      statusCounts[s.status as keyof typeof statusCounts] = s._count
    })

    return NextResponse.json({
      feedbacks,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: statusCounts,
    })
  } catch (error) {
    console.error('获取反馈列表失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}
