import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { LogLevel } from '@prisma/client'

// 获取系统日志列表
export async function GET(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const level = searchParams.get('level')
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Record<string, unknown> = {}

    if (level) {
      where.level = level
    }
    if (category) {
      where.category = category
    }
    if (search) {
      where.message = { contains: search }
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
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.systemLog.count({ where }),
    ])

    // 获取分类列表
    const categories = await prisma.systemLog.findMany({
      select: { category: true },
      distinct: ['category'],
    })

    // 获取日志级别统计
    const levelStats = await prisma.systemLog.groupBy({
      by: ['level'],
      _count: true,
    })

    return NextResponse.json({
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      filters: {
        categories: categories.map((c) => c.category),
        levels: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
      },
      stats: {
        byLevel: Object.fromEntries(
          levelStats.map((s) => [s.level, s._count])
        ),
      },
    })
  } catch (error) {
    console.error('获取系统日志失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

// 创建系统日志（内部使用）
export async function POST(request: NextRequest) {
  try {
    // 这个 API 可以被内部服务调用，需要验证
    const body = await request.json()
    const { level, category, message, detail, source, traceId } = body

    if (!category || !message) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      )
    }

    const validLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
    if (level && !validLevels.includes(level)) {
      return NextResponse.json({ error: '无效的日志级别' }, { status: 400 })
    }

    const log = await prisma.systemLog.create({
      data: {
        level: level || 'INFO',
        category,
        message,
        detail,
        source,
        traceId,
      },
    })

    return NextResponse.json(log)
  } catch (error) {
    console.error('创建系统日志失败:', error)
    return NextResponse.json({ error: '创建失败' }, { status: 500 })
  }
}

// 清理旧日志
export async function DELETE(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有超管可以清理日志
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const result = await prisma.systemLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    })
  } catch (error) {
    console.error('清理系统日志失败:', error)
    return NextResponse.json({ error: '清理失败' }, { status: 500 })
  }
}
