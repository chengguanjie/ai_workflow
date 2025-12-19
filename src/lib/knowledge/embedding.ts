/**
 * 向量嵌入服务
 * 将文本转换为向量
 */

import type { AIProvider } from '@prisma/client'

export interface EmbeddingResult {
  embedding: number[]
  tokenUsage?: number
}

export interface EmbeddingOptions {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
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
 * 批量生成向量嵌入
 */
export async function generateEmbeddings(
  texts: string[],
  options: EmbeddingOptions
): Promise<EmbeddingResult[]> {
  // 并行处理，但限制并发数
  const batchSize = 10
  const results: EmbeddingResult[] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbedding(text, options))
    )
    results.push(...batchResults)
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
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`OpenAI 嵌入请求失败: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()

  return {
    embedding: data.data[0].embedding,
    tokenUsage: data.usage?.total_tokens,
  }
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
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`胜算云嵌入请求失败: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()

  return {
    embedding: data.data[0].embedding,
    tokenUsage: data.usage?.total_tokens,
  }
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
