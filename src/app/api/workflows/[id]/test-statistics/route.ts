/**
 * 测试统计 API
 *
 * GET /api/workflows/[id]/test-statistics - 获取工作流测试统计数据
 *
 * Feature: workflow-test-mode
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { workflowService } from '@/server/services/workflow.service'

/**
 * GET /api/workflows/[id]/test-statistics
 * 获取工作流测试统计数据
 *
 * Feature: workflow-test-mode, Property 6: 统计计算正确性
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5
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
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate')
  const nodeId = searchParams.get('nodeId')

  // 解析时间范围
  let startDate: Date | undefined
  let endDate: Date | undefined

  if (startDateParam) {
    startDate = new Date(startDateParam)
    if (isNaN(startDate.getTime())) {
      startDate = undefined
    }
  }

  if (endDateParam) {
    endDate = new Date(endDateParam)
    if (isNaN(endDate.getTime())) {
      endDate = undefined
    }
  }

  // 构建查询条件
  const feedbackWhere: {
    execution: {
      workflowId: string
      executionType: 'TEST'
    }
    nodeId?: string
    createdAt?: {
      gte?: Date
      lte?: Date
    }
  } = {
    execution: {
      workflowId,
      executionType: 'TEST',
    },
  }

  if (nodeId) {
    feedbackWhere.nodeId = nodeId
  }

  if (startDate || endDate) {
    feedbackWhere.createdAt = {}
    if (startDate) {
      feedbackWhere.createdAt.gte = startDate
    }
    if (endDate) {
      feedbackWhere.createdAt.lte = endDate
    }
  }

  // 获取所有符合条件的反馈数据
  const feedbacks = await prisma.nodeTestFeedback.findMany({
    where: feedbackWhere,
    select: {
      id: true,
      nodeId: true,
      nodeName: true,
      nodeType: true,
      isCorrect: true,
      errorCategory: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  // 获取测试执行总数
  const testExecutionWhere: {
    workflowId: string
    executionType: 'TEST'
    createdAt?: {
      gte?: Date
      lte?: Date
    }
  } = {
    workflowId,
    executionType: 'TEST',
  }

  if (startDate || endDate) {
    testExecutionWhere.createdAt = {}
    if (startDate) {
      testExecutionWhere.createdAt.gte = startDate
    }
    if (endDate) {
      testExecutionWhere.createdAt.lte = endDate
    }
  }

  const totalTests = await prisma.execution.count({
    where: testExecutionWhere,
  })

  // 计算节点统计
  const nodeStatsMap = new Map<
    string,
    {
      nodeId: string
      nodeName: string
      nodeType: string
      totalFeedbacks: number
      correctCount: number
      incorrectCount: number
      errorCategories: Record<string, number>
    }
  >()

  for (const feedback of feedbacks) {
    const key = feedback.nodeId
    if (!nodeStatsMap.has(key)) {
      nodeStatsMap.set(key, {
        nodeId: feedback.nodeId,
        nodeName: feedback.nodeName,
        nodeType: feedback.nodeType,
        totalFeedbacks: 0,
        correctCount: 0,
        incorrectCount: 0,
        errorCategories: {},
      })
    }

    const stats = nodeStatsMap.get(key)!
    stats.totalFeedbacks++

    if (feedback.isCorrect) {
      stats.correctCount++
    } else {
      stats.incorrectCount++
      if (feedback.errorCategory) {
        stats.errorCategories[feedback.errorCategory] =
          (stats.errorCategories[feedback.errorCategory] || 0) + 1
      }
    }
  }

  // 转换为数组并计算正确率
  const nodeStatistics = Array.from(nodeStatsMap.values()).map((stats) => ({
    ...stats,
    correctRate: stats.totalFeedbacks > 0 ? stats.correctCount / stats.totalFeedbacks : 0,
  }))

  // 计算错误分类统计
  const errorCategoryBreakdown: Record<string, number> = {}
  for (const feedback of feedbacks) {
    if (!feedback.isCorrect && feedback.errorCategory) {
      errorCategoryBreakdown[feedback.errorCategory] =
        (errorCategoryBreakdown[feedback.errorCategory] || 0) + 1
    }
  }

  // 计算趋势数据（按日期聚合）
  const trendMap = new Map<
    string,
    {
      date: string
      correctCount: number
      totalCount: number
      testCount: number
    }
  >()

  for (const feedback of feedbacks) {
    const date = feedback.createdAt.toISOString().split('T')[0]
    if (!trendMap.has(date)) {
      trendMap.set(date, {
        date,
        correctCount: 0,
        totalCount: 0,
        testCount: 0,
      })
    }

    const item = trendMap.get(date)!
    item.totalCount++
    if (feedback.isCorrect) {
      item.correctCount++
    }
  }

  // 获取每日测试执行数
  const testExecutions = await prisma.execution.findMany({
    where: testExecutionWhere,
    select: {
      createdAt: true,
    },
  })

  for (const execution of testExecutions) {
    const date = execution.createdAt.toISOString().split('T')[0]
    if (!trendMap.has(date)) {
      trendMap.set(date, {
        date,
        correctCount: 0,
        totalCount: 0,
        testCount: 0,
      })
    }
    trendMap.get(date)!.testCount++
  }

  // 转换趋势数据并计算正确率
  const trend = Array.from(trendMap.values())
    .map((item) => ({
      date: item.date,
      correctRate: item.totalCount > 0 ? item.correctCount / item.totalCount : 0,
      testCount: item.testCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return ApiResponse.success({
    totalTests,
    nodeStatistics,
    errorCategoryBreakdown,
    trend,
  })
})
