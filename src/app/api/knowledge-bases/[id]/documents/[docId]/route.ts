/**
 * 单个文档 API
 *
 * GET /api/knowledge-bases/[id]/documents/[docId] - 获取文档详情
 * DELETE /api/knowledge-bases/[id]/documents/[docId] - 删除文档
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { deleteFromVectorStore } from '@/lib/knowledge/processor'
import { storageService } from '@/lib/storage'
import type { KnowledgeDocument } from '@prisma/client'

type _DocumentWithChunks = KnowledgeDocument & {
  _count?: {
    chunks: number
  }
}

/**
 * GET /api/knowledge-bases/[id]/documents/[docId]
 * 获取文档详情
 */
export const GET = withAuth(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ) => {
    const knowledgeBaseId = params?.id
    const documentId = params?.docId

    if (!knowledgeBaseId || !documentId) {
      throw new ValidationError('参数不完整')
    }

    // 验证知识库存在且有权限
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权访问此知识库')
    }

    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    })

    if (!document) {
      throw new NotFoundError('文档不存在')
    }

    if (document.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundError('文档不属于此知识库')
    }

    return ApiResponse.success(document)
  }
)

/**
 * DELETE /api/knowledge-bases/[id]/documents/[docId]
 * 删除文档
 */
export const DELETE = withAuth(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ) => {
    const knowledgeBaseId = params?.id
    const documentId = params?.docId

    if (!knowledgeBaseId || !documentId) {
      throw new ValidationError('参数不完整')
    }

    // 验证知识库存在且有权限
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权访问此知识库')
    }

    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    })

    if (!document) {
      throw new NotFoundError('文档不存在')
    }

    if (document.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundError('文档不属于此知识库')
    }

    // 1. 获取所有分块 ID（用于清理向量存储）
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      select: { id: true },
    })
    const chunkIds = chunks.map(c => c.id)

    // 2. 删除向量存储中的数据（异步，不阻塞主流程）
    if (chunkIds.length > 0) {
      deleteFromVectorStore(knowledgeBaseId, chunkIds).catch(error => {
        console.error('[Document Delete] 向量存储清理失败:', error)
      })
    }

    // 3. 删除存储的文件（异步，不阻塞主流程）
    if (document.fileKey) {
      storageService.getProvider().delete(document.fileKey).catch(error => {
        console.error('[Document Delete] 文件存储清理失败:', error)
      })
    }

    // 4. 删除文档（级联删除所有分块）
    await prisma.knowledgeDocument.delete({
      where: { id: documentId },
    })

    // 5. 更新知识库统计
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        documentCount: { decrement: 1 },
        totalSize: { decrement: document.fileSize },
        chunkCount: { decrement: document.chunkCount },
      },
    })

    return ApiResponse.success({ deleted: true, chunksCleared: chunkIds.length })
  }
)
