/**
 * 单个知识库 API
 *
 * GET /api/knowledge-bases/[id] - 获取知识库详情
 * PUT /api/knowledge-bases/[id] - 更新知识库
 * DELETE /api/knowledge-bases/[id] - 删除知识库
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import type { KnowledgeBase, VectorStoreType, AIProvider } from '@prisma/client'

interface KnowledgeBaseWithStats extends KnowledgeBase {
  _count?: {
    documents: number
  }
}

interface UpdateKnowledgeBaseRequest {
  name?: string
  description?: string
  embeddingModel?: string
  embeddingProvider?: AIProvider
  chunkSize?: number
  chunkOverlap?: number
  vectorStoreType?: VectorStoreType
  isActive?: boolean
}

/**
 * GET /api/knowledge-bases/[id]
 * 获取知识库详情
 */
export const GET = withAuth<ApiSuccessResponse<KnowledgeBaseWithStats>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<KnowledgeBaseWithStats>>> => {
    const knowledgeBaseId = params?.id

    if (!knowledgeBaseId) {
      throw new ValidationError('知识库ID不能为空')
    }

    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    // 检查访问权限
    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权访问此知识库')
    }

    return ApiResponse.success(knowledgeBase)
  }
)

/**
 * PUT /api/knowledge-bases/[id]
 * 更新知识库
 */
export const PUT = withAuth<ApiSuccessResponse<KnowledgeBase>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<KnowledgeBase>>> => {
    const knowledgeBaseId = params?.id

    if (!knowledgeBaseId) {
      throw new ValidationError('知识库ID不能为空')
    }

    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    // 检查权限
    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权编辑此知识库')
    }

    const body = (await request.json()) as UpdateKnowledgeBaseRequest
    const {
      name,
      description,
      embeddingModel,
      embeddingProvider,
      chunkSize,
      chunkOverlap,
      vectorStoreType,
      isActive,
    } = body

    // 验证分块参数
    const newChunkSize = chunkSize ?? knowledgeBase.chunkSize
    const newChunkOverlap = chunkOverlap ?? knowledgeBase.chunkOverlap

    if (chunkSize !== undefined && (chunkSize < 100 || chunkSize > 10000)) {
      throw new ValidationError('分块大小必须在 100-10000 之间')
    }

    if (chunkOverlap !== undefined && (chunkOverlap < 0 || chunkOverlap > 1000)) {
      throw new ValidationError('分块重叠必须在 0-1000 之间')
    }

    if (newChunkOverlap >= newChunkSize) {
      throw new ValidationError('分块重叠不能大于等于分块大小')
    }

    const updatedKnowledgeBase = await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(embeddingModel && { embeddingModel }),
        ...(embeddingProvider && { embeddingProvider }),
        ...(chunkSize !== undefined && { chunkSize }),
        ...(chunkOverlap !== undefined && { chunkOverlap }),
        ...(vectorStoreType && { vectorStoreType }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return ApiResponse.success(updatedKnowledgeBase)
  }
)

/**
 * DELETE /api/knowledge-bases/[id]
 * 删除知识库（软删除，设置 isActive = false）
 */
export const DELETE = withAuth<ApiSuccessResponse<{ deleted: boolean }>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<{ deleted: boolean }>>> => {
    const knowledgeBaseId = params?.id

    if (!knowledgeBaseId) {
      throw new ValidationError('知识库ID不能为空')
    }

    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    // 检查权限
    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权删除此知识库')
    }

    // 软删除：设置 isActive = false
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: { isActive: false },
    })

    return ApiResponse.success({ deleted: true })
  }
)
