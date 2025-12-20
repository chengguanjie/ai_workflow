/**
 * 向量存储模块
 * 提供统一的向量存储接口和多种后端实现
 */

export * from './types'
export * from './pg-vector-store'
export * from './memory-vector-store'
export {
  createVectorStore,
  getDefaultVectorStore,
  getVectorStoreForKnowledgeBase,
  closeAllVectorStores,
  clearVectorStoreCache,
  checkVectorStoreAvailability
} from './factory'
