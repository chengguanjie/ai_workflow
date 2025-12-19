/**
 * 文档处理服务
 * 完整的文档上传、解析、分块和向量化流程
 */

import { prisma } from '@/lib/db'
import { parseDocument } from './parser'
import { splitText } from './chunker'
import { generateEmbeddings } from './embedding'
import type { AIProvider, DocProcessStatus } from '@prisma/client'

export interface ProcessDocumentOptions {
  documentId: string
  fileBuffer: Buffer
  fileType: string
  fileName: string
  knowledgeBaseId: string
  chunkSize?: number
  chunkOverlap?: number
  embeddingModel: string
  embeddingProvider: AIProvider
  // API 配置（从数据库获取）
  apiKey?: string
  baseUrl?: string
}

export interface ProcessResult {
  success: boolean
  documentId: string
  chunkCount: number
  error?: string
}

/**
 * 处理单个文档
 * 包括解析、分块、向量化
 */
export async function processDocument(
  options: ProcessDocumentOptions
): Promise<ProcessResult> {
  const {
    documentId,
    fileBuffer,
    fileType,
    fileName,
    knowledgeBaseId,
    chunkSize = 1000,
    chunkOverlap = 200,
    embeddingModel,
    embeddingProvider,
    apiKey,
    baseUrl,
  } = options

  try {
    // 更新状态为处理中
    await updateDocumentStatus(documentId, 'PROCESSING')

    // 1. 解析文档
    const parsed = await parseDocument(fileBuffer, fileType, fileName)

    if (!parsed.text || parsed.text.trim().length === 0) {
      throw new Error('文档内容为空')
    }

    // 2. 分块
    const chunks = splitText(parsed.text, {
      chunkSize,
      chunkOverlap,
    })

    if (chunks.length === 0) {
      throw new Error('文档分块失败')
    }

    // 3. 生成向量嵌入
    const chunkTexts = chunks.map((c) => c.content)
    const embeddings = await generateEmbeddings(chunkTexts, {
      provider: embeddingProvider,
      model: embeddingModel,
      apiKey,
      baseUrl,
    })

    // 4. 保存分块到数据库
    const chunkData = chunks.map((chunk, index) => ({
      documentId,
      content: chunk.content,
      chunkIndex: chunk.index,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      embedding: JSON.stringify(embeddings[index].embedding),
      tokenCount: embeddings[index].tokenUsage || 0,
      metadata: JSON.parse(JSON.stringify(chunk.metadata || {})),
    }))

    // 批量创建分块
    await prisma.documentChunk.createMany({
      data: chunkData,
    })

    // 5. 更新文档状态
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        status: 'COMPLETED',
        chunkCount: chunks.length,
        processedAt: new Date(),
        metadata: JSON.parse(JSON.stringify({
          ...parsed.metadata,
          chunkSize,
          chunkOverlap,
        })),
      },
    })

    // 6. 更新知识库统计
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        chunkCount: { increment: chunks.length },
      },
    })

    return {
      success: true,
      documentId,
      chunkCount: chunks.length,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'

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
  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: {
      status,
      errorMessage,
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

/**
 * 批量处理文档
 */
export async function processDocumentBatch(
  documents: ProcessDocumentOptions[]
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = []

  // 串行处理以避免 API 限制
  for (const doc of documents) {
    const result = await processDocument(doc)
    results.push(result)

    // 添加延迟以避免 API 速率限制
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

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
