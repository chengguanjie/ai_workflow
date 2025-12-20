/**
 * 拒绝优化建议 API
 *
 * POST /api/suggestions/[id]/reject - 拒绝优化建议
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const rejectSchema = z.object({
  reason: z.string().optional(),
})

/**
 * POST /api/suggestions/[id]/reject
 * 拒绝优化建议
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const suggestionId = params?.id
  if (!suggestionId) {
    throw new NotFoundError('建议不存在')
  }

  // 获取建议
  const suggestion = await prisma.optimizationSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      feedback: {
        include: {
          execution: {
            include: {
              workflow: true,
            },
          },
        },
      },
    },
  })

  if (!suggestion) {
    throw new NotFoundError('建议不存在')
  }

  // 验证用户权限
  if (suggestion.feedback.execution.workflow.organizationId !== user.organizationId) {
    throw new NotFoundError('建议不存在')
  }

  // 解析请求体（预留用于后续审计日志）
  try {
    const body = await request.json()
    rejectSchema.safeParse(body)
  } catch {
    // 忽略解析错误
  }

  // 更新建议状态
  await prisma.optimizationSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: 'REJECTED',
    },
  })

  // 检查是否所有建议都已处理，更新反馈状态
  const pendingSuggestions = await prisma.optimizationSuggestion.count({
    where: {
      feedbackId: suggestion.feedbackId,
      status: 'PENDING',
    },
  })

  if (pendingSuggestions === 0) {
    await prisma.executionFeedback.update({
      where: { id: suggestion.feedbackId },
      data: { optimizationStatus: 'REJECTED' },
    })
  }

  return ApiResponse.success({ success: true })
})
