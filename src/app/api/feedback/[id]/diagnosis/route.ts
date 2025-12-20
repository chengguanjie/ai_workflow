/**
 * 反馈诊断 API
 *
 * GET  /api/feedback/[id]/diagnosis - 获取诊断结果
 * POST /api/feedback/[id]/diagnosis - 触发 AI 诊断
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { diagnosisService } from '@/lib/services/diagnosis.service'

/**
 * GET /api/feedback/[id]/diagnosis
 * 获取诊断结果
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const feedbackId = params?.id
  if (!feedbackId) {
    throw new NotFoundError('反馈不存在')
  }

  // 验证反馈存在且用户有权限
  const feedback = await prisma.executionFeedback.findFirst({
    where: {
      id: feedbackId,
      execution: {
        workflow: {
          organizationId: user.organizationId,
        },
      },
    },
  })

  if (!feedback) {
    throw new NotFoundError('反馈不存在')
  }

  // 获取诊断结果
  const diagnosis = await diagnosisService.getDiagnosis(feedbackId)

  return ApiResponse.success(diagnosis)
})

/**
 * POST /api/feedback/[id]/diagnosis
 * 触发 AI 诊断
 */
export const POST = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const feedbackId = params?.id
  if (!feedbackId) {
    throw new NotFoundError('反馈不存在')
  }

  // 验证反馈存在且用户有权限
  const feedback = await prisma.executionFeedback.findFirst({
    where: {
      id: feedbackId,
      execution: {
        workflow: {
          organizationId: user.organizationId,
        },
      },
    },
  })

  if (!feedback) {
    throw new NotFoundError('反馈不存在')
  }

  // 执行诊断
  const result = await diagnosisService.analyzeFeedback(feedbackId)

  return ApiResponse.success({
    status: 'completed',
    result,
  })
})
