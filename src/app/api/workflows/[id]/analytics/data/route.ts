/**
 * 工作流分析数据 API
 *
 * GET: 获取工作流的分析数据
 * - 支持时间范围筛选
 * - 支持按数据点分组
 * - 支持聚合计算
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkResourcePermission } from '@/lib/permissions/resource'
import { startOfDay, endOfDay, subDays } from 'date-fns'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const workflowId = params.id

    // 检查权限
    const canRead = await checkResourcePermission({
      userId,
      resourceType: 'workflow',
      resourceId: workflowId,
      action: 'read',
    })

    if (!canRead) {
      return NextResponse.json({ error: '无权限查看此工作流的分析数据' }, { status: 403 })
    }

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams
    const configId = searchParams.get('configId')
    const groupBy = searchParams.get('groupBy') || 'day' // day, week, month
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const aggregationType = searchParams.get('aggregation') || 'AVG'

    // 默认时间范围：最近30天
    const defaultStartDate = subDays(new Date(), 30)
    const defaultEndDate = new Date()

    const dateFilter = {
      gte: startDate ? new Date(startDate) : defaultStartDate,
      lte: endDate ? endOfDay(new Date(endDate)) : defaultEndDate,
    }

    // 查询分析配置
    const configs = configId
      ? await prisma.analyticsConfig.findMany({
          where: { id: configId, workflowId, isActive: true },
        })
      : await prisma.analyticsConfig.findMany({
          where: { workflowId, isActive: true },
        })

    if (!configs.length) {
      return NextResponse.json({ configs: [], dataPoints: [] })
    }

    // 获取数据点
    const dataPoints = await prisma.analyticsDataPoint.findMany({
      where: {
        configId: configId || { in: configs.map(c => c.id) },
        createdAt: dateFilter,
      },
      include: {
        config: true,
        execution: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // 按配置分组数据
    const groupedData = configs.map(config => {
      const configDataPoints = dataPoints.filter(dp => dp.configId === config.id)

      // 按时间分组聚合
      const timeGroupedData = groupDataByTime(configDataPoints, groupBy)

      // 计算聚合值
      const aggregatedData = timeGroupedData.map(group => {
        const values = group.dataPoints.map(dp => {
          switch (config.type) {
            case 'NUMBER':
            case 'PERCENTAGE':
            case 'RATING':
              return dp.numberValue
            default:
              return null
          }
        }).filter(v => v !== null) as number[]

        const aggregatedValue = calculateAggregation(values, aggregationType)

        return {
          date: group.date,
          value: aggregatedValue,
          count: values.length,
        }
      })

      return {
        config: {
          id: config.id,
          name: config.name,
          label: config.label,
          type: config.type,
          unit: config.unit,
        },
        data: aggregatedData,
        summary: {
          total: configDataPoints.length,
          average: calculateAggregation(
            configDataPoints
              .map(dp => dp.numberValue)
              .filter(v => v !== null) as number[],
            'AVG'
          ),
          min: calculateAggregation(
            configDataPoints
              .map(dp => dp.numberValue)
              .filter(v => v !== null) as number[],
            'MIN'
          ),
          max: calculateAggregation(
            configDataPoints
              .map(dp => dp.numberValue)
              .filter(v => v !== null) as number[],
            'MAX'
          ),
        },
      }
    })

    return NextResponse.json({
      dateRange: {
        start: dateFilter.gte,
        end: dateFilter.lte,
      },
      groupBy,
      aggregationType,
      data: groupedData,
    })
  } catch (error) {
    console.error('获取分析数据失败:', error)
    return NextResponse.json(
      { error: '获取分析数据失败' },
      { status: 500 }
    )
  }
}

/**
 * 按时间分组数据
 */
function groupDataByTime(
  dataPoints: any[],
  groupBy: string
): Array<{ date: Date; dataPoints: any[] }> {
  const grouped = new Map<string, any[]>()

  dataPoints.forEach(dp => {
    const date = new Date(dp.createdAt)
    let key: string

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0]
        break
      case 'week':
        const weekStart = startOfDay(new Date(date))
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        key = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
      default:
        key = date.toISOString().split('T')[0]
    }

    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(dp)
  })

  return Array.from(grouped.entries()).map(([dateStr, dps]) => ({
    date: new Date(dateStr),
    dataPoints: dps,
  }))
}

/**
 * 计算聚合值
 */
function calculateAggregation(values: number[], type: string): number | null {
  if (values.length === 0) return null

  switch (type) {
    case 'SUM':
      return values.reduce((sum, val) => sum + val, 0)
    case 'AVG':
      return values.reduce((sum, val) => sum + val, 0) / values.length
    case 'MIN':
      return Math.min(...values)
    case 'MAX':
      return Math.max(...values)
    case 'COUNT':
      return values.length
    case 'MEDIAN':
      const sorted = [...values].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
    default:
      return values.reduce((sum, val) => sum + val, 0) / values.length
  }
}