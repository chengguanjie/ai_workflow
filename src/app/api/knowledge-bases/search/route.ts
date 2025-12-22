/**
 * 跨知识库搜索 API
 *
 * POST /api/knowledge-bases/search - 跨多个知识库搜索
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import {
  searchAcrossKnowledgeBases,
  type CrossKnowledgeBaseSearchResponse,
} from '@/lib/knowledge/search'
import { safeDecryptApiKey } from '@/lib/crypto'
import type { AIProvider } from '@prisma/client'

interface CrossSearchRequest {
  query: string
  // 可选：指定要搜索的知识库 ID 列表
  knowledgeBaseIds?: string[]
  // 每个知识库返回的结果数量
  topKPerKnowledgeBase?: number
  // 最终返回的结果数量
  topK?: number
  // 相似度阈值
  threshold?: number
  // 是否使用混合搜索
  useHybridSearch?: boolean
  // 混合搜索权重
  vectorWeight?: number
  keywordWeight?: number
  // 是否启用重排序
  enableRerank?: boolean
}

/**
 * POST /api/knowledge-bases/search
 * 跨知识库搜索
 */
export const POST = withAuth<ApiSuccessResponse<CrossKnowledgeBaseSearchResponse>>(
  async (
    request: NextRequest,
    { user }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<CrossKnowledgeBaseSearchResponse>>> => {
    const body = (await request.json()) as CrossSearchRequest
    const {
      query,
      knowledgeBaseIds,
      topKPerKnowledgeBase = 5,
      topK = 10,
      threshold = 0.7,
      useHybridSearch = true,
      vectorWeight = 0.7,
      keywordWeight = 0.3,
      enableRerank = false,
    } = body

    // 验证查询内容
    if (!query?.trim()) {
      throw new ValidationError('搜索内容不能为空')
    }

    if (topK < 1 || topK > 50) {
      throw new ValidationError('返回结果数量必须在 1-50 之间')
    }

    if (topKPerKnowledgeBase < 1 || topKPerKnowledgeBase > 20) {
      throw new ValidationError('每个知识库返回结果数量必须在 1-20 之间')
    }

    if (threshold < 0 || threshold > 1) {
      throw new ValidationError('相似度阈值必须在 0-1 之间')
    }

    // 如果指定了知识库 ID，验证它们是否存在且属于当前组织
    if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
      const validKBs = await prisma.knowledgeBase.findMany({
        where: {
          id: { in: knowledgeBaseIds },
          organizationId: user.organizationId,
          isActive: true,
        },
        select: { id: true },
      })

      const validIds = new Set(validKBs.map(kb => kb.id))
      const invalidIds = knowledgeBaseIds.filter(id => !validIds.has(id))

      if (invalidIds.length > 0) {
        throw new ValidationError(`以下知识库不存在或无权访问: ${invalidIds.join(', ')}`)
      }
    }

    // 获取默认的 AI 配置（用于嵌入）
    const defaultAiConfig = await prisma.apiKey.findFirst({
      where: {
        organizationId: user.organizationId,
        isDefault: true,
        isActive: true,
      },
    })

    let apiKey: string | undefined
    let baseUrl: string | undefined
    let defaultEmbeddingProvider: AIProvider | undefined

    if (defaultAiConfig) {
      apiKey = safeDecryptApiKey(defaultAiConfig.keyEncrypted)
      baseUrl = defaultAiConfig.baseUrl || undefined
      defaultEmbeddingProvider = defaultAiConfig.provider
    }

    // 执行跨知识库搜索
    const results = await searchAcrossKnowledgeBases({
      userId: user.id,
      organizationId: user.organizationId,
      query: query.trim(),
      knowledgeBaseIds,
      topKPerKnowledgeBase,
      topK,
      threshold,
      useHybridSearch,
      vectorWeight,
      keywordWeight,
      enableRerank,
      apiKey,
      baseUrl,
      defaultEmbeddingProvider,
    })

    return ApiResponse.success(results)
  }
)
