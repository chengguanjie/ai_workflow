/**
 * 平台管理后台 - 执行准确率统计 API
 *
 * GET /api/console/accuracy - 获取各企业工作流执行准确率统计
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { ApiResponse } from '@/lib/api/api-response'

// 获取执行准确率统计
export async function GET(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const organizationId = searchParams.get('organizationId')
    const search = searchParams.get('search')
    const dateRange = searchParams.get('dateRange') || '30' // 默认30天

    // 计算日期范围
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // 获取企业列表
    const orgWhere: Record<string, unknown> = {}
    if (organizationId) {
      orgWhere.id = organizationId
    }
    if (search) {
      orgWhere.name = { contains: search }
    }

    // 获取所有企业及其工作流统计
    const organizations = await prisma.organization.findMany({
      where: orgWhere,
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    const totalOrganizations = await prisma.organization.count({ where: orgWhere })

    // 获取每个企业的统计数据
    const orgStats = await Promise.all(
      organizations.map(async (org) => {
        // 工作流数量
        const workflowCount = await prisma.workflow.count({
          where: { organizationId: org.id },
        })

        // 获取执行统计
        const executions = await prisma.execution.findMany({
          where: {
            workflow: { organizationId: org.id },
            createdAt: { gte: startDate },
          },
          select: {
            id: true,
            status: true,
          },
        })

        const totalExecutions = executions.length
        const successExecutions = executions.filter((e) => e.status === 'COMPLETED').length
        const failedExecutions = executions.filter((e) => e.status === 'FAILED').length

        // 获取反馈统计
        const feedbacks = await prisma.executionFeedback.findMany({
          where: {
            execution: {
              workflow: { organizationId: org.id },
            },
            createdAt: { gte: startDate },
          },
          select: {
            isAccurate: true,
            rating: true,
          },
        })

        const totalFeedbacks = feedbacks.length
        const accurateFeedbacks = feedbacks.filter((f) => f.isAccurate === true).length
        const inaccurateFeedbacks = feedbacks.filter((f) => f.isAccurate === false).length
        const avgRating =
          totalFeedbacks > 0
            ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbacks
            : 0

        // 计算准确率
        const accuracyRate =
          totalFeedbacks > 0 ? (accurateFeedbacks / totalFeedbacks) * 100 : null
        const successRate =
          totalExecutions > 0 ? (successExecutions / totalExecutions) * 100 : null

        return {
          organization: org,
          stats: {
            workflowCount,
            totalExecutions,
            successExecutions,
            failedExecutions,
            successRate: successRate !== null ? parseFloat(successRate.toFixed(2)) : null,
            totalFeedbacks,
            accurateFeedbacks,
            inaccurateFeedbacks,
            accuracyRate: accuracyRate !== null ? parseFloat(accuracyRate.toFixed(2)) : null,
            avgRating: avgRating > 0 ? parseFloat(avgRating.toFixed(2)) : null,
          },
        }
      })
    )

    // 计算平台整体统计
    const platformStats = await getPlatformStats(startDate)

    return ApiResponse.success({
      organizations: orgStats,
      pagination: {
        page,
        pageSize,
        total: totalOrganizations,
        totalPages: Math.ceil(totalOrganizations / pageSize),
      },
      platformStats,
      dateRange: parseInt(dateRange),
    })
  } catch (error) {
    console.error('获取准确率统计失败:', error)
    return ApiResponse.error('获取失败', 500)
  }
}

// 获取平台整体统计
async function getPlatformStats(startDate: Date) {
  // 总执行数
  const totalExecutions = await prisma.execution.count({
    where: { createdAt: { gte: startDate } },
  })

  // 成功执行数
  const successExecutions = await prisma.execution.count({
    where: {
      createdAt: { gte: startDate },
      status: 'COMPLETED',
    },
  })

  // 失败执行数
  const failedExecutions = await prisma.execution.count({
    where: {
      createdAt: { gte: startDate },
      status: 'FAILED',
    },
  })

  // 反馈统计
  const feedbacks = await prisma.executionFeedback.findMany({
    where: { createdAt: { gte: startDate } },
    select: {
      isAccurate: true,
      rating: true,
    },
  })

  const totalFeedbacks = feedbacks.length
  const accurateFeedbacks = feedbacks.filter((f) => f.isAccurate === true).length
  const avgRating =
    totalFeedbacks > 0
      ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbacks
      : 0

  // 活跃企业数
  const activeOrganizations = await prisma.organization.count({
    where: {
      workflows: {
        some: {
          executions: {
            some: {
              createdAt: { gte: startDate },
            },
          },
        },
      },
    },
  })

  // 活跃工作流数
  const activeWorkflows = await prisma.workflow.count({
    where: {
      executions: {
        some: {
          createdAt: { gte: startDate },
        },
      },
    },
  })

  return {
    totalExecutions,
    successExecutions,
    failedExecutions,
    successRate:
      totalExecutions > 0
        ? parseFloat(((successExecutions / totalExecutions) * 100).toFixed(2))
        : null,
    totalFeedbacks,
    accurateFeedbacks,
    accuracyRate:
      totalFeedbacks > 0
        ? parseFloat(((accurateFeedbacks / totalFeedbacks) * 100).toFixed(2))
        : null,
    avgRating: avgRating > 0 ? parseFloat(avgRating.toFixed(2)) : null,
    activeOrganizations,
    activeWorkflows,
  }
}
