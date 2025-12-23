/**
 * 重置卡住文档 API
 *
 * POST /api/knowledge-bases/[id]/documents/reset-stuck - 重置所有卡住的文档
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'

interface ResetStuckResponse {
  success: boolean
  resetCount: number
  message: string
}

/**
 * POST /api/knowledge-bases/[id]/documents/reset-stuck
 * 重置所有卡住的文档（处理中超过10分钟的文档）
 */
export const POST = withAuth<ApiSuccessResponse<ResetStuckResponse>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<ResetStuckResponse>>> => {
    const knowledgeBaseId = params?.id

    if (!knowledgeBaseId) {
      throw new ValidationError('知识库ID不能为空')
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

    // 计算10分钟前的时间
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

    // 重置所有卡住的文档（处理中超过10分钟）
    const result = await prisma.knowledgeDocument.updateMany({
      where: {
        knowledgeBaseId,
        status: 'PROCESSING',
        updatedAt: { lt: tenMinutesAgo },
      },
      data: {
        status: 'FAILED',
        errorMessage: '处理超时，请点击重新处理',
      },
    })

    return ApiResponse.success({
      success: true,
      resetCount: result.count,
      message: result.count > 0 
        ? `已重置 ${result.count} 个卡住的文档` 
        : '没有发现卡住的文档',
    })
  }
)
