/**
 * 向量嵌入服务
 * 将文本转换为向量
 * 支持 OpenAI / 胜算云等多个嵌入提供商
 * 包含使用量统计功能
 */

import type { AIProvider } from '@prisma/client'
import { prisma } from '@/lib/db'

export interface EmbeddingResult {
  embedding: number[]
  tokenUsage?: number
}

export interface EmbeddingOptions {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
  organizationId?: string
  knowledgeBaseId?: string
  documentId?: string
}

interface RetryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
}

async function recordEmbeddingUsage(
  options: EmbeddingOptions,
  tokenCount: number
): Promise<void> {
  if (!options.organizationId) return

  try {
    await prisma.embeddingUsage.create({
      data: {
        provider: options.provider,
        model: options.model,
        tokenCount,
        knowledgeBaseId: options.knowledgeBaseId,
        documentId: options.documentId,
        organizationId: options.organizationId,
      },
    })
  } catch (error) {
    console.warn('[Embedding] 记录使用量失败:', error)
  }
}

/**
 * 指数退避重试包装函数
 * 用于处理临时网络错误和 API 限流
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        console.error(`[Embedding] 重试 ${maxRetries} 次后仍然失败:`, lastError.message)
        throw lastError
      }

      // 检查是否为可重试的错误（网络错误、限流等）
      const isRetryable = isRetryableError(lastError)
      if (!isRetryable) {
        throw lastError
      }

      // 计算退避延迟（指数退避 + 随机抖动）
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      )

      console.warn(
        `[Embedding] 请求失败，${delay.toFixed(0)}ms 后重试 (${attempt + 1}/${maxRetries}):`,
        lastError.message
      )

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('重试失败')
}

/**
 * 判断错误是否可以重试
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()

  // 可重试的错误类型
  const retryablePatterns = [
    'timeout',
    'econnreset',
    'enotfound',
    'econnrefused',
    'socket hang up',
    'network',
    'rate limit',
    '429',
    '500',
    '502',
    '503',
    '504',
  ]

  return retryablePatterns.some(pattern => message.includes(pattern))
}

/**
 * 生成文本的向量嵌入
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions
): Promise<EmbeddingResult> {
  const { provider, model } = options

  switch (provider) {
    case 'OPENAI':
      return generateOpenAIEmbedding(text, model, options)
    case 'SHENSUAN':
      return generateShensuanEmbedding(text, model, options)
    default:
      throw new Error(`不支持的嵌入提供商: ${provider}`)
  }
}

/**
 * 批量生成向量嵌入（含使用量统计）
 */
export async function generateEmbeddings(
  texts: string[],
  options: EmbeddingOptions
): Promise<EmbeddingResult[]> {
  const batchSize = 10
  const results: EmbeddingResult[] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbedding(text, options))
    )
    results.push(...batchResults)
    totalTokens += batchResults.reduce((sum, r) => sum + (r.tokenUsage || 0), 0)
  }

  if (totalTokens > 0) {
    recordEmbeddingUsage(options, totalTokens).catch(() => {})
  }

  return results
}

/**
 * OpenAI 向量嵌入
 */
async function generateOpenAIEmbedding(
  text: string,
  model: string,
  options: EmbeddingOptions
): Promise<EmbeddingResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY
  const baseUrl = options.baseUrl || 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('OpenAI API Key 未配置')
  }

  return withRetry(
    async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s 超时

      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || 'text-embedding-ada-002',
            input: text,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            `OpenAI 嵌入请求失败 [${response.status}]: ${error.error?.message || response.statusText}`
          )
        }

        const data = await response.json()

        return {
          embedding: data.data[0].embedding,
          tokenUsage: data.usage?.total_tokens,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    },
    { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }
  )
}

/**
 * 胜算云向量嵌入（通过 OpenRouter 兼容接口）
 */
async function generateShensuanEmbedding(
  text: string,
  model: string,
  options: EmbeddingOptions
): Promise<EmbeddingResult> {
  const apiKey = options.apiKey || process.env.SHENSUAN_API_KEY
  const baseUrl = options.baseUrl || process.env.SHENSUAN_BASE_URL

  if (!apiKey || !baseUrl) {
    throw new Error('胜算云 API 配置不完整')
  }

  // 胜算云嵌入模型需要 openai/ 前缀
  let embeddingModel = model || 'text-embedding-ada-002'
  if (!embeddingModel.includes('/')) {
    embeddingModel = `openai/${embeddingModel}`
  }

  return withRetry(
    async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s 超时

      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: embeddingModel,
            input: text,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            `胜算云嵌入请求失败 [${response.status}]: ${error.error?.message || response.statusText}`
          )
        }

        const data = await response.json()

        return {
          embedding: data.data[0].embedding,
          tokenUsage: data.usage?.total_tokens,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    },
    { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }
  )
}

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('向量维度不匹配')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 获取向量维度
 */
export function getEmbeddingDimension(model: string): number {
  // 移除可能的前缀，如 openai/、bytedance/ 等
  const modelName = model.includes('/') ? model.split('/').pop()! : model

  const dimensions: Record<string, number> = {
    // OpenAI 模型
    'text-embedding-ada-002': 1536,
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    // 豆包模型
    'doubao-embedding-large': 1024,
    'doubao-embedding': 1024,
    // BGE 模型
    'bge-m3': 1024,
    'bge-large-zh-v1.5': 1024,
    'bge-large-zh': 1024,
    'bge-base-zh': 768,
    'bge-small-zh': 512,
  }

  return dimensions[modelName] || 1536
}

/**
 * 获取组织的 Embedding 使用量统计
 */
export async function getEmbeddingUsageStats(
  organizationId: string,
  options?: {
    startDate?: Date
    endDate?: Date
    knowledgeBaseId?: string
  }
): Promise<{
  totalTokens: number
  totalRequests: number
  byProvider: Record<string, { tokens: number; requests: number }>
  byModel: Record<string, { tokens: number; requests: number }>
  daily: Array<{ date: string; tokens: number; requests: number }>
}> {
  const where: Record<string, unknown> = { organizationId }

  if (options?.startDate) {
    where.createdAt = { gte: options.startDate }
  }
  if (options?.endDate) {
    where.createdAt = { ...((where.createdAt as Record<string, Date>) || {}), lte: options.endDate }
  }
  if (options?.knowledgeBaseId) {
    where.knowledgeBaseId = options.knowledgeBaseId
  }

  const usages = await prisma.embeddingUsage.findMany({ where })

  const byProvider: Record<string, { tokens: number; requests: number }> = {}
  const byModel: Record<string, { tokens: number; requests: number }> = {}
  const dailyMap: Record<string, { tokens: number; requests: number }> = {}

  let totalTokens = 0
  let totalRequests = 0

  for (const usage of usages) {
    totalTokens += usage.tokenCount
    totalRequests += usage.requestCount

    if (!byProvider[usage.provider]) {
      byProvider[usage.provider] = { tokens: 0, requests: 0 }
    }
    byProvider[usage.provider].tokens += usage.tokenCount
    byProvider[usage.provider].requests += usage.requestCount

    if (!byModel[usage.model]) {
      byModel[usage.model] = { tokens: 0, requests: 0 }
    }
    byModel[usage.model].tokens += usage.tokenCount
    byModel[usage.model].requests += usage.requestCount

    const dateKey = usage.createdAt.toISOString().split('T')[0]
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { tokens: 0, requests: 0 }
    }
    dailyMap[dateKey].tokens += usage.tokenCount
    dailyMap[dateKey].requests += usage.requestCount
  }

  const daily = Object.entries(dailyMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { totalTokens, totalRequests, byProvider, byModel, daily }
}
