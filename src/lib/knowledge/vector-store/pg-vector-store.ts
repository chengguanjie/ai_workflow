/**
 * PgVectorStore - PostgreSQL pgvector 向量存储实现
 * 使用 pgvector 扩展进行高效的向量相似度搜索
 * 支持 Supabase、本地 PostgreSQL 等多种部署方式
 */

import { Pool, PoolClient, PoolConfig } from 'pg'
import type {
  VectorStore,
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  VectorUpsertResult,
  VectorStoreConfig,
} from './types'
import { getSafeTableName, getSafeIndexName, SQLValidationError } from '@/lib/security/sql-validator'

export interface PgVectorConfig {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  tableName?: string
  dimensions?: number
  indexType?: 'ivfflat' | 'hnsw'
  indexOptions?: {
    lists?: number      // IVFFlat 的列表数
    m?: number          // HNSW 的 M 参数
    efConstruction?: number  // HNSW 构建时的 ef 参数
  }
  maxConnections?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
}

/**
 * PostgreSQL pgvector 向量存储
 * 使用独立的 PostgreSQL 连接（与主 MySQL 数据库分离）
 */
export class PgVectorStore implements VectorStore {
  readonly type = 'pgvector'

  private pool: Pool | null = null
  private config: PgVectorConfig
  private tableName: string
  private dimensions: number
  private indexType: 'ivfflat' | 'hnsw'
  private initialized = false

  constructor(config: PgVectorConfig) {
    this.config = config
    // Validate table name to prevent SQL injection
    const tableName = config.tableName || 'vector_embeddings'
    this.tableName = getSafeTableName(tableName)
    this.dimensions = config.dimensions || 1536
    this.indexType = config.indexType || 'hnsw'
  }

  /**
   * 从 VectorStoreConfig 创建实例
   */
  static fromConfig(config: VectorStoreConfig): PgVectorStore {
    if (config.type !== 'pgvector' || !config.pgvector) {
      throw new Error('Invalid pgvector configuration')
    }
    return new PgVectorStore({
      connectionString: config.pgvector.connectionString,
      tableName: config.pgvector.tableName,
      dimensions: config.pgvector.dimensions,
      indexType: config.pgvector.indexType,
      indexOptions: config.pgvector.indexOptions,
    })
  }

  /**
   * 获取数据库连接池
   * 支持 Supabase 等云服务的 SSL 连接
   */
  private getPool(): Pool {
    if (!this.pool) {
      const poolConfig: PoolConfig = this.config.connectionString
        ? { connectionString: this.config.connectionString }
        : {
            host: this.config.host || 'localhost',
            port: this.config.port || 5432,
            database: this.config.database || 'vector_db',
            user: this.config.user || 'postgres',
            password: this.config.password,
          }

      poolConfig.max = this.config.maxConnections || 10
      poolConfig.idleTimeoutMillis = 30000
      poolConfig.connectionTimeoutMillis = 10000

      // Supabase 和其他云服务需要 SSL
      if (this.config.ssl !== undefined) {
        poolConfig.ssl = this.config.ssl
      } else if (this.config.connectionString?.includes('supabase')) {
        poolConfig.ssl = { rejectUnauthorized: false }
      }

      this.pool = new Pool(poolConfig)

      // 处理连接错误
      this.pool.on('error', (err) => {
        console.error('[PgVectorStore] 连接池错误:', err)
      })
    }
    return this.pool
  }

  /**
   * 初始化存储（创建表、索引等）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const client = await this.getPool().connect()
    try {
      // 启用 pgvector 扩展
      await client.query('CREATE EXTENSION IF NOT EXISTS vector')

      // 创建向量存储表
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id TEXT NOT NULL,
          collection_id TEXT NOT NULL,
          content TEXT,
          embedding vector(${this.dimensions}),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          PRIMARY KEY (collection_id, id)
        )
      `)

      // 创建索引
      await this.createVectorIndex(client)

      // 创建 collection_id 索引 - validate index name
      const collectionIndexName = getSafeIndexName(`idx_${this.tableName}_collection`)
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${collectionIndexName}
        ON ${this.tableName} (collection_id)
      `)

      // 创建元数据 GIN 索引（用于 JSONB 查询）- validate index name
      const metadataIndexName = getSafeIndexName(`idx_${this.tableName}_metadata`)
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${metadataIndexName}
        ON ${this.tableName} USING gin (metadata)
      `)

      this.initialized = true
      console.log('[PgVectorStore] 初始化完成')
    } finally {
      client.release()
    }
  }

  /**
   * 创建向量索引
   */
  private async createVectorIndex(client: PoolClient): Promise<void> {
    // Validate index name to prevent SQL injection
    const indexName = getSafeIndexName(`idx_${this.tableName}_embedding_${this.indexType}`)

    // 检查索引是否存在
    const { rows } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = $1 AND indexname = $2
    `, [this.tableName, indexName])

    if (rows.length > 0) {
      return // 索引已存在
    }

    // 根据索引类型创建索引
    if (this.indexType === 'hnsw') {
      const m = this.config.indexOptions?.m || 16
      const efConstruction = this.config.indexOptions?.efConstruction || 64

      await client.query(`
        CREATE INDEX ${indexName}
        ON ${this.tableName}
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = ${m}, ef_construction = ${efConstruction})
      `)
      console.log(`[PgVectorStore] 创建 HNSW 索引: m=${m}, ef_construction=${efConstruction}`)
    } else {
      const lists = this.config.indexOptions?.lists || 100

      await client.query(`
        CREATE INDEX ${indexName}
        ON ${this.tableName}
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = ${lists})
      `)
      console.log(`[PgVectorStore] 创建 IVFFlat 索引: lists=${lists}`)
    }
  }

  /**
   * 插入或更新向量
   */
  async upsert(
    collectionId: string,
    documents: VectorDocument[]
  ): Promise<VectorUpsertResult[]> {
    await this.initialize()

    const results: VectorUpsertResult[] = []
    const client = await this.getPool().connect()

    try {
      await client.query('BEGIN')

      for (const doc of documents) {
        try {
          // 将向量转换为 pgvector 格式
          const embeddingStr = `[${doc.embedding.join(',')}]`

          await client.query(`
            INSERT INTO ${this.tableName} (id, collection_id, content, embedding, metadata, updated_at)
            VALUES ($1, $2, $3, $4::vector, $5, NOW())
            ON CONFLICT (collection_id, id)
            DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          `, [doc.id, collectionId, doc.content, embeddingStr, JSON.stringify(doc.metadata)])

          results.push({ id: doc.id, success: true })
        } catch (error) {
          console.error(`[PgVectorStore] 插入文档 ${doc.id} 失败:`, error)
          results.push({ id: doc.id, success: false })
        }
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return results
  }

  /**
   * 搜索相似向量
   */
  async search(
    collectionId: string,
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    await this.initialize()

    const { topK, threshold = 0, filter } = options
    const embeddingStr = `[${queryVector.join(',')}]`

    // 构建查询
    let query = `
      SELECT
        id,
        content,
        metadata,
        1 - (embedding <=> $1::vector) as score
      FROM ${this.tableName}
      WHERE collection_id = $2
    `
    const params: unknown[] = [embeddingStr, collectionId]

    // 添加元数据过滤条件
    if (filter && Object.keys(filter).length > 0) {
      const filterConditions: string[] = []
      let paramIndex = 3

      for (const [key, value] of Object.entries(filter)) {
        // 支持简单的相等过滤
        filterConditions.push(`metadata->>'${key}' = $${paramIndex}`)
        params.push(String(value))
        paramIndex++
      }

      if (filterConditions.length > 0) {
        query += ` AND ${filterConditions.join(' AND ')}`
      }
    }

    // 添加阈值过滤
    if (threshold > 0) {
      query += ` AND 1 - (embedding <=> $1::vector) >= ${threshold}`
    }

    // 排序和限制
    query += `
      ORDER BY embedding <=> $1::vector
      LIMIT ${topK}
    `

    const { rows } = await this.getPool().query(query, params)

    return rows.map(row => ({
      id: row.id,
      content: row.content || '',
      score: parseFloat(row.score),
      metadata: row.metadata || {},
    }))
  }

  /**
   * 批量搜索（多个查询向量）
   */
  async batchSearch(
    collectionId: string,
    queryVectors: number[][],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[][]> {
    // 并行执行多个搜索
    return Promise.all(
      queryVectors.map(vector => this.search(collectionId, vector, options))
    )
  }

  /**
   * 删除向量
   */
  async delete(collectionId: string, ids: string[]): Promise<number> {
    await this.initialize()

    if (ids.length === 0) return 0

    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
    const { rowCount } = await this.getPool().query(
      `DELETE FROM ${this.tableName} WHERE collection_id = $1 AND id IN (${placeholders})`,
      [collectionId, ...ids]
    )

    return rowCount || 0
  }

  /**
   * 删除集合中的所有向量
   */
  async deleteAll(collectionId: string): Promise<number> {
    await this.initialize()

    const { rowCount } = await this.getPool().query(
      `DELETE FROM ${this.tableName} WHERE collection_id = $1`,
      [collectionId]
    )

    return rowCount || 0
  }

  /**
   * 获取集合中的向量数量
   */
  async count(collectionId: string): Promise<number> {
    await this.initialize()

    const { rows } = await this.getPool().query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE collection_id = $1`,
      [collectionId]
    )

    return parseInt(rows[0].count, 10)
  }

  /**
   * 获取指定 ID 的向量
   */
  async get(collectionId: string, ids: string[]): Promise<VectorDocument[]> {
    await this.initialize()

    if (ids.length === 0) return []

    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
    const { rows } = await this.getPool().query(
      `SELECT id, content, embedding, metadata
       FROM ${this.tableName}
       WHERE collection_id = $1 AND id IN (${placeholders})`,
      [collectionId, ...ids]
    )

    return rows.map(row => ({
      id: row.id,
      content: row.content || '',
      embedding: parseVector(row.embedding),
      metadata: row.metadata || {},
    }))
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
      this.initialized = false
      console.log('[PgVectorStore] 连接池已关闭')
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getPool().connect()
      try {
        await client.query('SELECT 1')
        return true
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('[PgVectorStore] 健康检查失败:', error)
      return false
    }
  }

  /**
   * 获取集合统计信息
   */
  async getStats(collectionId: string): Promise<{
    count: number
    dimensions: number
    indexType: string
  }> {
    await this.initialize()

    const count = await this.count(collectionId)

    return {
      count,
      dimensions: this.dimensions,
      indexType: this.indexType,
    }
  }

  /**
   * 优化索引（在大量写入后调用）
   */
  async optimizeIndex(): Promise<void> {
    await this.initialize()

    // VACUUM ANALYZE 有助于优化查询性能
    await this.getPool().query(`VACUUM ANALYZE ${this.tableName}`)
    console.log('[PgVectorStore] 索引优化完成')
  }

  /**
   * 更新 HNSW 搜索参数（ef_search）
   */
  async setSearchParams(params: { efSearch?: number; probes?: number }): Promise<void> {
    const client = await this.getPool().connect()
    try {
      if (this.indexType === 'hnsw' && params.efSearch) {
        await client.query(`SET hnsw.ef_search = ${params.efSearch}`)
      } else if (this.indexType === 'ivfflat' && params.probes) {
        await client.query(`SET ivfflat.probes = ${params.probes}`)
      }
    } finally {
      client.release()
    }
  }
}

/**
 * 解析 pgvector 返回的向量字符串
 */
function parseVector(vectorStr: string | number[]): number[] {
  if (Array.isArray(vectorStr)) {
    return vectorStr
  }

  if (typeof vectorStr === 'string') {
    // pgvector 返回格式: "[0.1,0.2,0.3,...]"
    const cleaned = vectorStr.replace(/^\[|\]$/g, '')
    return cleaned.split(',').map(Number)
  }

  return []
}

export default PgVectorStore
