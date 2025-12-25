import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { workflowService } from '@/server/services/workflow.service'

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

  const executionLogs = await prisma.executionLog.findMany({
    where: {
      execution: {
        workflowId,
        createdAt: { gte: startDate },
      },
    },
    select: {
      nodeId: true,
      nodeName: true,
      nodeType: true,
      status: true,
      duration: true,
      promptTokens: true,
      completionTokens: true,
    },
  })

  const nodeStatsMap = new Map<string, {
    nodeId: string
    nodeName: string
    nodeType: string
    executions: number
    successCount: number
    failureCount: number
    durations: number[]
    tokens: number[]
  }>()

  for (const log of executionLogs) {
    if (!nodeStatsMap.has(log.nodeId)) {
      nodeStatsMap.set(log.nodeId, {
        nodeId: log.nodeId,
        nodeName: log.nodeName,
        nodeType: log.nodeType,
        executions: 0,
        successCount: 0,
        failureCount: 0,
        durations: [],
        tokens: [],
      })
    }

    const stats = nodeStatsMap.get(log.nodeId)!
    stats.executions++

    if (log.status === 'COMPLETED') {
      stats.successCount++
    } else if (log.status === 'FAILED') {
      stats.failureCount++
    }

    if (log.duration) {
      stats.durations.push(log.duration)
    }

    const totalTokens = (log.promptTokens || 0) + (log.completionTokens || 0)
    if (totalTokens > 0) {
      stats.tokens.push(totalTokens)
    }
  }

  const nodes = Array.from(nodeStatsMap.values()).map(stats => {
    const avgDuration = stats.durations.length > 0
      ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
      : 0
    const maxDuration = stats.durations.length > 0
      ? Math.max(...stats.durations)
      : 0
    const minDuration = stats.durations.length > 0
      ? Math.min(...stats.durations)
      : 0
    const totalDuration = stats.durations.reduce((a, b) => a + b, 0)

    const avgTokens = stats.tokens.length > 0
      ? stats.tokens.reduce((a, b) => a + b, 0) / stats.tokens.length
      : 0
    const totalTokens = stats.tokens.reduce((a, b) => a + b, 0)

    return {
      nodeId: stats.nodeId,
      nodeName: stats.nodeName,
      nodeType: stats.nodeType,
      executions: stats.executions,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      successRate: stats.executions > 0 ? stats.successCount / stats.executions : 0,
      avgDuration: Math.round(avgDuration),
      maxDuration,
      minDuration,
      totalDuration,
      avgTokens: Math.round(avgTokens),
      totalTokens,
    }
  })

  nodes.sort((a, b) => b.executions - a.executions)

  return ApiResponse.success({
    nodes,
    summary: {
      totalNodes: nodes.length,
      totalExecutions: nodes.reduce((sum, n) => sum + n.executions, 0),
      totalTokens: nodes.reduce((sum, n) => sum + n.totalTokens, 0),
    },
  })
})
