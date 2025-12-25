/**
 * 文档处理服务
 * 完整的文档上传、解析、分块和向量化流程
 * 增强的错误处理和恢复机制
 * 支持向量存储抽象层（pgvector、内存等）
 * 支持并发处理优化
 */

import pLimit from 'p-limit'
import { prisma } from '@/lib/db'
import { parseDocument } from './parser'
import { splitText, splitTextWithParentChild } from './chunker'
import { generateEmbeddings } from './embedding'
import { getVectorStoreForKnowledgeBase, VectorDocument } from './vector-store'
import type { KnowledgeDocument } from '@prisma/client'

// 并发限制
const CONCURRENT_DOCUMENT_LIMIT = 3

export type DocProcessStatus = KnowledgeDocument['status']

export interface ProcessDocumentOptions {
  documentId: string
  knowledgeBaseId: string
  fileName: string
  fileType: string
  fileBuffer?: Buffer
  filePath?: string
  chunkSize?: number
  chunkOverlap?: number
  embeddingProvider: string
  embeddingModel: string
  apiKey?: string
  baseUrl?: string
}

export interface ProcessResult {
  success: boolean
  documentId: string
  chunkCount: number
  error?: string
  errorDetails?: {
    stage: string
    message: string
    recoverable: boolean
  }
}

/**
 * 处理单个文档
 */
export async function processDocument(options: ProcessDocumentOptions): Promise<ProcessResult> {
  const {
    documentId,
    knowledgeBaseId,
    fileName,
    fileType,
    chunkSize = 500,
    chunkOverlap = 50,
    embeddingProvider,
    embeddingModel,
    apiKey,
    baseUrl
  } = options

  console.log(`[Processor] 开始处理文档: ${fileName} (${documentId})`)

  try {
    // 1. 解析
    console.log(`[Processor] 阶段1: 解析文档 ${fileName}`)
    await updateDocumentStatus(documentId, 'PROCESSING')

    let parsed
    if (options.fileBuffer) {
      parsed = await parseDocument(options.fileBuffer, fileType, fileName)
    } else {
      throw new Error('未提供文件内容 (fileBuffer)')
    }

    // 2. 分块
    console.log(`[Processor] 阶段2: 文本分块`)
    let chunks
    try {
      // 启用父子分块策略优化 (Index Small, Retrieve Big)
      // 如果 configured chunkSize 足够大 (>= 800)，则将其作为父块大小
      // 并生成较小的子块 (350 tokens) 进行索引
      if (chunkSize >= 800) {
        console.log(`[Processor] 使用父子分块策略 (Parent: ${chunkSize}, Child: 350)`)
        chunks = splitTextWithParentChild(parsed.text, {
          parentChunkSize: chunkSize,
          childChunkSize: 350,
          chunkOverlap,
        })
      } else {
        chunks = splitText(parsed.text, {
          chunkSize,
          chunkOverlap,
        })
      }
    } catch (chunkError) {
      const errorMessage = chunkError instanceof Error ? chunkError.message : '分块失败'
      console.error(`[Processor] 分块失败:`, errorMessage)
      await updateDocumentStatus(documentId, 'FAILED', `分块失败: ${errorMessage}`)
      return {
        success: false,
        documentId,
        chunkCount: 0,
        error: errorMessage,
        errorDetails: {
          stage: 'chunk',
          message: errorMessage,
          recoverable: true,
        },
      }
    }

    if (chunks.length === 0) {
      const errorMessage = '文档分块失败：没有生成任何分块'
      await updateDocumentStatus(documentId, 'FAILED', errorMessage)
      return {
        success: false,
        documentId,
        chunkCount: 0,
        error: errorMessage,
        errorDetails: {
          stage: 'chunk',
          message: errorMessage,
          recoverable: false,
        },
      }
    }

    console.log(`[Processor] 分块完成，共 ${chunks.length} 个分块`)

    // 3. 生成向量嵌入
    console.log(`[Processor] 阶段3: 生成向量嵌入`)
    let embeddings
    try {
      const chunkTexts = chunks.map((c) => c.content)
      embeddings = await generateEmbeddings(chunkTexts, {
        provider: embeddingProvider as any,
        model: embeddingModel,
        apiKey,
        baseUrl,
      })
    } catch (embedError) {
      const errorMessage = embedError instanceof Error ? embedError.message : '向量嵌入失败'
      console.error(`[Processor] 向量嵌入失败:`, errorMessage)
      await updateDocumentStatus(documentId, 'FAILED', `嵌入失败: ${errorMessage}`)
      return {
        success: false,
        documentId,
        chunkCount: 0,
        error: errorMessage,
        errorDetails: {
          stage: 'embed',
          message: errorMessage,
          recoverable: true, // 可以重试
        },
      }
    }

    console.log(`[Processor] 向量嵌入完成`)

    // 4. 保存分块到数据库（使用事务确保一致性）
    console.log(`[Processor] 阶段4: 保存分块到数据库`)
    const savedChunkIds: string[] = []
    try {
      await prisma.$transaction(async (tx) => {
        // 批量创建分块（分批处理避免单次过大）
        const batchSize = 100
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const chunkData = batch.map((chunk, index) => ({
            documentId,
            content: chunk.content,
            chunkIndex: chunk.index,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            embedding: JSON.stringify(embeddings[i + index].embedding),
            metadata: JSON.parse(JSON.stringify(chunk.metadata || {})),
          }))

          await tx.documentChunk.createMany({ data: chunkData })
        }

        // 更新文档状态
        await tx.knowledgeDocument.update({
          where: { id: documentId },
          data: {
            status: 'COMPLETED',
            chunkCount: chunks.length,
            processedAt: new Date(),
            errorMessage: null,
            metadata: JSON.parse(
              JSON.stringify({
                ...parsed.metadata,
                chunkSize,
                chunkOverlap,
                processingTime: Date.now(),
              })
            ),
          },
        })

        // 更新知识库统计
        await tx.knowledgeBase.update({
          where: { id: knowledgeBaseId },
          data: {
            chunkCount: { increment: chunks.length },
          },
        })
      })

      // 获取保存的分块 ID
      const savedChunks = await prisma.documentChunk.findMany({
        where: { documentId },
        select: { id: true, chunkIndex: true },
        orderBy: { chunkIndex: 'asc' },
      })
      savedChunkIds.push(...savedChunks.map(c => c.id))
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : '保存失败'
      console.error(`[Processor] 保存分块失败:`, errorMessage)
      await updateDocumentStatus(documentId, 'FAILED', `保存失败: ${errorMessage}`)
      return {
        success: false,
        documentId,
        chunkCount: 0,
        error: errorMessage,
        errorDetails: {
          stage: 'save',
          message: errorMessage,
          recoverable: true,
        },
      }
    }

    // 5. 同步向量到向量存储（异步，不阻塞主流程）
    console.log(`[Processor] 阶段5: 同步向量到向量存储`)
    syncToVectorStore(
      knowledgeBaseId,
      savedChunkIds,
      chunks,
      embeddings
    ).catch(error => {
      console.warn(`[Processor] 向量存储同步失败（不影响主流程）:`, error)
    })

    console.log(`[Processor] 文档处理完成: ${fileName}`)

    return {
      success: true,
      documentId,
      chunkCount: chunks.length,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    console.error(`[Processor] 文档处理异常:`, errorMessage)

    // 更新文档状态为失败
    await updateDocumentStatus(documentId, 'FAILED', errorMessage)

    return {
      success: false,
      documentId,
      chunkCount: 0,
      error: errorMessage,
    }
  }
}

/**
 * 更新文档处理状态
 */
async function updateDocumentStatus(
  documentId: string,
  status: DocProcessStatus,
  errorMessage?: string
): Promise<void> {
  const truncatedErrorMessage = errorMessage ? errorMessage.slice(0, 65000) : undefined
  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: {
      status,
      errorMessage: truncatedErrorMessage,
      processedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined,
    },
  })
}

/**
 * 重新处理文档
 * 删除旧分块并重新处理
 */
export async function reprocessDocument(
  documentId: string,
  options: Omit<ProcessDocumentOptions, 'documentId'>
): Promise<ProcessResult> {
  // 删除旧分块
  const deletedChunks = await prisma.documentChunk.deleteMany({
    where: { documentId },
  })

  // 更新知识库统计
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
    select: { knowledgeBaseId: true },
  })

  if (document) {
    await prisma.knowledgeBase.update({
      where: { id: document.knowledgeBaseId },
      data: {
        chunkCount: { decrement: deletedChunks.count },
      },
    })
  }

  // 重新处理
  return processDocument({
    ...options,
    documentId,
  })
}

export interface BatchProcessOptions {
  concurrency?: number
  onProgress?: (progress: {
    completed: number
    total: number
    current: string
    result?: ProcessResult
  }) => void
}

/**
 * 批量处理文档（支持并发控制和进度回调）
 */
export async function processDocumentBatch(
  documents: ProcessDocumentOptions[],
  options: BatchProcessOptions = {}
): Promise<ProcessResult[]> {
  const { concurrency = CONCURRENT_DOCUMENT_LIMIT, onProgress } = options
  const limit = pLimit(concurrency)
  const results: ProcessResult[] = []
  let completed = 0

  const tasks = documents.map((doc, index) =>
    limit(async () => {
      onProgress?.({
        completed,
        total: documents.length,
        current: doc.fileName,
      })

      const result = await processDocument(doc)
      results[index] = result
      completed++

      onProgress?.({
        completed,
        total: documents.length,
        current: doc.fileName,
        result,
      })

      return result
    })
  )

  await Promise.all(tasks)
  return results
}

/**
 * 获取文档处理进度
 */
export async function getDocumentProgress(
  knowledgeBaseId: string
): Promise<{
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
}> {
  const documents = await prisma.knowledgeDocument.groupBy({
    by: ['status'],
    where: { knowledgeBaseId },
    _count: true,
  })

  const statusMap = documents.reduce(
    (acc, doc) => {
      acc[doc.status] = doc._count
      return acc
    },
    {} as Record<string, number>
  )

  return {
    total: Object.values(statusMap).reduce((a, b) => a + b, 0),
    pending: statusMap['PENDING'] || 0,
    processing: statusMap['PROCESSING'] || 0,
    completed: statusMap['COMPLETED'] || 0,
    failed: statusMap['FAILED'] || 0,
  }
}

/**
 * 清理失败的文档
 */
export async function cleanupFailedDocuments(
  knowledgeBaseId: string
): Promise<number> {
  const result = await prisma.knowledgeDocument.deleteMany({
    where: {
      knowledgeBaseId,
      status: 'FAILED',
    },
  })

  // 更新知识库统计
  await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId },
    data: {
      documentCount: { decrement: result.count },
    },
  })

  return result.count
}

/**
 * 同步向量到向量存储
 * 将分块向量存储到 VectorStore（pgvector 或内存）
 */
async function syncToVectorStore(
  knowledgeBaseId: string,
  chunkIds: string[],
  chunks: Array<{ content: string; metadata?: Record<string, unknown> }>,
  embeddings: Array<{ embedding: number[]; tokenUsage?: number }>
): Promise<void> {
  try {
    const vectorStore = await getVectorStoreForKnowledgeBase(knowledgeBaseId)

    // 构建向量文档
    const vectorDocuments: VectorDocument[] = chunkIds.map((id, index) => ({
      id,
      content: chunks[index].content,
      embedding: embeddings[index].embedding,
      metadata: chunks[index].metadata || {},
    }))

    // 批量插入
    const results = await vectorStore.upsert(knowledgeBaseId, vectorDocuments)

    const successCount = results.filter((r: { success: boolean }) => r.success).length
    console.log(`[Processor] 向量存储同步完成: ${successCount}/${results.length}`)
  } catch (error) {
    console.error('[Processor] 向量存储同步失败:', error)
    throw error
  }
}

/**
 * 从向量存储删除文档分块
 */
export async function deleteFromVectorStore(
  knowledgeBaseId: string,
  chunkIds: string[]
): Promise<number> {
  try {
    const vectorStore = await getVectorStoreForKnowledgeBase(knowledgeBaseId)
    return await vectorStore.delete(knowledgeBaseId, chunkIds)
  } catch (error) {
    console.error('[Processor] 向量存储删除失败:', error)
    return 0
  }
}

/**
 * 重新同步知识库到向量存储
 * 用于迁移或修复向量存储数据
 */
export async function resyncKnowledgeBaseToVectorStore(
  knowledgeBaseId: string
): Promise<{ synced: number; failed: number }> {
  console.log(`[Processor] 开始重新同步知识库 ${knowledgeBaseId} 到向量存储`)

  const vectorStore = await getVectorStoreForKnowledgeBase(knowledgeBaseId)

  // 清空现有数据
  await vectorStore.deleteAll(knowledgeBaseId)

  // 获取所有分块
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
      embedding: true,
      metadata: true,
    },
  })

  let synced = 0
  let failed = 0

  // 批量处理
  const batchSize = 100
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)

    const vectorDocuments: VectorDocument[] = batch
      .map(chunk => {
        const embedding = parseEmbedding(chunk.embedding)
        if (!embedding) return null

        return {
          id: chunk.id,
          content: chunk.content,
          embedding,
          metadata: (chunk.metadata as Record<string, unknown>) || {},
        }
      })
      .filter((doc): doc is VectorDocument => doc !== null)

    const results = await vectorStore.upsert(knowledgeBaseId, vectorDocuments)
    synced += results.filter((r: { success: boolean }) => r.success).length
    failed += results.filter((r: { success: boolean }) => !r.success).length
  }

  console.log(`[Processor] 知识库同步完成: ${synced} 成功, ${failed} 失败`)
  return { synced, failed }
}

/**
 * 解析存储的向量嵌入
 */
function parseEmbedding(embedding: unknown): number[] | null {
  if (!embedding) return null

  if (typeof embedding === 'string') {
    try {
      return JSON.parse(embedding)
    } catch {
      return null
    }
  }

  if (Array.isArray(embedding)) {
    return embedding as number[]
  }

  return null
}
