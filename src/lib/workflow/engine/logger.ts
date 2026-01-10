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
import { redactDeep } from '@/lib/observability/redaction'

/**
 * 保存节点执行日志（完整内容，不截断）
 */
export async function saveNodeLog(
  executionId: string,
  node: NodeConfig,
  result: NodeOutput
): Promise<void> {
  const dbNodeType = NODE_TYPE_DB_MAP[node.type] || 'PROCESS'

  const inputSnapshot: Record<string, unknown> = {
    config: (node.config || {}) as Record<string, unknown>,
    runtime: result.input || null,
  }

  const safeInput = redactDeep(inputSnapshot) as Prisma.InputJsonValue
  const safeOutput = redactDeep(result.data || undefined) as Prisma.InputJsonValue
  const safeError = typeof result.error === 'string' ? String(redactDeep(result.error)) : result.error

  await prisma.executionLog.create({
    data: {
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: dbNodeType,
      input: safeInput,
      output: safeOutput,
      status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
      aiProvider: result.aiProvider as unknown as AIProvider | undefined,
      aiModel: result.aiModel,
      promptTokens: result.tokenUsage?.promptTokens,
      completionTokens: result.tokenUsage?.completionTokens,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      duration: result.duration,
      error: safeError,
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
    const inputSnapshot: Record<string, unknown> = {
      config: (node.config || {}) as Record<string, unknown>,
      runtime: result.input || null,
    }

    const safeInput = redactDeep(inputSnapshot) as Prisma.InputJsonValue
    const safeOutput = redactDeep(result.data || undefined) as Prisma.InputJsonValue
    const safeError = typeof result.error === 'string' ? String(redactDeep(result.error)) : result.error

    return {
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: dbNodeType,
      input: safeInput,
      output: safeOutput,
      status: result.status === 'success' ? 'COMPLETED' as const : 'FAILED' as const,
      aiProvider: result.aiProvider as unknown as AIProvider | undefined,
      aiModel: result.aiModel,
      promptTokens: result.tokenUsage?.promptTokens,
      completionTokens: result.tokenUsage?.completionTokens,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      duration: result.duration,
      error: safeError,
    }
  })

  await prisma.executionLog.createMany({
    data: logData,
  })
}
