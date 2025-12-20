/**
 * 知识库模块统一导出
 * 支持文档解析、向量嵌入、语义检索、查询增强等功能
 */

// 文档解析
export {
  parseDocument,
  getSupportedFileTypes,
  isFileTypeSupported,
  type ParsedDocument,
} from './parser'

// 文本分块
export {
  splitText,
  estimateChunkCount,
  mergeSmallChunks,
  type TextChunk,
  type ChunkingOptions,
} from './chunker'

// 向量嵌入
export {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  getEmbeddingDimension,
  type EmbeddingResult,
  type EmbeddingOptions,
} from './embedding'

// 搜索
export {
  searchKnowledgeBase,
  hybridSearch,
  getRelevantContext,
  getAdvancedRAGContext,
  buildRAGPrompt,
  searchAcrossKnowledgeBases,
  getCrossKnowledgeBaseRAGContext,
  type SearchOptions,
  type HybridSearchOptions,
  type SearchResult,
  type CrossKnowledgeBaseSearchOptions,
  type CrossKnowledgeBaseSearchResult,
  type CrossKnowledgeBaseSearchResponse,
} from './search'

// 文档处理
export {
  processDocument,
  reprocessDocument,
  processDocumentBatch,
  getDocumentProgress,
  cleanupFailedDocuments,
  type ProcessDocumentOptions,
  type ProcessResult,
} from './processor'

// Token 计数
export {
  countTokens,
  estimateTokens,
  countTokensBatch,
  countTotalTokens,
  countChatTokens,
  truncateToTokenLimit,
  exceedsTokenLimit,
  remainingTokens,
} from './tokenizer'

// 查询增强
export {
  enhanceQuery,
  getSearchQueries,
  type QueryEnhanceOptions,
  type EnhancedQuery,
} from './query-enhance'

// 向量存储
export {
  createVectorStore,
  getDefaultVectorStore,
  getVectorStoreForKnowledgeBase,
  PgVectorStore,
  MemoryVectorStore,
  type VectorStore,
  type VectorDocument,
  type VectorSearchResult,
  type VectorSearchOptions,
  type VectorStoreConfig,
} from './vector-store'

// BM25 关键词检索
export {
  BM25Index,
  segment,
  segmentBatch,
  extractKeywords,
  createKnowledgeBaseBM25Index,
  type BM25Config,
  type BM25SearchResult,
  type SegmentOptions,
} from './bm25'

// 窗口扩展检索
export {
  expandSearchResults,
  getDocumentChunksOrdered,
  mergeAdjacentResults,
  type WindowExpansionOptions,
  type ExpandedSearchResult,
} from './window-expansion'

// 父文档检索
export {
  createTwoLevelChunks,
  aggregateToParentDocuments,
  highlightMatchedChildren,
  getParentContent,
  DEFAULT_TWO_LEVEL_CONFIG,
  type TwoLevelChunkConfig,
  type ParentChunk,
  type ChildChunk,
  type ParentDocumentSearchResult,
} from './parent-document'

// 清除缓存
export { clearBM25Cache } from './search'
