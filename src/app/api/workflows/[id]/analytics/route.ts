/**
 * 工作流统计分析 API
 *
 * GET /api/workflows/[id]/analytics - 获取工作流统计数据
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { workflowService } from '@/server/services/workflow.service'

/**
 * GET /api/workflows/[id]/analytics
 * 获取工作流统计数据
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new NotFoundError('工作流不存在')
  }

  // 验证工作流存在且用户有权限
  const workflow = await workflowService.getById(workflowId, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 获取查询参数
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'week'
  const versionId = searchParams.get('versionId')

  // 计算时间范围
  const now = new Date()
  let startDate: Date

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  // 构建查询条件
  const executionWhere = {
    workflowId,
    createdAt: { gte: startDate },
    ...(versionId && { workflowVersionId: versionId }),
  }

  // 获取执行统计
  const [executions, feedbacks, suggestions] = await Promise.all([
    // 执行记录
    prisma.execution.findMany({
      where: executionWhere,
      select: {
        id: true,
        status: true,
        duration: true,
        totalTokens: true,
        createdAt: true,
      },
    }),
    // 反馈记录
    prisma.executionFeedback.findMany({
      where: {
        execution: executionWhere,
      },
      select: {
        id: true,
        rating: true,
        isAccurate: true,
        issueCategories: true,
        createdAt: true,
      },
    }),
    // 优化建议
    prisma.optimizationSuggestion.findMany({
      where: {
        workflowId,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        status: true,
        suggestionType: true,
      },
    }),
  ])

  // 计算汇总统计
  const totalExecutions = executions.length
  const successCount = executions.filter((e) => e.status === 'COMPLETED').length
  const failureCount = executions.filter((e) => e.status === 'FAILED').length
  const successRate = totalExecutions > 0 ? successCount / totalExecutions : 0

  const feedbackCount = feedbacks.length
  const accurateCount = feedbacks.filter((f) => f.isAccurate).length
  const accuracyRate = feedbackCount > 0 ? accurateCount / feedbackCount : 0

  const ratings = feedbacks.map((f) => f.rating)
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

  const durations = executions.filter((e) => e.duration).map((e) => e.duration!)
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

  const tokens = executions.map((e) => e.totalTokens)
  const avgTokens = tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) / tokens.length : 0

  // 计算问题分类统计
  const issueBreakdown: Record<string, number> = {}
  for (const feedback of feedbacks) {
    const categories = (feedback.issueCategories as string[]) || []
    for (const category of categories) {
      issueBreakdown[category] = (issueBreakdown[category] || 0) + 1
    }
  }

  // 计算评分分布
  const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: feedbacks.filter((f) => f.rating === rating).length,
    percentage:
      feedbackCount > 0
        ? (feedbacks.filter((f) => f.rating === rating).length / feedbackCount) * 100
        : 0,
  }))

  // 计算趋势数据（按天分组）
  const trendMap = new Map<string, { executions: number; successRate: number; ratings: number[] }>()

  for (const execution of executions) {
    const date = execution.createdAt.toISOString().split('T')[0]
    if (!trendMap.has(date)) {
      trendMap.set(date, { executions: 0, successRate: 0, ratings: [] })
    }
    const item = trendMap.get(date)!
    item.executions++
    if (execution.status === 'COMPLETED') {
      item.successRate++
    }
  }

  for (const feedback of feedbacks) {
    const date = feedback.createdAt.toISOString().split('T')[0]
    if (trendMap.has(date)) {
      trendMap.get(date)!.ratings.push(feedback.rating)
    }
  }

  const trend = Array.from(trendMap.entries())
    .map(([date, data]) => ({
      date,
      executions: data.executions,
      successRate: data.executions > 0 ? data.successRate / data.executions : 0,
      avgRating:
        data.ratings.length > 0
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
          : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 获取待处理的优化建议
  const pendingSuggestions = suggestions.filter((s) => s.status === 'PENDING')
  const appliedSuggestions = suggestions.filter((s) => s.status === 'APPLIED')

  return ApiResponse.success({
    summary: {
      totalExecutions,
      successCount,
      failureCount,
      successRate,
      avgRating,
      feedbackCount,
      accuracyRate,
      avgDuration: Math.round(avgDuration),
      avgTokens: Math.round(avgTokens),
    },
    trend,
    issueBreakdown: Object.entries(issueBreakdown).map(([category, count]) => ({
      category,
      count,
      percentage: feedbackCount > 0 ? (count / feedbackCount) * 100 : 0,
    })),
    ratingDistribution,
    suggestions: {
      pending: pendingSuggestions.length,
      applied: appliedSuggestions.length,
      total: suggestions.length,
    },
  })
})
