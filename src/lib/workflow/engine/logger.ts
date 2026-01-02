/**
 * 节点执行日志模块
 *
 * 负责保存节点执行日志到数据库
 */

import { prisma } from '@/lib/db'
import type { NodeConfig } from '@/types/workflow'
import type { NodeOutput } from '../types'
import { NODE_TYPE_DB_MAP } from './types'
import { estimateTokenCount, truncateToTokenLimit } from '@/lib/ai/token-utils'
import { AIProvider, Prisma } from '@prisma/client'

// 日志大小限制配置
const LOG_SIZE_LIMITS = {
  MAX_TOKENS_PER_FIELD: 500, // 单个字段最大token数
  MAX_TOTAL_TOKENS: 1500,     // 总token数限制
  MAX_STRING_LENGTH: 2000,    // 字符串最大长度
  MAX_ARRAY_LENGTH: 20,       // 数组最大长度
  MAX_OBJECT_DEPTH: 3,        // 对象最大深度
}

/**
 * 智能截断对象，保留重要信息
 */
function truncateObject(obj: unknown, depth: number = 0): unknown {
  if (depth > LOG_SIZE_LIMITS.MAX_OBJECT_DEPTH) {
    return '[truncated: max depth]'
  }

  if (obj === null || obj === undefined) {
    return obj
  }

  // 处理基本类型
  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.length > LOG_SIZE_LIMITS.MAX_STRING_LENGTH) {
      return truncateToTokenLimit(obj, LOG_SIZE_LIMITS.MAX_TOKENS_PER_FIELD)
    }
    return obj
  }

  // 处理数组
  if (Array.isArray(obj)) {
    const truncated = obj.slice(0, LOG_SIZE_LIMITS.MAX_ARRAY_LENGTH)
      .map(item => truncateObject(item, depth + 1))

    if (obj.length > LOG_SIZE_LIMITS.MAX_ARRAY_LENGTH) {
      truncated.push(`[... ${obj.length - LOG_SIZE_LIMITS.MAX_ARRAY_LENGTH} more items]`)
    }

    return truncated
  }

  // 处理对象
  const result: Record<string, unknown> = {}
  const entries = Object.entries(obj as Record<string, unknown>)
  let tokenCount = 0
  const priorityKeys = ['error', 'message', 'status', 'result', 'data', 'content', 'text']

  // 先处理优先级高的键
  for (const key of priorityKeys) {
    if (key in (obj as Record<string, unknown>)) {
      const value = truncateObject((obj as Record<string, unknown>)[key], depth + 1)
      const valueStr = JSON.stringify(value)
      const tokens = estimateTokenCount(valueStr)

      if (tokenCount + tokens < LOG_SIZE_LIMITS.MAX_TOKENS_PER_FIELD) {
        result[key] = value
        tokenCount += tokens
      }
    }
  }

  // 处理其他键
  for (const [key, value] of entries) {
    if (priorityKeys.includes(key) || key in result) continue

    const truncatedValue = truncateObject(value, depth + 1)
    const valueStr = JSON.stringify(truncatedValue)
    const tokens = estimateTokenCount(valueStr)

    if (tokenCount + tokens < LOG_SIZE_LIMITS.MAX_TOKENS_PER_FIELD) {
      result[key] = truncatedValue
      tokenCount += tokens
    } else {
      // 如果超出限制，添加截断标记
      if (!result._truncated) {
        result._truncated = true
        result._truncatedKeys = [] as string[]
      }
      ; (result._truncatedKeys as string[]).push(key)
    }
  }

  return result
}

/**
 * 保存节点执行日志
 */
export async function saveNodeLog(
  executionId: string,
  node: NodeConfig,
  result: NodeOutput
): Promise<void> {
  const dbNodeType = NODE_TYPE_DB_MAP[node.type] || 'PROCESS'

  // 截断输入和输出数据
  const truncatedInput = node.config ? truncateObject(node.config) : {}
  const truncatedOutput = result.data ? truncateObject(result.data) : undefined

  // 如果错误信息太长，也需要截断
  let truncatedError = result.error
  if (truncatedError && typeof truncatedError === 'string') {
    truncatedError = truncateToTokenLimit(truncatedError, LOG_SIZE_LIMITS.MAX_TOKENS_PER_FIELD)
  } else if (truncatedError && typeof truncatedError === 'object') {
    truncatedError = JSON.stringify(truncateObject(truncatedError))
  }

  await prisma.executionLog.create({
    data: {
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: dbNodeType,
      input: truncatedInput as Prisma.InputJsonValue,
      output: truncatedOutput as Prisma.InputJsonValue,
      status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
      aiProvider: result.aiProvider as unknown as AIProvider | undefined,
      aiModel: result.aiModel,
      promptTokens: result.tokenUsage?.promptTokens,
      completionTokens: result.tokenUsage?.completionTokens,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      duration: result.duration,
      error: truncatedError,
    },
  })
}

/**
 * 批量保存节点执行日志
 */
export async function saveNodeLogsBatch(
  executionId: string,
  logs: Array<{ node: NodeConfig; result: NodeOutput }>
): Promise<void> {
  const logData = logs.map(({ node, result }) => {
    const dbNodeType = NODE_TYPE_DB_MAP[node.type] || 'PROCESS'

    // 截断输入和输出数据
    const truncatedInput = node.config ? truncateObject(node.config) : {}
    const truncatedOutput = result.data ? truncateObject(result.data) : undefined

    // 如果错误信息太长，也需要截断
    let truncatedError = result.error
    if (truncatedError && typeof truncatedError === 'string') {
      truncatedError = truncateToTokenLimit(truncatedError, LOG_SIZE_LIMITS.MAX_TOKENS_PER_FIELD)
    } else if (truncatedError && typeof truncatedError === 'object') {
      truncatedError = JSON.stringify(truncateObject(truncatedError))
    }

    return {
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: dbNodeType,
      input: truncatedInput as Prisma.InputJsonValue,
      output: truncatedOutput as Prisma.InputJsonValue,
      status: result.status === 'success' ? 'COMPLETED' as const : 'FAILED' as const,
      aiProvider: result.aiProvider as unknown as AIProvider | undefined,
      aiModel: result.aiModel,
      promptTokens: result.tokenUsage?.promptTokens,
      completionTokens: result.tokenUsage?.completionTokens,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      duration: result.duration,
      error: truncatedError,
    }
  })

  await prisma.executionLog.createMany({
    data: logData,
  })
}
