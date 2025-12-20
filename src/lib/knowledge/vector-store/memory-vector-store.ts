/**
 * MemoryVectorStore - 内存向量存储实现
 * 用于开发测试或作为无 pgvector 环境的降级方案
 * 使用暴力搜索计算余弦相似度
 */

import type {
  VectorStore,
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  VectorUpsertResult,
  VectorStoreConfig,
} from './types'

export interface MemoryVectorConfig {
  maxSize?: number  // 最大存储条数（防止内存溢出）
  persistPath?: string  // 可选：持久化到文件的路径
}

interface StoredDocument {
  id: string
  content: string
  embedding: number[]
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/**
 * 内存向量存储
 * 适用于小规模数据或开发测试环境
 */
export class MemoryVectorStore implements VectorStore {
  readonly type = 'memory'

  private collections: Map<string, Map<string, StoredDocument>> = new Map()
  private maxSize: number
  private initialized = false

  constructor(config: MemoryVectorConfig = {}) {
    this.maxSize = config.maxSize || 100000
  }

  /**
   * 从 VectorStoreConfig 创建实例
   */
  static fromConfig(config: VectorStoreConfig): MemoryVectorStore {
    return new MemoryVectorStore({
      maxSize: config.memory?.maxSize,
    })
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    console.log('[MemoryVectorStore] 初始化完成')
  }

  /**
   * 获取或创建集合
   */
  private getCollection(collectionId: string): Map<string, StoredDocument> {
    let collection = this.collections.get(collectionId)
    if (!collection) {
      collection = new Map()
      this.collections.set(collectionId, collection)
    }
    return collection
  }

  /**
   * 插入或更新向量
   */
  async upsert(
    collectionId: string,
    documents: VectorDocument[]
  ): Promise<VectorUpsertResult[]> {
    await this.initialize()

    const collection = this.getCollection(collectionId)
    const results: VectorUpsertResult[] = []
    const now = new Date()

    for (const doc of documents) {
      try {
        // 检查容量限制
        if (collection.size >= this.maxSize && !collection.has(doc.id)) {
          console.warn(`[MemoryVectorStore] 已达到最大容量 ${this.maxSize}，跳过文档 ${doc.id}`)
          results.push({ id: doc.id, success: false })
          continue
        }

        const existing = collection.get(doc.id)
        collection.set(doc.id, {
          id: doc.id,
          content: doc.content,
          embedding: [...doc.embedding], // 复制数组
          metadata: { ...doc.metadata },
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        })

        results.push({ id: doc.id, success: true })
      } catch (error) {
        console.error(`[MemoryVectorStore] 插入文档 ${doc.id} 失败:`, error)
        results.push({ id: doc.id, success: false })
      }
    }

    return results
  }

  /**
   * 搜索相似向量（暴力搜索）
   */
  async search(
    collectionId: string,
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    await this.initialize()

    const { topK, threshold = 0, filter } = options
    const collection = this.getCollection(collectionId)

    const results: Array<VectorSearchResult & { _score: number }> = []

    for (const doc of collection.values()) {
      // 应用元数据过滤
      if (filter && !this.matchesFilter(doc.metadata, filter)) {
        continue
      }

      // 计算余弦相似度
      const score = cosineSimilarity(queryVector, doc.embedding)

      // 应用阈值过滤
      if (score < threshold) {
        continue
      }

      results.push({
        id: doc.id,
        content: doc.content,
        score,
        metadata: doc.metadata,
        _score: score,
      })
    }

    // 按分数排序并返回 topK
    return results
      .sort((a, b) => b._score - a._score)
      .slice(0, topK)
      .map(({ _score, ...rest }) => rest)
  }

  /**
   * 批量搜索
   */
  async batchSearch(
    collectionId: string,
    queryVectors: number[][],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[][]> {
    return Promise.all(
      queryVectors.map(vector => this.search(collectionId, vector, options))
    )
  }

  /**
   * 检查文档是否匹配过滤条件
   */
  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false
      }
    }
    return true
  }

  /**
   * 删除向量
   */
  async delete(collectionId: string, ids: string[]): Promise<number> {
    await this.initialize()

    const collection = this.getCollection(collectionId)
    let deletedCount = 0

    for (const id of ids) {
      if (collection.delete(id)) {
        deletedCount++
      }
    }

    return deletedCount
  }

  /**
   * 删除集合中的所有向量
   */
  async deleteAll(collectionId: string): Promise<number> {
    await this.initialize()

    const collection = this.collections.get(collectionId)
    if (!collection) return 0

    const count = collection.size
    this.collections.delete(collectionId)

    return count
  }

  /**
   * 获取集合中的向量数量
   */
  async count(collectionId: string): Promise<number> {
    await this.initialize()

    const collection = this.collections.get(collectionId)
    return collection?.size || 0
  }

  /**
   * 获取指定 ID 的向量
   */
  async get(collectionId: string, ids: string[]): Promise<VectorDocument[]> {
    await this.initialize()

    const collection = this.getCollection(collectionId)
    const results: VectorDocument[] = []

    for (const id of ids) {
      const doc = collection.get(id)
      if (doc) {
        results.push({
          id: doc.id,
          content: doc.content,
          embedding: [...doc.embedding],
          metadata: { ...doc.metadata },
        })
      }
    }

    return results
  }

  /**
   * 关闭连接（内存存储无需特殊处理）
   */
  async close(): Promise<void> {
    this.collections.clear()
    this.initialized = false
    console.log('[MemoryVectorStore] 已清理')
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return true
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalCollections: number
    totalDocuments: number
    memoryUsageEstimate: string
  } {
    let totalDocuments = 0
    let estimatedBytes = 0

    for (const collection of this.collections.values()) {
      totalDocuments += collection.size
      for (const doc of collection.values()) {
        // 估算每个文档的内存占用
        estimatedBytes += doc.content.length * 2 // 字符串
        estimatedBytes += doc.embedding.length * 8 // float64 数组
        estimatedBytes += JSON.stringify(doc.metadata).length * 2
        estimatedBytes += 100 // 对象开销
      }
    }

    return {
      totalCollections: this.collections.size,
      totalDocuments,
      memoryUsageEstimate: formatBytes(estimatedBytes),
    }
  }

  /**
   * 导出集合数据（用于持久化）
   */
  exportCollection(collectionId: string): VectorDocument[] {
    const collection = this.collections.get(collectionId)
    if (!collection) return []

    return Array.from(collection.values()).map(doc => ({
      id: doc.id,
      content: doc.content,
      embedding: [...doc.embedding],
      metadata: { ...doc.metadata },
    }))
  }

  /**
   * 导入集合数据
   */
  async importCollection(
    collectionId: string,
    documents: VectorDocument[]
  ): Promise<number> {
    const results = await this.upsert(collectionId, documents)
    return results.filter(r => r.success).length
  }
}

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
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

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

export default MemoryVectorStore
