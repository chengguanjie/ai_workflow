/**
 * 知识库模块统一导出
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
  buildRAGPrompt,
  type SearchOptions,
  type SearchResult,
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
