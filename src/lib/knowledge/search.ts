/**
 * 知识库搜索服务
 * 基于向量相似度的语义搜索
 * 支持混合检索、重排序、查询增强等高级功能
 * 使用向量存储抽象层支持多种后端（pgvector、内存等）
 */

import { prisma } from '@/lib/db'
import { generateEmbedding, cosineSimilarity } from './embedding'
import { countTokens, truncateToTokenLimit } from './tokenizer'
import { getDefaultVectorStore, getVectorStoreForKnowledgeBase } from './vector-store'
import { BM25Index, segment } from './bm25'
import { expandSearchResults, type WindowExpansionOptions, type ExpandedSearchResult } from './window-expansion'
import type { VectorStore, VectorStoreConfig } from './vector-store'
import type { AIProvider, VectorStoreType } from '@prisma/client'

// BM25 索引缓存
const bm25IndexCache = new Map<string, { index: BM25Index; lastUpdated: Date }>()

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
  // 向量存储配置（可选，默认使用知识库配置）
  useVectorStore?: boolean  // 是否使用向量存储（默认 true，自动降级）
  vectorStoreType?: VectorStoreType
}

export interface HybridSearchOptions extends SearchOptions {
  // 混合检索权重配置
  vectorWeight?: number      // 向量检索权重 (0-1)，默认 0.7
  keywordWeight?: number     // 关键词检索权重 (0-1)，默认 0.3
  // 重排序配置
  enableRerank?: boolean     // 是否启用重排序
  rerankModel?: string       // 重排序模型
  rerankTopK?: number        // 重排序后返回数量
  // 查询增强
  enableQueryExpansion?: boolean  // 是否启用查询扩展
  // 窗口扩展配置
  enableWindowExpansion?: boolean  // 是否启用窗口扩展
  windowExpansionOptions?: WindowExpansionOptions
}

export interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
  metadata: Record<string, unknown>
  // 新增字段
  highlightedContent?: string  // 高亮后的内容
  matchedKeywords?: string[]   // 匹配的关键词
}

/**
 * 搜索知识库
 * 使用向量相似度进行语义搜索
 * 支持向量存储后端（pgvector）和内存搜索（降级方案）
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
    useVectorStore = true,
  } = options

  // 1. 生成查询的向量嵌入
  const queryEmbedding = await generateEmbedding(query, {
    provider: embeddingProvider,
    model: embeddingModel,
    apiKey,
    baseUrl,
  })

  // 2. 尝试使用向量存储进行搜索
  if (useVectorStore) {
    try {
      const vectorResults = await searchWithVectorStore(
        knowledgeBaseId,
        queryEmbedding.embedding,
        { topK, threshold }
      )
      if (vectorResults.length > 0) {
        return vectorResults
      }
      // 如果向量存储为空，降级到内存搜索
      console.log('[Search] 向量存储结果为空，降级到内存搜索')
    } catch (error) {
      console.warn('[Search] 向量存储搜索失败，降级到内存搜索:', error)
    }
  }

  // 3. 降级：从数据库获取所有分块并在内存中搜索
  return searchInMemory(knowledgeBaseId, queryEmbedding.embedding, { topK, threshold })
}

/**
 * 使用向量存储进行搜索
 */
async function searchWithVectorStore(
  knowledgeBaseId: string,
  queryVector: number[],
  options: { topK: number; threshold: number }
): Promise<SearchResult[]> {
  const vectorStore = await getVectorStoreForKnowledgeBase(knowledgeBaseId)

  const results = await vectorStore.search(knowledgeBaseId, queryVector, {
    topK: options.topK,
    threshold: options.threshold,
  })

  // 需要获取文档信息
  if (results.length === 0) return []

  const chunkIds = results.map((r: { id: string }) => r.id)
  const chunks = await prisma.documentChunk.findMany({
    where: { id: { in: chunkIds } },
    include: {
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
  })

  // 创建查找映射
  const chunkMap = new Map(chunks.map(c => [c.id, c]))

  return results
    .map((result: { id: string; content: string; score: number; metadata: Record<string, unknown> }) => {
      const chunk = chunkMap.get(result.id)
      if (!chunk) return null

      return {
        chunkId: chunk.id,
        documentId: chunk.document.id,
        documentName: chunk.document.fileName,
        content: result.content || chunk.content,
        score: result.score,
        metadata: result.metadata,
      }
    })
    .filter((r: SearchResult | null): r is SearchResult => r !== null)
}

/**
 * 内存搜索（降级方案）
 * 从数据库获取所有分块并在内存中计算相似度
 */
async function searchInMemory(
  knowledgeBaseId: string,
  queryVector: number[],
  options: { topK: number; threshold: number }
): Promise<SearchResult[]> {
  // 获取知识库中所有文档分块
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

  // 计算相似度并排序
  const scoredChunks = chunks
    .map((chunk) => {
      // 解析存储的向量
      const chunkEmbedding = parseEmbedding(chunk.embedding)
      if (!chunkEmbedding) {
        return null
      }

      // 计算余弦相似度
      const score = cosineSimilarity(queryVector, chunkEmbedding)

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
    .filter((result) => result.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topK)

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
 * 结合语义搜索和关键词匹配，支持可配置的权重和重排序
 */
export async function hybridSearch(
  options: HybridSearchOptions
): Promise<SearchResult[] | ExpandedSearchResult[]> {
  const {
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    enableRerank = false,
    rerankTopK,
  } = options

  // 验证权重配置
  if (vectorWeight + keywordWeight !== 1) {
    console.warn('[Search] 权重配置不等于1，将自动归一化')
  }
  const totalWeight = vectorWeight + keywordWeight
  const normalizedVectorWeight = vectorWeight / totalWeight
  const normalizedKeywordWeight = keywordWeight / totalWeight

  // 提取查询关键词
  const keywords = extractKeywords(options.query)

  // 并行执行向量搜索和关键词搜索
  const [vectorResults, keywordResults] = await Promise.all([
    searchKnowledgeBase(options),
    keywordSearch(
      options.knowledgeBaseId,
      options.query,
      options.topK * 2 // 获取更多结果用于合并
    ),
  ])

  // 合并结果
  const resultMap = new Map<string, SearchResult>()

  // 添加向量搜索结果
  for (const result of vectorResults) {
    const matchedKeywords = keywords.filter(kw =>
      result.content.toLowerCase().includes(kw.toLowerCase())
    )
    resultMap.set(result.chunkId, {
      ...result,
      score: result.score * normalizedVectorWeight,
      matchedKeywords,
      highlightedContent: highlightKeywords(result.content, keywords),
    })
  }

  // 合并关键词搜索结果
  for (const result of keywordResults) {
    const existing = resultMap.get(result.chunkId)
    const matchedKeywords = keywords.filter(kw =>
      result.content.toLowerCase().includes(kw.toLowerCase())
    )

    if (existing) {
      existing.score += result.score * normalizedKeywordWeight
      // 合并匹配的关键词
      existing.matchedKeywords = Array.from(
        new Set([...(existing.matchedKeywords || []), ...matchedKeywords])
      )
    } else {
      resultMap.set(result.chunkId, {
        ...result,
        score: result.score * normalizedKeywordWeight,
        matchedKeywords,
        highlightedContent: highlightKeywords(result.content, keywords),
      })
    }
  }

  // 过滤和排序
  let results = Array.from(resultMap.values())
    .filter(result => result.score >= options.threshold)
    .sort((a, b) => b.score - a.score)

  // 如果启用重排序，调用重排序服务
  if (enableRerank && results.length > 0) {
    results = await rerankResults(results, options.query, options)
  }

  // 返回 topK 结果
  const finalResults = results.slice(0, rerankTopK || options.topK)

  // 如果启用窗口扩展，返回扩展后的结果
  if (options.enableWindowExpansion && finalResults.length > 0) {
    return expandSearchResults(finalResults, options.windowExpansionOptions)
  }

  return finalResults
}

/**
 * 提取查询中的关键词
 * 使用 jieba 分词
 */
async function extractKeywordsFromQuery(query: string): Promise<string[]> {
  try {
    const words = await segment(query, {
      mode: 'search',
      removeStopWords: true,
      toLowerCase: true,
      minLength: 2,
    })
    return Array.from(new Set(words))
  } catch {
    // 降级到简单分词
    return query
      .toLowerCase()
      .split(/[\s,，。.!！?？、；;：:""''「」【】（）()]+/)
      .filter(k => k.length > 1)
  }
}

/**
 * 同步版本的提取关键词（兼容旧代码）
 */
function extractKeywords(query: string): string[] {
  // 中英文分词（简单版本）
  const keywords = query
    .toLowerCase()
    .split(/[\s,，。.!！?？、；;：:""''「」【】（）()]+/)
    .filter(k => k.length > 1)

  // 去重
  return Array.from(new Set(keywords))
}

/**
 * 高亮关键词
 */
function highlightKeywords(text: string, keywords: string[]): string {
  if (!keywords.length) return text

  let result = text
  for (const keyword of keywords) {
    // 转义正则特殊字符
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escapedKeyword})`, 'gi')
    result = result.replace(regex, '**$1**')
  }
  return result
}

/**
 * 重排序结果（使用 Reranker 模型）
 * 支持 Cohere、Jina 等重排序 API
 */
async function rerankResults(
  results: SearchResult[],
  query: string,
  options: HybridSearchOptions
): Promise<SearchResult[]> {
  const { rerankModel = 'jina-reranker-v2-base-multilingual' } = options

  try {
    // 调用重排序 API（这里以 Jina 为例）
    const apiKey = process.env.JINA_API_KEY
    if (!apiKey) {
      console.warn('[Rerank] Jina API Key 未配置，跳过重排序')
      return results
    }

    const response = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: rerankModel,
        query,
        documents: results.map(r => r.content),
        top_n: options.rerankTopK || options.topK,
      }),
    })

    if (!response.ok) {
      console.error('[Rerank] 重排序请求失败:', response.statusText)
      return results
    }

    const data = await response.json()

    // 根据重排序结果重新排序
    const rerankedResults: SearchResult[] = []
    for (const item of data.results) {
      const originalResult = results[item.index]
      if (originalResult) {
        rerankedResults.push({
          ...originalResult,
          score: item.relevance_score, // 使用重排序分数
        })
      }
    }

    return rerankedResults
  } catch (error) {
    console.error('[Rerank] 重排序失败:', error)
    return results
  }
}

/**
 * 关键词搜索
 * 使用 BM25 算法进行关键词检索
 */
async function keywordSearch(
  knowledgeBaseId: string,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    // 获取或构建 BM25 索引
    const bm25Index = await getOrBuildBM25Index(knowledgeBaseId)

    // 使用 BM25 搜索
    const bm25Results = await bm25Index.search(query, limit)

    if (bm25Results.length === 0) {
      return []
    }

    // 获取文档信息
    const chunkIds = bm25Results.map(r => r.id)
    const chunks = await prisma.documentChunk.findMany({
      where: { id: { in: chunkIds } },
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
          },
        },
      },
    })

    const chunkMap = new Map(chunks.map(c => [c.id, c]))

    // 归一化分数并返回结果
    const maxScore = bm25Results[0]?.score || 1
    const searchResults: SearchResult[] = []

    for (const result of bm25Results) {
      const chunk = chunkMap.get(result.id)
      if (!chunk) continue

      searchResults.push({
        chunkId: chunk.id,
        documentId: chunk.document.id,
        documentName: chunk.document.fileName,
        content: chunk.content,
        score: result.score / maxScore, // 归一化到 0-1
        metadata: (chunk.metadata as Record<string, unknown>) || {},
        matchedKeywords: result.matchedTerms,
      })
    }

    return searchResults
  } catch (error) {
    console.warn('[Search] BM25 搜索失败，降级到简单关键词匹配:', error)
    return fallbackKeywordSearch(knowledgeBaseId, query, limit)
  }
}

/**
 * 获取或构建 BM25 索引
 */
async function getOrBuildBM25Index(knowledgeBaseId: string): Promise<BM25Index> {
  const cacheKey = knowledgeBaseId
  const cached = bm25IndexCache.get(cacheKey)

  // 检查缓存是否有效（5分钟过期）
  if (cached && Date.now() - cached.lastUpdated.getTime() < 5 * 60 * 1000) {
    return cached.index
  }

  // 构建新索引
  const chunks = await prisma.documentChunk.findMany({
    where: {
      document: {
        knowledgeBaseId,
        status: 'COMPLETED',
      },
    },
    select: {
      id: true,
      content: true,
      metadata: true,
    },
  })

  const index = new BM25Index()
  await index.addDocuments(
    chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      metadata: (chunk.metadata as Record<string, unknown>) || {},
    }))
  )

  // 更新缓存
  bm25IndexCache.set(cacheKey, { index, lastUpdated: new Date() })

  return index
}

/**
 * 降级的关键词搜索（当 BM25 失败时）
 */
async function fallbackKeywordSearch(
  knowledgeBaseId: string,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  // 使用简单分词
  const keywords = await segment(query).catch(() =>
    query.toLowerCase().split(/[\s,，。.!！?？]+/).filter(k => k.length > 1)
  )

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
    const matched: string[] = []

    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        matchCount++
        matched.push(keyword)
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
      matchedKeywords: matched,
    }
  })
}

/**
 * 清除 BM25 索引缓存
 */
export function clearBM25Cache(knowledgeBaseId?: string): void {
  if (knowledgeBaseId) {
    bm25IndexCache.delete(knowledgeBaseId)
  } else {
    bm25IndexCache.clear()
  }
}

/**
 * 获取相关文档上下文
 * 用于 RAG 生成，使用准确的 token 计数
 */
export async function getRelevantContext(
  options: SearchOptions & { maxTokens?: number }
): Promise<string> {
  const { maxTokens = 4000 } = options

  const results = await searchKnowledgeBase(options)

  // 使用准确的 token 计数来拼接上下文
  let context = ''
  let currentTokens = 0

  for (const result of results) {
    const chunkContext = `[来源: ${result.documentName}]\n${result.content}\n\n`
    const chunkTokens = countTokens(chunkContext)

    // 检查是否会超过限制
    if (currentTokens + chunkTokens > maxTokens) {
      // 如果当前块太大，尝试截断
      if (context === '' && chunkTokens > maxTokens) {
        context = truncateToTokenLimit(chunkContext, maxTokens)
        break
      }
      break
    }

    context += chunkContext
    currentTokens += chunkTokens
  }

  return context.trim()
}

/**
 * 高级 RAG 上下文构建
 * 支持多知识库查询、上下文压缩等
 */
export async function getAdvancedRAGContext(
  options: HybridSearchOptions & {
    maxTokens?: number
    useHybridSearch?: boolean
    compressContext?: boolean
  }
): Promise<{
  context: string
  sources: Array<{ documentName: string; chunkId: string; score: number }>
  totalTokens: number
}> {
  const {
    maxTokens = 4000,
    useHybridSearch = true,
    compressContext = false,
  } = options

  // 选择搜索方式
  const results = useHybridSearch
    ? await hybridSearch(options)
    : await searchKnowledgeBase(options)

  // 构建上下文
  const contextParts: string[] = []
  const sources: Array<{ documentName: string; chunkId: string; score: number }> = []
  let currentTokens = 0

  for (const result of results) {
    let content = result.content

    // 如果启用上下文压缩，可以在这里添加压缩逻辑
    // 目前使用简单的截断策略
    if (compressContext && content.length > 500) {
      // 保留开头和结尾的关键信息
      content = content.slice(0, 250) + '\n...\n' + content.slice(-250)
    }

    const chunkContext = `<context source="${result.documentName}">\n${content}\n</context>`
    const chunkTokens = countTokens(chunkContext)

    if (currentTokens + chunkTokens > maxTokens) {
      break
    }

    contextParts.push(chunkContext)
    sources.push({
      documentName: result.documentName,
      chunkId: result.chunkId,
      score: result.score,
    })
    currentTokens += chunkTokens
  }

  return {
    context: contextParts.join('\n\n'),
    sources,
    totalTokens: currentTokens,
  }
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

/**
 * 跨知识库搜索选项
 */
export interface CrossKnowledgeBaseSearchOptions {
  // 用户 ID（用于权限过滤）
  userId: string
  // 组织 ID
  organizationId: string
  // 查询内容
  query: string
  // 知识库 ID 列表（可选，不指定则搜索所有可访问的知识库）
  knowledgeBaseIds?: string[]
  // 每个知识库返回的结果数量
  topKPerKnowledgeBase?: number
  // 最终返回的结果数量
  topK?: number
  // 相似度阈值
  threshold?: number
  // 是否使用混合搜索
  useHybridSearch?: boolean
  // 混合搜索权重
  vectorWeight?: number
  keywordWeight?: number
  // 是否启用重排序
  enableRerank?: boolean
  // API 配置（用于生成嵌入）
  apiKey?: string
  baseUrl?: string
  // 默认嵌入配置
  defaultEmbeddingModel?: string
  defaultEmbeddingProvider?: AIProvider
}

/**
 * 跨知识库搜索结果
 */
export interface CrossKnowledgeBaseSearchResult extends SearchResult {
  // 来源知识库信息
  knowledgeBaseId: string
  knowledgeBaseName: string
}

/**
 * 聚合后的跨知识库搜索响应
 */
export interface CrossKnowledgeBaseSearchResponse {
  results: CrossKnowledgeBaseSearchResult[]
  query: string
  totalResults: number
  searchedKnowledgeBases: Array<{
    id: string
    name: string
    resultCount: number
  }>
}

/**
 * 跨知识库搜索
 * 在多个知识库中搜索并聚合结果
 * 支持权限过滤、结果去重、智能排序
 */
export async function searchAcrossKnowledgeBases(
  options: CrossKnowledgeBaseSearchOptions
): Promise<CrossKnowledgeBaseSearchResponse> {
  const {
    userId,
    organizationId,
    query,
    knowledgeBaseIds,
    topKPerKnowledgeBase = 5,
    topK = 10,
    threshold = 0.7,
    useHybridSearch = true,
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    enableRerank = false,
    apiKey,
    baseUrl,
    defaultEmbeddingModel = 'text-embedding-ada-002',
    defaultEmbeddingProvider = 'OPENAI',
  } = options

  // 1. 获取用户可访问的知识库列表
  const accessibleKnowledgeBases = await getAccessibleKnowledgeBases(
    userId,
    organizationId,
    knowledgeBaseIds
  )

  if (accessibleKnowledgeBases.length === 0) {
    return {
      results: [],
      query,
      totalResults: 0,
      searchedKnowledgeBases: [],
    }
  }

  // 2. 并行搜索所有知识库
  const searchPromises = accessibleKnowledgeBases.map(async (kb) => {
    try {
      const searchOptions: HybridSearchOptions = {
        knowledgeBaseId: kb.id,
        query,
        topK: topKPerKnowledgeBase,
        threshold,
        embeddingModel: kb.embeddingModel || defaultEmbeddingModel,
        embeddingProvider: kb.embeddingProvider || defaultEmbeddingProvider,
        apiKey,
        baseUrl,
        vectorWeight,
        keywordWeight,
      }

      let results: SearchResult[]
      if (useHybridSearch) {
        const hybridResults = await hybridSearch({
          ...searchOptions,
          enableRerank: false, // 单个知识库不重排序，最后统一重排序
        })
        // hybridSearch 可能返回 ExpandedSearchResult[]
        results = hybridResults as SearchResult[]
      } else {
        results = await searchKnowledgeBase(searchOptions)
      }

      // 添加知识库信息到结果
      return results.map((result) => ({
        ...result,
        knowledgeBaseId: kb.id,
        knowledgeBaseName: kb.name,
      }))
    } catch (error) {
      console.warn(`[CrossSearch] 搜索知识库 ${kb.name} 失败:`, error)
      return []
    }
  })

  const allResults = await Promise.all(searchPromises)

  // 3. 聚合和去重结果
  const aggregatedResults = aggregateSearchResults(allResults.flat())

  // 4. 排序
  let sortedResults = aggregatedResults.sort((a, b) => b.score - a.score)

  // 5. 可选：跨知识库重排序
  if (enableRerank && sortedResults.length > 0) {
    sortedResults = await rerankCrossKnowledgeBaseResults(sortedResults, query)
  }

  // 6. 返回 topK 结果
  const finalResults = sortedResults.slice(0, topK)

  // 7. 统计每个知识库的结果数量
  const kbResultCounts = new Map<string, number>()
  for (const result of finalResults) {
    const count = kbResultCounts.get(result.knowledgeBaseId) || 0
    kbResultCounts.set(result.knowledgeBaseId, count + 1)
  }

  const searchedKnowledgeBases = accessibleKnowledgeBases.map((kb) => ({
    id: kb.id,
    name: kb.name,
    resultCount: kbResultCounts.get(kb.id) || 0,
  }))

  return {
    results: finalResults,
    query,
    totalResults: finalResults.length,
    searchedKnowledgeBases,
  }
}

/**
 * 获取用户可访问的知识库
 */
async function getAccessibleKnowledgeBases(
  userId: string,
  organizationId: string,
  specificIds?: string[]
): Promise<Array<{
  id: string
  name: string
  embeddingModel: string
  embeddingProvider: AIProvider
}>> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      departmentId: true,
    },
  })

  if (!user) return []

  // 构建基础查询条件
  const baseWhere: Record<string, unknown> = {
    organizationId,
    isActive: true,
  }

  // 如果指定了知识库 ID，添加过滤条件
  if (specificIds && specificIds.length > 0) {
    baseWhere.id = { in: specificIds }
  }

  // OWNER 和 ADMIN 可以访问所有知识库
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return prisma.knowledgeBase.findMany({
      where: baseWhere,
      select: {
        id: true,
        name: true,
        embeddingModel: true,
        embeddingProvider: true,
      },
    })
  }

  // 其他用户需要检查权限
  // 1. 自己创建的知识库
  // 2. 有显式权限的知识库
  // 3. 没有设置权限的知识库（使用默认权限）

  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: baseWhere,
    select: {
      id: true,
      name: true,
      embeddingModel: true,
      embeddingProvider: true,
      creatorId: true,
      permissions: true,
    },
  })

  const accessibleKBs: Array<{
    id: string
    name: string
    embeddingModel: string
    embeddingProvider: AIProvider
  }> = []

  for (const kb of knowledgeBases) {
    // 创建者拥有访问权限
    if (kb.creatorId === userId) {
      accessibleKBs.push({
        id: kb.id,
        name: kb.name,
        embeddingModel: kb.embeddingModel,
        embeddingProvider: kb.embeddingProvider,
      })
      continue
    }

    // 检查显式权限
    const hasPermission = await checkKnowledgeBasePermission(
      user,
      kb.permissions
    )
    if (hasPermission) {
      accessibleKBs.push({
        id: kb.id,
        name: kb.name,
        embeddingModel: kb.embeddingModel,
        embeddingProvider: kb.embeddingProvider,
      })
      continue
    }

    // 没有显式权限设置，使用默认权限规则（MEMBER 和 VIEWER 有查看权限）
    if (kb.permissions.length === 0 && (user.role === 'MEMBER' || user.role === 'VIEWER' || user.role === 'EDITOR')) {
      accessibleKBs.push({
        id: kb.id,
        name: kb.name,
        embeddingModel: kb.embeddingModel,
        embeddingProvider: kb.embeddingProvider,
      })
    }
  }

  return accessibleKBs
}

/**
 * 检查用户是否有知识库的访问权限
 */
async function checkKnowledgeBasePermission(
  user: { id: string; departmentId: string | null },
  permissions: Array<{
    targetType: string
    targetId: string | null
    permission: string
  }>
): Promise<boolean> {
  if (permissions.length === 0) return false

  for (const perm of permissions) {
    switch (perm.targetType) {
      case 'ALL':
        // 全企业权限
        return true
      case 'USER':
        // 用户权限
        if (perm.targetId === user.id) return true
        break
      case 'DEPARTMENT':
        // 部门权限
        if (user.departmentId && perm.targetId === user.departmentId) {
          return true
        }
        // TODO: 检查子部门权限
        break
    }
  }

  return false
}

/**
 * 聚合搜索结果
 * 去重并合并来自不同知识库的相同内容
 */
function aggregateSearchResults(
  results: CrossKnowledgeBaseSearchResult[]
): CrossKnowledgeBaseSearchResult[] {
  // 使用内容哈希进行去重
  const contentMap = new Map<string, CrossKnowledgeBaseSearchResult>()

  for (const result of results) {
    // 简单的内容指纹（取前200字符）
    const contentKey = result.content.slice(0, 200).trim().toLowerCase()

    const existing = contentMap.get(contentKey)
    if (existing) {
      // 保留分数更高的结果
      if (result.score > existing.score) {
        contentMap.set(contentKey, result)
      }
    } else {
      contentMap.set(contentKey, result)
    }
  }

  return Array.from(contentMap.values())
}

/**
 * 跨知识库结果重排序
 */
async function rerankCrossKnowledgeBaseResults(
  results: CrossKnowledgeBaseSearchResult[],
  query: string
): Promise<CrossKnowledgeBaseSearchResult[]> {
  const apiKey = process.env.JINA_API_KEY
  if (!apiKey) {
    console.warn('[CrossRerank] Jina API Key 未配置，跳过重排序')
    return results
  }

  try {
    const response = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'jina-reranker-v2-base-multilingual',
        query,
        documents: results.map((r) => r.content),
        top_n: results.length,
      }),
    })

    if (!response.ok) {
      console.error('[CrossRerank] 重排序请求失败:', response.statusText)
      return results
    }

    const data = await response.json()

    const rerankedResults: CrossKnowledgeBaseSearchResult[] = []
    for (const item of data.results) {
      const originalResult = results[item.index]
      if (originalResult) {
        rerankedResults.push({
          ...originalResult,
          score: item.relevance_score,
        })
      }
    }

    return rerankedResults
  } catch (error) {
    console.error('[CrossRerank] 重排序失败:', error)
    return results
  }
}

/**
 * 获取跨知识库的 RAG 上下文
 */
export async function getCrossKnowledgeBaseRAGContext(
  options: CrossKnowledgeBaseSearchOptions & {
    maxTokens?: number
    compressContext?: boolean
  }
): Promise<{
  context: string
  sources: Array<{
    documentName: string
    chunkId: string
    score: number
    knowledgeBaseName: string
  }>
  totalTokens: number
}> {
  const { maxTokens = 4000, compressContext = false } = options

  const searchResponse = await searchAcrossKnowledgeBases(options)

  const contextParts: string[] = []
  const sources: Array<{
    documentName: string
    chunkId: string
    score: number
    knowledgeBaseName: string
  }> = []
  let currentTokens = 0

  for (const result of searchResponse.results) {
    let content = result.content

    if (compressContext && content.length > 500) {
      content = content.slice(0, 250) + '\n...\n' + content.slice(-250)
    }

    const chunkContext = `<context source="${result.documentName}" kb="${result.knowledgeBaseName}">\n${content}\n</context>`
    const chunkTokens = countTokens(chunkContext)

    if (currentTokens + chunkTokens > maxTokens) {
      break
    }

    contextParts.push(chunkContext)
    sources.push({
      documentName: result.documentName,
      chunkId: result.chunkId,
      score: result.score,
      knowledgeBaseName: result.knowledgeBaseName,
    })
    currentTokens += chunkTokens
  }

  return {
    context: contextParts.join('\n\n'),
    sources,
    totalTokens: currentTokens,
  }
}
