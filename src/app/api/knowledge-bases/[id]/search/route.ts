/**
 * 知识库搜索 API
 *
 * POST /api/knowledge-bases/[id]/search - 搜索知识库
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { searchKnowledgeBase } from '@/lib/knowledge/search'
import { safeDecryptApiKey } from '@/lib/crypto'
import { checkKnowledgeBasePermission } from '@/lib/permissions/knowledge-base'
import { enhanceQuery } from '@/lib/knowledge/query-enhance'

interface SearchRequest {
  query: string
  topK?: number
  threshold?: number
  chatHistory?: { role: string; content: string }[]
  enableRewrite?: boolean
}

interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

interface SearchResponse {
  results: SearchResult[]
  query: string
  rewrittenQuery?: string | null
  totalResults: number
}

/**
 * POST /api/knowledge-bases/[id]/search
 * 搜索知识库
 */
export const POST = withAuth<ApiSuccessResponse<SearchResponse>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<SearchResponse>>> => {
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

    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权访问此知识库')
    }

    const hasPermission = await checkKnowledgeBasePermission(user.id, knowledgeBaseId, 'VIEWER')
    if (!hasPermission) {
      throw new AuthorizationError('您没有访问此知识库的权限')
    }

    if (!knowledgeBase.isActive) {
      throw new ValidationError('知识库已被禁用')
    }

    const body = (await request.json()) as SearchRequest
    const { query, topK = 5, threshold = 0.3, chatHistory, enableRewrite = false } = body

    if (!query?.trim()) {
      throw new ValidationError('搜索内容不能为空')
    }

    if (topK < 1 || topK > 20) {
      throw new ValidationError('返回结果数量必须在 1-20 之间')
    }

    if (threshold < 0 || threshold > 1) {
      throw new ValidationError('相似度阈值必须在 0-1 之间')
    }

    // 获取企业的 AI 配置（用于嵌入）
    const aiConfig = await prisma.apiKey.findFirst({
      where: {
        organizationId: user.organizationId,
        provider: knowledgeBase.embeddingProvider,
        isActive: true,
      },
    }) || await prisma.apiKey.findFirst({
      where: {
        organizationId: user.organizationId,
        isDefault: true,
        isActive: true,
      },
    })

    // 解密 API Key
    let apiKey: string | undefined
    let baseUrl: string | undefined
    if (aiConfig) {
      apiKey = safeDecryptApiKey(aiConfig.keyEncrypted)
      baseUrl = aiConfig.baseUrl || undefined
    }

    let searchQuery = query.trim()
    let rewrittenQuery: string | null = null

    // 智能查询重写 (P0 Optimization)
    // 如果启用了重写或提供了历史记录，尝试优化查询
    if ((enableRewrite || (chatHistory && chatHistory.length > 0)) && apiKey) {
      try {
        const enhancement = await enhanceQuery({
          query: searchQuery,
          chatHistory: chatHistory as { role: string; content: string }[],
          apiKey,
          baseUrl,
          enableRewrite: true,
          enableExpansion: false, // 暂时只启用重写
        })

        if (enhancement.rewritten && enhancement.rewritten !== searchQuery) {
          console.log(`[Search] Query Rewritten: "${searchQuery}" -> "${enhancement.rewritten}"`)
          searchQuery = enhancement.rewritten
          rewrittenQuery = enhancement.rewritten
        }
      } catch (error) {
        console.warn('[Search] Query rewrite failed:', error)
        // Fallback to original query
      }
    }

    // 执行搜索
    const results = await searchKnowledgeBase({
      knowledgeBaseId,
      query: searchQuery,
      topK,
      threshold,
      embeddingModel: knowledgeBase.embeddingModel,
      embeddingProvider: knowledgeBase.embeddingProvider,
      apiKey,
      baseUrl,
    })

    return ApiResponse.success({
      results,
      query: body.query.trim(), // 返回原始查询
      rewrittenQuery, // 返回重写后的查询以便前端展示
      totalResults: results.length,
    })
  }
)
