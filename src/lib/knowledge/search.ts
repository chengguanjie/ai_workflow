/**
 * 知识库搜索服务
 * 基于向量相似度的语义搜索
 */

import { prisma } from '@/lib/db'
import { generateEmbedding, cosineSimilarity } from './embedding'
import type { AIProvider } from '@prisma/client'

export interface SearchOptions {
  knowledgeBaseId: string
  query: string
  topK: number
  threshold: number
  embeddingModel: string
  embeddingProvider: AIProvider
  // API 配置（从数据库获取）
  apiKey?: string
  baseUrl?: string
}

export interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

/**
 * 搜索知识库
 * 使用向量��似度进行语义搜索
 */
export async function searchKnowledgeBase(
  options: SearchOptions
): Promise<SearchResult[]> {
  const {
    knowledgeBaseId,
    query,
    topK,
    threshold,
    embeddingModel,
    embeddingProvider,
    apiKey,
    baseUrl,
  } = options

  // 1. 生成查询的向量嵌入
  const queryEmbedding = await generateEmbedding(query, {
    provider: embeddingProvider,
    model: embeddingModel,
    apiKey,
    baseUrl,
  })

  // 2. 获取知识库中所有文档分块
  const chunks = await prisma.documentChunk.findMany({
    where: {
      document: {
        knowledgeBaseId,
        status: 'COMPLETED',
      },
    },
    include: {
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
  })

  // 3. 计算相似度并排序
  const scoredChunks = chunks
    .map((chunk) => {
      // 解析存储的向量
      const chunkEmbedding = parseEmbedding(chunk.embedding)
      if (!chunkEmbedding) {
        return null
      }

      // 计算余弦相似度
      const score = cosineSimilarity(queryEmbedding.embedding, chunkEmbedding)

      return {
        chunkId: chunk.id,
        documentId: chunk.document.id,
        documentName: chunk.document.fileName,
        content: chunk.content,
        score,
        metadata: (chunk.metadata as Record<string, unknown>) || {},
      }
    })
    .filter((result): result is SearchResult => result !== null)
    .filter((result) => result.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return scoredChunks
}

/**
 * 解析存储的向量嵌入
 * 支持 JSON 字符串或直接存储的数组
 */
function parseEmbedding(embedding: unknown): number[] | null {
  if (!embedding) return null

  // 如果是字符串，尝试解析 JSON
  if (typeof embedding === 'string') {
    try {
      return JSON.parse(embedding)
    } catch {
      return null
    }
  }

  // 如果已经是数组
  if (Array.isArray(embedding)) {
    return embedding as number[]
  }

  return null
}

/**
 * 混合搜索（向量 + 关键词）
 * 结合语义搜索和关键词匹配
 */
export async function hybridSearch(
  options: SearchOptions & { keywordWeight?: number }
): Promise<SearchResult[]> {
  const { keywordWeight = 0.3 } = options

  // 执行向量搜索
  const vectorResults = await searchKnowledgeBase(options)

  // 执行关键词搜索
  const keywordResults = await keywordSearch(
    options.knowledgeBaseId,
    options.query,
    options.topK * 2 // 获取更多结果用于合并
  )

  // 合并结果
  const resultMap = new Map<string, SearchResult>()

  // 添加向量搜索结果
  for (const result of vectorResults) {
    resultMap.set(result.chunkId, {
      ...result,
      score: result.score * (1 - keywordWeight),
    })
  }

  // 合并关键词搜索结果
  for (const result of keywordResults) {
    const existing = resultMap.get(result.chunkId)
    if (existing) {
      existing.score += result.score * keywordWeight
    } else {
      resultMap.set(result.chunkId, {
        ...result,
        score: result.score * keywordWeight,
      })
    }
  }

  // 排序并返回
  return Array.from(resultMap.values())
    .filter((result) => result.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topK)
}

/**
 * 关键词搜索
 * 基于文本匹配的搜索
 */
async function keywordSearch(
  knowledgeBaseId: string,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  // 分词
  const keywords = query
    .toLowerCase()
    .split(/[\s,，。.!！?？]+/)
    .filter((k) => k.length > 1)

  if (keywords.length === 0) {
    return []
  }

  // 搜索包含关键词的分块
  const chunks = await prisma.documentChunk.findMany({
    where: {
      document: {
        knowledgeBaseId,
        status: 'COMPLETED',
      },
      OR: keywords.map((keyword) => ({
        content: {
          contains: keyword,
        },
      })),
    },
    include: {
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
    take: limit,
  })

  // 计算关键词匹配得分
  return chunks.map((chunk) => {
    const content = chunk.content.toLowerCase()
    let matchCount = 0

    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        matchCount++
      }
    }

    const score = matchCount / keywords.length

    return {
      chunkId: chunk.id,
      documentId: chunk.document.id,
      documentName: chunk.document.fileName,
      content: chunk.content,
      score,
      metadata: (chunk.metadata as Record<string, unknown>) || {},
    }
  })
}

/**
 * 获取相关文档上下文
 * 用于 RAG 生成
 */
export async function getRelevantContext(
  options: SearchOptions & { maxTokens?: number }
): Promise<string> {
  const { maxTokens = 4000 } = options

  const results = await searchKnowledgeBase(options)

  // 拼接上下文，确保不超过最大 token 数
  let context = ''
  let estimatedTokens = 0

  for (const result of results) {
    // 简单估算 token 数（中文约 2 字符/token，英文约 4 字符/token）
    const chunkTokens = Math.ceil(result.content.length / 2)

    if (estimatedTokens + chunkTokens > maxTokens) {
      break
    }

    context += `[来源: ${result.documentName}]\n${result.content}\n\n`
    estimatedTokens += chunkTokens
  }

  return context.trim()
}

/**
 * 构建 RAG 提示词
 */
export function buildRAGPrompt(
  context: string,
  query: string,
  systemPrompt?: string
): string {
  const defaultSystemPrompt = `你是一个知识库助手。请根据以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请诚实地说"根据现有资料无法回答这个问题"。
回答时请尽量引用来源。`

  return `${systemPrompt || defaultSystemPrompt}

## 参考资料
${context}

## 用户问题
${query}

## 回答`
}
