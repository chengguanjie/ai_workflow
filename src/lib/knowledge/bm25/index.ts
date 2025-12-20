/**
 * BM25 索引模块
 * 实现 BM25 算法用于关键词检索
 * 支持倒排索引构建和查询
 */

import { segment, segmentBatch, type SegmentOptions } from './segmenter'

/**
 * BM25 参数
 */
export interface BM25Config {
  k1?: number  // 词频饱和参数，默认 1.5
  b?: number   // 文档长度归一化参数，默认 0.75
  delta?: number  // BM25+ 的 delta 参数，默认 0（不使用 BM25+）
}

/**
 * 文档
 */
export interface Document {
  id: string
  content: string
  metadata?: Record<string, unknown>
}

/**
 * 搜索结果
 */
export interface BM25SearchResult {
  id: string
  score: number
  matchedTerms: string[]
  termFrequencies: Map<string, number>
}

/**
 * 倒排索引条目
 */
interface PostingEntry {
  docId: string
  termFreq: number
  positions: number[]  // 词在文档中的位置
}

/**
 * 倒排索引
 */
interface InvertedIndex {
  // term -> posting list
  postings: Map<string, PostingEntry[]>
  // 文档长度 (词数)
  docLengths: Map<string, number>
  // 文档总数
  docCount: number
  // 平均文档长度
  avgDocLength: number
  // 文档 ID -> 原始内容（用于高亮等）
  documents: Map<string, Document>
}

/**
 * BM25 索引类
 */
export class BM25Index {
  private index: InvertedIndex = {
    postings: new Map(),
    docLengths: new Map(),
    docCount: 0,
    avgDocLength: 0,
    documents: new Map(),
  }

  private config: Required<BM25Config>
  private segmentOptions: SegmentOptions

  constructor(config: BM25Config = {}, segmentOptions: SegmentOptions = {}) {
    this.config = {
      k1: config.k1 ?? 1.5,
      b: config.b ?? 0.75,
      delta: config.delta ?? 0,
    }
    this.segmentOptions = {
      mode: 'search',
      removeStopWords: true,
      toLowerCase: true,
      minLength: 1,
      ...segmentOptions,
    }
  }

  /**
   * 添加单个文档到索引
   */
  async addDocument(doc: Document): Promise<void> {
    const terms = await segment(doc.content, this.segmentOptions)
    this.indexDocument(doc, terms)
  }

  /**
   * 批量添加文档到索引
   */
  async addDocuments(docs: Document[]): Promise<void> {
    const contents = docs.map(d => d.content)
    const termsList = await segmentBatch(contents, this.segmentOptions)

    for (let i = 0; i < docs.length; i++) {
      this.indexDocument(docs[i], termsList[i])
    }
  }

  /**
   * 索引单个文档（内部方法）
   */
  private indexDocument(doc: Document, terms: string[]): void {
    // 存储文档
    this.index.documents.set(doc.id, doc)

    // 存储文档长度
    this.index.docLengths.set(doc.id, terms.length)

    // 统计词频和位置
    const termFreq = new Map<string, number>()
    const termPositions = new Map<string, number[]>()

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i]
      termFreq.set(term, (termFreq.get(term) || 0) + 1)

      const positions = termPositions.get(term) || []
      positions.push(i)
      termPositions.set(term, positions)
    }

    // 更新倒排索引
    for (const [term, freq] of termFreq) {
      const postings = this.index.postings.get(term) || []
      postings.push({
        docId: doc.id,
        termFreq: freq,
        positions: termPositions.get(term) || [],
      })
      this.index.postings.set(term, postings)
    }

    // 更新统计信息
    this.index.docCount++
    this.updateAvgDocLength()
  }

  /**
   * 从索引中删除文档
   */
  removeDocument(docId: string): boolean {
    if (!this.index.documents.has(docId)) {
      return false
    }

    // 从倒排索引中删除
    for (const [term, postings] of this.index.postings) {
      const filtered = postings.filter(p => p.docId !== docId)
      if (filtered.length === 0) {
        this.index.postings.delete(term)
      } else {
        this.index.postings.set(term, filtered)
      }
    }

    // 删除文档信息
    this.index.documents.delete(docId)
    this.index.docLengths.delete(docId)

    // 更新统计
    this.index.docCount--
    this.updateAvgDocLength()

    return true
  }

  /**
   * 更新平均文档长度
   */
  private updateAvgDocLength(): void {
    if (this.index.docCount === 0) {
      this.index.avgDocLength = 0
      return
    }

    let totalLength = 0
    for (const length of this.index.docLengths.values()) {
      totalLength += length
    }
    this.index.avgDocLength = totalLength / this.index.docCount
  }

  /**
   * 搜索
   */
  async search(query: string, topK: number = 10): Promise<BM25SearchResult[]> {
    const queryTerms = await segment(query, this.segmentOptions)

    if (queryTerms.length === 0) {
      return []
    }

    // 计算每个文档的 BM25 分数
    const scores = new Map<string, { score: number; matchedTerms: string[]; termFreqs: Map<string, number> }>()

    for (const term of queryTerms) {
      const postings = this.index.postings.get(term)
      if (!postings) continue

      // 计算 IDF
      const idf = this.calculateIDF(postings.length)

      for (const posting of postings) {
        const docLength = this.index.docLengths.get(posting.docId) || 0

        // 计算 BM25 分数
        const termScore = this.calculateTermScore(
          posting.termFreq,
          docLength,
          idf
        )

        const existing = scores.get(posting.docId) || {
          score: 0,
          matchedTerms: [] as string[],
          termFreqs: new Map<string, number>(),
        }
        existing.score += termScore
        existing.matchedTerms.push(term)
        existing.termFreqs.set(term, posting.termFreq)
        scores.set(posting.docId, existing)
      }
    }

    // 排序并返回 top K
    const results = Array.from(scores.entries())
      .map(([id, data]) => ({
        id,
        score: data.score,
        matchedTerms: Array.from(new Set(data.matchedTerms)),
        termFrequencies: data.termFreqs,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return results
  }

  /**
   * 计算 IDF（逆文档频率）
   * 使用 Robertson-Sparck Jones 公式
   */
  private calculateIDF(docFreq: number): number {
    const N = this.index.docCount
    return Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5))
  }

  /**
   * 计算单个词的 BM25 分数
   */
  private calculateTermScore(
    termFreq: number,
    docLength: number,
    idf: number
  ): number {
    const { k1, b, delta } = this.config
    const avgDL = this.index.avgDocLength

    // BM25 公式
    const numerator = termFreq * (k1 + 1)
    const denominator = termFreq + k1 * (1 - b + b * (docLength / avgDL))

    // BM25+ 增加 delta
    return idf * (numerator / denominator + delta)
  }

  /**
   * 获取文档
   */
  getDocument(docId: string): Document | undefined {
    return this.index.documents.get(docId)
  }

  /**
   * 获取索引统计信息
   */
  getStats(): {
    docCount: number
    termCount: number
    avgDocLength: number
  } {
    return {
      docCount: this.index.docCount,
      termCount: this.index.postings.size,
      avgDocLength: this.index.avgDocLength,
    }
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.index = {
      postings: new Map(),
      docLengths: new Map(),
      docCount: 0,
      avgDocLength: 0,
      documents: new Map(),
    }
  }

  /**
   * 导出索引（用于持久化）
   */
  export(): {
    postings: Array<[string, PostingEntry[]]>
    docLengths: Array<[string, number]>
    documents: Array<[string, Document]>
    config: Required<BM25Config>
  } {
    return {
      postings: Array.from(this.index.postings.entries()),
      docLengths: Array.from(this.index.docLengths.entries()),
      documents: Array.from(this.index.documents.entries()),
      config: this.config,
    }
  }

  /**
   * 导入索引
   */
  import(data: {
    postings: Array<[string, PostingEntry[]]>
    docLengths: Array<[string, number]>
    documents: Array<[string, Document]>
    config?: Required<BM25Config>
  }): void {
    this.index.postings = new Map(data.postings)
    this.index.docLengths = new Map(data.docLengths)
    this.index.documents = new Map(data.documents)
    this.index.docCount = data.documents.length

    if (data.config) {
      this.config = data.config
    }

    this.updateAvgDocLength()
  }

  /**
   * 高亮匹配的词
   */
  highlightMatches(
    text: string,
    matchedTerms: string[],
    highlightTag: { start: string; end: string } = { start: '**', end: '**' }
  ): string {
    if (matchedTerms.length === 0) return text

    let result = text
    for (const term of matchedTerms) {
      const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi')
      result = result.replace(regex, `${highlightTag.start}$1${highlightTag.end}`)
    }

    return result
  }
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 创建知识库的 BM25 索引
 */
export async function createKnowledgeBaseBM25Index(
  documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>,
  config?: BM25Config
): Promise<BM25Index> {
  const index = new BM25Index(config)
  await index.addDocuments(documents)
  return index
}

import { prisma } from '@/lib/db'

const indexCache = new Map<string, { index: BM25Index; updatedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000

/**
 * 保存 BM25 索引到数据库
 */
export async function saveBM25Index(
  knowledgeBaseId: string,
  index: BM25Index
): Promise<void> {
  const exportedData = index.export()
  const stats = index.getStats()

  await prisma.bM25IndexCache.upsert({
    where: { knowledgeBaseId },
    create: {
      knowledgeBaseId,
      indexData: JSON.stringify(exportedData),
      documentCount: stats.docCount,
      termCount: stats.termCount,
    },
    update: {
      indexData: JSON.stringify(exportedData),
      documentCount: stats.docCount,
      termCount: stats.termCount,
      updatedAt: new Date(),
    },
  })

  indexCache.set(knowledgeBaseId, { index, updatedAt: Date.now() })
}

/**
 * 从数据库加载 BM25 索引
 */
export async function loadBM25Index(
  knowledgeBaseId: string
): Promise<BM25Index | null> {
  const cached = indexCache.get(knowledgeBaseId)
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return cached.index
  }

  const cacheRecord = await prisma.bM25IndexCache.findUnique({
    where: { knowledgeBaseId },
  })

  if (!cacheRecord) {
    return null
  }

  const index = new BM25Index()
  const indexData = JSON.parse(cacheRecord.indexData) as {
    postings: Array<[string, Array<{ docId: string; termFreq: number; positions: number[] }>]>
    docLengths: Array<[string, number]>
    documents: Array<[string, Document]>
    config?: Required<BM25Config>
  }
  index.import(indexData)

  indexCache.set(knowledgeBaseId, { index, updatedAt: Date.now() })
  return index
}

/**
 * 获取或创建 BM25 索引
 */
export async function getOrCreateBM25Index(
  knowledgeBaseId: string
): Promise<BM25Index> {
  let index = await loadBM25Index(knowledgeBaseId)

  if (!index) {
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

    index = new BM25Index()
    await index.addDocuments(
      chunks.map(c => ({
        id: c.id,
        content: c.content,
        metadata: (c.metadata as Record<string, unknown>) || {},
      }))
    )

    await saveBM25Index(knowledgeBaseId, index)
  }

  return index
}

/**
 * 删除 BM25 索引缓存
 */
export async function deleteBM25Index(knowledgeBaseId: string): Promise<void> {
  indexCache.delete(knowledgeBaseId)
  await prisma.bM25IndexCache.deleteMany({
    where: { knowledgeBaseId },
  })
}

/**
 * 使索引缓存失效
 */
export function invalidateBM25IndexCache(knowledgeBaseId: string): void {
  indexCache.delete(knowledgeBaseId)
}

// 导出分词器
export { segment, segmentBatch, extractKeywords } from './segmenter'
export type { SegmentOptions, SegmentResult } from './segmenter'
