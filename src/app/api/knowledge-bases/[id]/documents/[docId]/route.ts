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
import type { KnowledgeDocument } from '@prisma/client'

// Document interface with chunk count (used for type consistency)
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

    // 删除文档（级联删除所有分块）
    await prisma.knowledgeDocument.delete({
      where: { id: documentId },
    })

    // 更新知识库统计
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        documentCount: { decrement: 1 },
        totalSize: { decrement: document.fileSize },
        chunkCount: { decrement: document.chunkCount },
      },
    })

    // TODO: 删除存储的文件
    // await deleteFile(document.fileKey)

    return ApiResponse.success({ deleted: true })
  }
)
