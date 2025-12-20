/**
 * 执行反馈 API
 *
 * GET  /api/executions/[id]/feedback - 获取执行的反馈列表
 * POST /api/executions/[id]/feedback - 提交执行反馈
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { diagnosisService } from '@/lib/services/diagnosis.service'
import { z } from 'zod'

// 问题分类枚举
const issueCategories = [
  'KNOWLEDGE_BASE',
  'PROMPT_UNCLEAR',
  'PROMPT_WRONG',
  'MODEL_CAPABILITY',
  'MODEL_CONFIG',
  'INPUT_QUALITY',
  'CONTEXT_MISSING',
  'LOGIC_ERROR',
  'OTHER',
] as const

// 反馈提交验证 Schema
const createFeedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  isAccurate: z.boolean(),
  expectedOutput: z.string().optional(),
  feedbackComment: z.string().optional(),
  issueCategories: z.array(z.enum(issueCategories)).optional().default([]),
  requestDiagnosis: z.boolean().optional().default(false),
})

/**
 * GET /api/executions/[id]/feedback
 * 获取执行的反馈列表
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const executionId = params?.id
  if (!executionId) {
    throw new NotFoundError('执行记录不存在')
  }

  // 验证执行记录存在且用户有权限
  const execution = await prisma.execution.findFirst({
    where: {
      id: executionId,
      workflow: {
        organizationId: user.organizationId,
      },
    },
  })

  if (!execution) {
    throw new NotFoundError('执行记录不存在')
  }

  // 获取反馈列表
  const feedbacks = await prisma.executionFeedback.findMany({
    where: { executionId },
    orderBy: { createdAt: 'desc' },
    include: {
      suggestions: {
        select: {
          id: true,
          suggestionType: true,
          suggestionTitle: true,
          status: true,
          confidence: true,
        },
      },
    },
  })

  return ApiResponse.success(feedbacks)
})

/**
 * POST /api/executions/[id]/feedback
 * 提交执行反馈
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const executionId = params?.id
  if (!executionId) {
    throw new NotFoundError('执行记录不存在')
  }

  // 验证执行记录存在且用户有权限
  const execution = await prisma.execution.findFirst({
    where: {
      id: executionId,
      workflow: {
        organizationId: user.organizationId,
      },
    },
    include: {
      workflow: true,
    },
  })

  if (!execution) {
    throw new NotFoundError('执行记录不存在')
  }

  // 解析并验证请求体
  const body = await request.json()
  const parseResult = createFeedbackSchema.safeParse(body)

  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.issues[0].message)
  }

  const {
    rating,
    isAccurate,
    expectedOutput,
    feedbackComment,
    issueCategories: categories,
    requestDiagnosis,
  } = parseResult.data

  // 创建反馈记录
  const feedback = await prisma.executionFeedback.create({
    data: {
      executionId,
      userId: user.id,
      rating,
      isAccurate,
      expectedOutput,
      actualOutput: execution.output ? JSON.stringify(execution.output) : null,
      feedbackComment,
      issueCategories: categories,
      optimizationStatus: requestDiagnosis ? 'ANALYZING' : 'PENDING',
    },
  })

  // 如果请求 AI 诊断，异步触发诊断任务
  let diagnosisJobId: string | undefined
  if (requestDiagnosis) {
    diagnosisJobId = feedback.id
    // 异步执行诊断，不阻塞响应
    diagnosisService.analyzeFeedback(feedback.id).catch((error) => {
      console.error('AI 诊断分析失败:', error)
    })
  }

  return ApiResponse.success(
    {
      feedback,
      diagnosisJobId,
    },
    201
  )
})
