/**
 * 节点执行日志模块
 *
 * 负责保存节点执行日志到数据库
 * 注意：输出数据不再截断，保存完整内容
 */

import { prisma } from '@/lib/db'
import type { NodeConfig } from '@/types/workflow'
import type { NodeOutput } from '../types'
import { NODE_TYPE_DB_MAP } from './types'
import { AIProvider, Prisma } from '@prisma/client'

/**
 * 保存节点执行日志（完整内容，不截断）
 */
export async function saveNodeLog(
  executionId: string,
  node: NodeConfig,
  result: NodeOutput
): Promise<void> {
  const dbNodeType = NODE_TYPE_DB_MAP[node.type] || 'PROCESS'

  await prisma.executionLog.create({
    data: {
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: dbNodeType,
      input: (node.config || {}) as Prisma.InputJsonValue,
      output: (result.data || undefined) as Prisma.InputJsonValue,
      status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
      aiProvider: result.aiProvider as unknown as AIProvider | undefined,
      aiModel: result.aiModel,
      promptTokens: result.tokenUsage?.promptTokens,
      completionTokens: result.tokenUsage?.completionTokens,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      duration: result.duration,
      error: result.error,
    },
  })
}

/**
 * 批量保存节点执行日志（完整内容，不截断）
 */
export async function saveNodeLogsBatch(
  executionId: string,
  logs: Array<{ node: NodeConfig; result: NodeOutput }>
): Promise<void> {
  const logData = logs.map(({ node, result }) => {
    const dbNodeType = NODE_TYPE_DB_MAP[node.type] || 'PROCESS'

    return {
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: dbNodeType,
      input: (node.config || {}) as Prisma.InputJsonValue,
      output: (result.data || undefined) as Prisma.InputJsonValue,
      status: result.status === 'success' ? 'COMPLETED' as const : 'FAILED' as const,
      aiProvider: result.aiProvider as unknown as AIProvider | undefined,
      aiModel: result.aiModel,
      promptTokens: result.tokenUsage?.promptTokens,
      completionTokens: result.tokenUsage?.completionTokens,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      duration: result.duration,
      error: result.error,
    }
  })

  await prisma.executionLog.createMany({
    data: logData,
  })
}
