/**
 * 向量存储抽象层类型定义
 * 支持多种向量数据库后端（pgvector、内存等）
 */

export interface VectorDocument {
  id: string
  content: string
  embedding: number[]
  metadata: Record<string, unknown>
}

export interface VectorSearchResult {
  id: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

export interface VectorSearchOptions {
  topK: number
  threshold?: number
  filter?: Record<string, unknown>
}

export interface VectorUpsertResult {
  id: string
  success: boolean
}

/**
 * 向量存储接口
 * 所有向量存储实现都必须实现此接口
 */
export interface VectorStore {
  /**
   * 存储类型标识
   */
  readonly type: string

  /**
   * 初始化存储（创建表、索引等）
   */
  initialize(): Promise<void>

  /**
   * 插入或更新向量
   */
  upsert(
    collectionId: string,
    documents: VectorDocument[]
  ): Promise<VectorUpsertResult[]>

  /**
   * 搜索相似向量
   */
  search(
    collectionId: string,
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]>

  /**
   * 删除向量
   */
  delete(collectionId: string, ids: string[]): Promise<number>

  /**
   * 删除集合中的所有向量
   */
  deleteAll(collectionId: string): Promise<number>

  /**
   * 获取集合中的向量数量
   */
  count(collectionId: string): Promise<number>

  /**
   * 关闭连接
   */
  close(): Promise<void>

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>
}

/**
 * 向量存储配置
 */
export interface VectorStoreConfig {
  type: 'pgvector' | 'memory' | 'pinecone' | 'qdrant' | 'milvus'

  // pgvector 配置
  pgvector?: {
    connectionString: string
    tableName?: string
    dimensions?: number
    indexType?: 'ivfflat' | 'hnsw'
    indexOptions?: {
      lists?: number     // IVFFlat 的列表数
      m?: number         // HNSW 的 M 参数
      efConstruction?: number  // HNSW 构建时的 ef 参数
    }
  }

  // 内存存储配置
  memory?: {
    maxSize?: number  // 最大存储条数
  }

  // Pinecone 配置
  pinecone?: {
    apiKey: string
    environment: string
    indexName: string
  }

  // Qdrant 配置
  qdrant?: {
    url: string
    apiKey?: string
    collectionName: string
  }
}

/**
 * 向量维度常量
 */
export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  'text-embedding-ada-002': 1536,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'doubao-embedding-large': 1024,
  'doubao-embedding': 1024,
  'bge-m3': 1024,
  'bge-large-zh-v1.5': 1024,
  'bge-large-zh': 1024,
  'bge-base-zh': 768,
  'bge-small-zh': 512,
}
