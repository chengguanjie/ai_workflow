/**
 * 知识库 API
 *
 * GET /api/knowledge-bases - 获取知识库列表
 * POST /api/knowledge-bases - 创建知识库
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import type { KnowledgeBase, VectorStoreType, AIProvider } from '@prisma/client'

interface KnowledgeBaseListParams {
  page?: number
  limit?: number
  search?: string
}

interface KnowledgeBaseListResponse {
  knowledgeBases: KnowledgeBase[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface CreateKnowledgeBaseRequest {
  name: string
  description?: string
  embeddingModel?: string
  embeddingProvider?: AIProvider
  chunkSize?: number
  chunkOverlap?: number
  vectorStoreType?: VectorStoreType
}

/**
 * GET /api/knowledge-bases
 * 获取知识库列表
 */
export const GET = withAuth<ApiSuccessResponse<KnowledgeBaseListResponse>>(
  async (
    request: NextRequest,
    { user }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<KnowledgeBaseListResponse>>> => {
    const { searchParams } = new URL(request.url)

    const params: KnowledgeBaseListParams = {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
      search: searchParams.get('search') || undefined,
    }

    const { page, limit, search } = params

    // 构建查询条件
    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      isActive: true,
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ]
    }

    const [knowledgeBases, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page! - 1) * limit!,
        take: limit,
      }),
      prisma.knowledgeBase.count({ where }),
    ])

    return ApiResponse.success({
      knowledgeBases,
      total,
      page: page!,
      limit: limit!,
      totalPages: Math.ceil(total / limit!),
    })
  }
)

/**
 * POST /api/knowledge-bases
 * 创建知识库
 */
export const POST = withAuth<ApiSuccessResponse<KnowledgeBase>>(
  async (
    request: NextRequest,
    { user }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<KnowledgeBase>>> => {
    const body = (await request.json()) as CreateKnowledgeBaseRequest

    const {
      name,
      description,
      embeddingModel,
      embeddingProvider,
      chunkSize,
      chunkOverlap,
      vectorStoreType,
    } = body

    // 验证必填字段
    if (!name?.trim()) {
      throw new ValidationError('知识库名称不能为空')
    }

    // 验证分块参数
    if (chunkSize !== undefined && (chunkSize < 100 || chunkSize > 10000)) {
      throw new ValidationError('分块大小必须在 100-10000 之间')
    }

    if (chunkOverlap !== undefined && (chunkOverlap < 0 || chunkOverlap > 1000)) {
      throw new ValidationError('分块重叠必须在 0-1000 之间')
    }

    if (chunkOverlap !== undefined && chunkSize !== undefined && chunkOverlap >= chunkSize) {
      throw new ValidationError('分块重叠不能大于等于分块大小')
    }

    const knowledgeBase = await prisma.knowledgeBase.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        embeddingModel: embeddingModel || 'text-embedding-ada-002',
        embeddingProvider: embeddingProvider || 'OPENAI',
        chunkSize: chunkSize || 1000,
        chunkOverlap: chunkOverlap || 200,
        vectorStoreType: vectorStoreType || 'MEMORY',
        organizationId: user.organizationId,
        creatorId: user.id,
      },
    })

    return ApiResponse.created(knowledgeBase)
  }
)
