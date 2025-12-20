/**
 * 工作流优化建议 API
 *
 * GET /api/workflows/[id]/suggestions - 获取工作流的优化建议列表
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { workflowService } from '@/server/services/workflow.service'
import { SuggestionStatus } from '@prisma/client'

/**
 * GET /api/workflows/[id]/suggestions
 * 获取工作流的优化建议列表
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new NotFoundError('工作流不存在')
  }

  // 验证工作流存在且用户有权限
  const workflow = await workflowService.getById(workflowId, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 获取查询参数
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit

  // 构建查询条件
  const where: {
    workflowId: string
    status?: SuggestionStatus
  } = {
    workflowId,
  }

  // 验证并设置 status 过滤
  if (status && Object.values(SuggestionStatus).includes(status as SuggestionStatus)) {
    where.status = status as SuggestionStatus
  }

  // 获取建议列表
  const [suggestions, total] = await Promise.all([
    prisma.optimizationSuggestion.findMany({
      where,
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        feedback: {
          select: {
            id: true,
            rating: true,
            isAccurate: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.optimizationSuggestion.count({ where }),
  ])

  return ApiResponse.success({
    suggestions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})
