import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { workflowService } from '@/server/services/workflow.service'
import { calculateTokenCostUSD } from '@/lib/ai/cost'

export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new NotFoundError('工作流不存在')
  }

  const workflow = await workflowService.getById(workflowId, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'week'

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

  const [executions, executionLogs] = await Promise.all([
    prisma.execution.findMany({
      where: {
        workflowId,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        totalTokens: true,
        promptTokens: true,
        completionTokens: true,
        estimatedCost: true,
        createdAt: true,
      },
    }),
    prisma.executionLog.findMany({
      where: {
        execution: {
          workflowId,
          createdAt: { gte: startDate },
        },
      },
      select: {
        aiModel: true,
        aiProvider: true,
        promptTokens: true,
        completionTokens: true,
      },
    }),
  ])

  const totalTokens = executions.reduce((sum, e) => sum + e.totalTokens, 0)
  const totalPromptTokens = executions.reduce((sum, e) => sum + e.promptTokens, 0)
  const totalCompletionTokens = executions.reduce((sum, e) => sum + e.completionTokens, 0)

  let totalCost = 0
  const costByModel: Record<string, { tokens: number; cost: number; count: number }> = {}

  for (const log of executionLogs) {
    if (log.aiModel && log.promptTokens && log.completionTokens) {
      const cost = calculateTokenCostUSD(log.aiModel, log.promptTokens, log.completionTokens)
      totalCost += cost

      if (!costByModel[log.aiModel]) {
        costByModel[log.aiModel] = { tokens: 0, cost: 0, count: 0 }
      }
      costByModel[log.aiModel].tokens += log.promptTokens + log.completionTokens
      costByModel[log.aiModel].cost += cost
      costByModel[log.aiModel].count++
    }
  }

  const trendMap = new Map<string, { tokens: number; cost: number; executions: number }>()

  for (const execution of executions) {
    const date = execution.createdAt.toISOString().split('T')[0]
    if (!trendMap.has(date)) {
      trendMap.set(date, { tokens: 0, cost: 0, executions: 0 })
    }
    const item = trendMap.get(date)!
    item.tokens += execution.totalTokens
    item.executions++
    if (execution.estimatedCost) {
      item.cost += Number(execution.estimatedCost)
    }
  }

  const trend = Array.from(trendMap.entries())
    .map(([date, data]) => ({
      date,
      tokens: data.tokens,
      cost: data.cost,
      executions: data.executions,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const modelBreakdown = Object.entries(costByModel)
    .map(([model, data]) => ({
      model,
      tokens: data.tokens,
      cost: Number(data.cost.toFixed(4)),
      count: data.count,
      percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost)

  return ApiResponse.success({
    summary: {
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalCost: Number(totalCost.toFixed(4)),
      totalExecutions: executions.length,
      avgCostPerExecution: executions.length > 0 ? Number((totalCost / executions.length).toFixed(4)) : 0,
      avgTokensPerExecution: executions.length > 0 ? Math.round(totalTokens / executions.length) : 0,
    },
    trend,
    modelBreakdown,
  })
})
