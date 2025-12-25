
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  VectorStore,
  VectorStoreConfig,
  VectorDocument,
  VectorUpsertResult,
  VectorSearchOptions,
  VectorSearchResult,
} from './types'

export class SupabaseVectorStore implements VectorStore {
  readonly type = 'supabase'
  private client: SupabaseClient
  private tableName: string
  private functionName: string

  constructor(config: VectorStoreConfig['supabase']) {
    if (!config || !config.url || !config.key) {
      throw new Error('Supabase 向量存储配置缺失: url 和 key 是必须的')
    }
    this.client = createClient(config.url, config.key)
    this.tableName = config.tableName || 'knowledge_vectors'
    this.functionName = config.functionName || 'match_vectors'
  }

  static fromConfig(config: VectorStoreConfig): SupabaseVectorStore {
    return new SupabaseVectorStore(config.supabase)
  }

  async initialize(): Promise<void> {
    // 检查连接是否正常
    try {
      // 尝试查询一下表是否存在（或者权限是否正常）
      const { error } = await this.client
        .from(this.tableName)
        .select('id')
        .limit(1)

      if (error) {
        // 如果是 404 或表不存在错误，提示用户运行初始化 SQL
        if (error.code === 'PGRST204' || error.message.includes('does not exist') || error.code === '42P01') {
          console.warn(`[SupabaseVectorStore] 表 ${this.tableName} 不存在或不可访问。请在 Supabase SQL Editor 中运行以下 SQL 初始化数据库：`)
          console.warn(this.getInitializationSQL())
        } else {
          console.warn(`[SupabaseVectorStore] 连接检查警告:`, error)
        }
      }
    } catch (err) {
      console.warn(`[SupabaseVectorStore] 初始化检查失败:`, err)
    }
  }

  async upsert(
    collectionId: string,
    documents: VectorDocument[]
  ): Promise<VectorUpsertResult[]> {
    const results: VectorUpsertResult[] = []

    // 批量处理，Supabase 建议每批不超过 1000 条
    const batchSize = 100
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize)

      const rows = batch.map(doc => ({
        id: doc.id,
        collection_id: collectionId,
        content: doc.content,
        metadata: doc.metadata,
        embedding: doc.embedding
      }))

      const { error } = await this.client
        .from(this.tableName)
        .upsert(rows)

      if (error) {
        console.error(`[SupabaseVectorStore] 批量插入失败:`, error)
        // 标记这批全部失败
        batch.forEach(doc => {
          results.push({ id: doc.id, success: false })
        })
      } else {
        // 标记这批全部成功
        batch.forEach(doc => {
          results.push({ id: doc.id, success: true })
        })
      }
    }

    return results
  }

  async search(
    collectionId: string,
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const { topK, threshold = 0.0, filter } = options

    const rpcParams = {
      query_embedding: queryVector,
      match_threshold: threshold,
      match_count: topK,
      filter: filter || {},
      collection_id_filter: collectionId
    }

    const { data: result, error } = await this.client.rpc(
      this.functionName,
      rpcParams
    )

    if (error) {
      console.error(`[SupabaseVectorStore] 向量搜索失败:`, error)
      throw new Error(`Supabase search failed: ${error.message}`)
    }

    if (!result) return []

    interface RpcResult {
      id: string
      content: string
      metadata: Record<string, unknown>
      similarity: number
    }

    return (result as RpcResult[]).map(item => ({
      id: item.id,
      content: item.content,
      score: item.similarity,
      metadata: item.metadata
    }))
  }

  async delete(collectionId: string, ids: string[]): Promise<number> {
    const { count, error } = await this.client
      .from(this.tableName)
      .delete({ count: 'exact' })
      .eq('collection_id', collectionId)
      .in('id', ids)

    if (error) {
      console.error(`[SupabaseVectorStore] 删除失败:`, error)
      throw error
    }

    return count || 0
  }

  async deleteAll(collectionId: string): Promise<number> {
    const { count, error } = await this.client
      .from(this.tableName)
      .delete({ count: 'exact' })
      .eq('collection_id', collectionId)

    if (error) {
      console.error(`[SupabaseVectorStore] 全部删除失败:`, error)
      throw error
    }

    return count || 0
  }

  async count(collectionId: string): Promise<number> {
    const { count, error } = await this.client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('collection_id', collectionId)

    if (error) {
      console.error(`[SupabaseVectorStore] 计数失败:`, error)
      throw error
    }

    return count || 0
  }

  async close(): Promise<void> {
    // Supabase client (REST) 不需要显式关闭连接
    return Promise.resolve()
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .select('id')
        .limit(1)

      return !error || (error.code !== 'PGRST204' && error.code !== '42P01')
    } catch {
      return false
    }
  }

  private getInitializationSQL(): string {
    return `
-- 开启 pgvector 扩展
create extension if not exists vector;

-- 创建向量表
create table if not exists ${this.tableName} (
  id text primary key,
  collection_id text not null,
  content text,
  metadata jsonb,
  embedding vector(1536)
);

-- 创建索引 (HNSW)
create index if not exists ${this.tableName}_embedding_idx 
  on ${this.tableName} 
  using hnsw (embedding vector_cosine_ops);

-- 创建索引 (collection_id)
create index if not exists ${this.tableName}_collection_id_idx 
  on ${this.tableName} (collection_id);

-- 创建搜索函数
create or replace function ${this.functionName} (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  collection_id_filter text,
  filter jsonb default '{}'
)
returns table (
  id text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ${this.tableName}.id,
    ${this.tableName}.content,
    ${this.tableName}.metadata,
    1 - (${this.tableName}.embedding <=> query_embedding) as similarity
  from ${this.tableName}
  where ${this.tableName}.collection_id = collection_id_filter
  and 1 - (${this.tableName}.embedding <=> query_embedding) > match_threshold
  and ${this.tableName}.metadata @> filter
  order by ${this.tableName}.embedding <=> query_embedding
  limit match_count;
end;
$$;
    `
  }
}
