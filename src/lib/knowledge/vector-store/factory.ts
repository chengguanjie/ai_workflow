/**
 * 向量存储工厂
 * 根据配置创建适当的向量存储实例
 */

import type { VectorStore, VectorStoreConfig } from './types'
import { PgVectorStore } from './pg-vector-store'
import { MemoryVectorStore } from './memory-vector-store'
import { SupabaseVectorStore } from './supabase-vector-store'

// 缓存已创建的向量存储实例
const storeInstances: Map<string, VectorStore> = new Map()

/**
 * 创建向量存储实例
 * 根据配置类型自动选择实现
 */
export function createVectorStore(config: VectorStoreConfig): VectorStore {
  switch (config.type) {
    case 'pgvector':
      return PgVectorStore.fromConfig(config)

    case 'supabase':
      return SupabaseVectorStore.fromConfig(config)

    case 'memory':
      return MemoryVectorStore.fromConfig(config)

    case 'pinecone':
      throw new Error('Pinecone 向量存储尚未实现')

    case 'qdrant':
      throw new Error('Qdrant 向量存储尚未实现')

    case 'milvus':
      throw new Error('Milvus 向量存储尚未实现')

    default:
      throw new Error(`不支持的向量存储类型: ${config.type}`)
  }
}

/**
 * 获取默认向量存储
 * 优先使用 pgvector，如果不可用则降级到内存存储
 */
export async function getDefaultVectorStore(): Promise<VectorStore> {
  const cacheKey = 'default'

  // 检查缓存
  const cached = storeInstances.get(cacheKey)
  if (cached) {
    const healthy = await cached.healthCheck()
    if (healthy) return cached
    // 不健康则清除缓存
    storeInstances.delete(cacheKey)
  }

  // 优先尝试 Supabase (P0: 解决内存溢出)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && supabaseKey) {
    try {
      const supabaseStore = new SupabaseVectorStore({
        url: supabaseUrl,
        key: supabaseKey,
      })
      await supabaseStore.initialize()
      const healthy = await supabaseStore.healthCheck()

      if (healthy) {
        console.log('[VectorStore] 使用 Supabase 作为向量存储')
        storeInstances.set(cacheKey, supabaseStore)
        return supabaseStore
      } else {
        console.warn('[VectorStore] Supabase 连接正常但健康检查失败（可能表未创建），请检查控制台输出的初始化 SQL')
        // 虽然健康检查失败（可能只是表没建），但我们可以返回它，让上层有机会触发初始化或报错显式提示
        // 不过为了稳妥，这里如果连基本的 select 都挂了，可能确实有问题
        // 这里选择返回它，并在后续操作中报错，这样用户能看到具体的 SQL 提示
        storeInstances.set(cacheKey, supabaseStore)
        return supabaseStore
      }
    } catch (error) {
      console.warn('[VectorStore] Supabase 初始化失败，降级:', error)
    }
  }

  // 其次尝试本地 pgvector
  const pgConnectionString = process.env.PGVECTOR_DATABASE_URL
  if (pgConnectionString) {
    try {
      const pgStore = new PgVectorStore({
        connectionString: pgConnectionString,
        dimensions: getDefaultDimensions(),
        indexType: 'hnsw',
        indexOptions: {
          m: 16,
          efConstruction: 64,
        },
      })

      await pgStore.initialize()
      const healthy = await pgStore.healthCheck()

      if (healthy) {
        console.log('[VectorStore] 使用 pgvector 作为向量存储')
        storeInstances.set(cacheKey, pgStore)
        return pgStore
      }
    } catch (error) {
      console.warn('[VectorStore] pgvector 初始化失败，降级到内存存储:', error)
    }
  }

  // 降级到内存存储
  console.log('[VectorStore] 使用内存存储作为向量存储（降级方案）')
  const memoryStore = new MemoryVectorStore({
    maxSize: parseInt(process.env.MEMORY_VECTOR_MAX_SIZE || '50000', 10),
  })
  await memoryStore.initialize()
  storeInstances.set(cacheKey, memoryStore)

  return memoryStore
}

/**
 * 获取知识库专用的向量存储
 * 根据知识库配置创建或复用实例
 */
export async function getVectorStoreForKnowledgeBase(
  knowledgeBaseId: string,
  config?: Partial<VectorStoreConfig>
): Promise<VectorStore> {
  const cacheKey = `kb:${knowledgeBaseId}`

  // 检查缓存
  const cached = storeInstances.get(cacheKey)
  if (cached) {
    return cached
  }

  // 如果没有提供配置，使用默认存储
  if (!config || !config.type) {
    return getDefaultVectorStore()
  }

  const store = createVectorStore(config as VectorStoreConfig)
  await store.initialize()

  storeInstances.set(cacheKey, store)
  return store
}

/**
 * 关闭所有向量存储连接
 */
export async function closeAllVectorStores(): Promise<void> {
  for (const [key, store] of storeInstances) {
    try {
      await store.close()
      console.log(`[VectorStore] 已关闭存储: ${key}`)
    } catch (error) {
      console.error(`[VectorStore] 关闭存储失败 ${key}:`, error)
    }
  }
  storeInstances.clear()
}

/**
 * 清除指定的向量存储缓存
 */
export function clearVectorStoreCache(cacheKey?: string): void {
  if (cacheKey) {
    storeInstances.delete(cacheKey)
  } else {
    storeInstances.clear()
  }
}

/**
 * 获取默认的向量维度
 */
function getDefaultDimensions(): number {
  const model = process.env.DEFAULT_EMBEDDING_MODEL || 'text-embedding-ada-002'

  const dimensions: Record<string, number> = {
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

  return dimensions[model] || 1536
}

/**
 * 检查向量存储可用性
 */
export async function checkVectorStoreAvailability(): Promise<{
  pgvector: boolean
  memory: boolean
  recommended: 'pgvector' | 'memory' | 'supabase'
}> {
  let pgvectorAvailable = false
  const memoryAvailable = true

  // 检查 pgvector
  const pgConnectionString = process.env.PGVECTOR_DATABASE_URL
  if (pgConnectionString) {
    try {
      const pgStore = new PgVectorStore({
        connectionString: pgConnectionString,
      })
      await pgStore.initialize()
      pgvectorAvailable = await pgStore.healthCheck()
      await pgStore.close()
    } catch {
      pgvectorAvailable = false
    }
  }

  return {
    pgvector: pgvectorAvailable,
    memory: memoryAvailable,
    recommended: (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'supabase' : (pgvectorAvailable ? 'pgvector' : 'memory'),
  }
}
