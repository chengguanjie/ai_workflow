/**
 * 平台反馈 API
 *
 * GET  /api/platform-feedback - 获取当前用户的反馈列表
 * POST /api/platform-feedback - 提交平台反馈
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { PlatformFeedbackType, PlatformFeedbackSource } from '@prisma/client'

// 反馈提交验证 Schema
const createFeedbackSchema = z.object({
  type: z.nativeEnum(PlatformFeedbackType),
  title: z.string().min(1, '请输入反馈标题').max(200, '标题不能超过200字'),
  content: z.string().min(1, '请输入反馈内容').max(5000, '内容不能超过5000字'),
  screenshots: z.array(z.string().url()).optional(),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
})

/**
 * GET /api/platform-feedback
 * 获取当前用户的反馈列表
 */
export const GET = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')
  const status = searchParams.get('status')

  const where = {
    userId: user.id,
    organizationId: user.organizationId,
    ...(status && { status: status as never }),
  }

  const [feedbacks, total] = await Promise.all([
    prisma.platformFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        workflow: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.platformFeedback.count({ where }),
  ])

  return ApiResponse.success({
    items: feedbacks,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
})

/**
 * POST /api/platform-feedback
 * 提交平台反馈
 */
export const POST = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  // 解析并验证请求体
  const body = await request.json()
  const parseResult = createFeedbackSchema.safeParse(body)

  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.issues[0].message)
  }

  const { type, title, content, screenshots, workflowId, executionId } = parseResult.data

  // 验证关联的工作流存在（如果提供了workflowId）
  if (workflowId) {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: user.organizationId,
      },
    })
    if (!workflow) {
      throw new ValidationError('关联的工作流不存在')
    }
  }

  // 验证关联的执行记录存在（如果提供了executionId）
  if (executionId) {
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: user.organizationId,
        },
      },
    })
    if (!execution) {
      throw new ValidationError('关联的执行记录不存在')
    }
  }

  // 判断反馈来源：OWNER 和 ADMIN 角色视为企业端，其他为员工端
  const source: PlatformFeedbackSource =
    user.role === 'OWNER' || user.role === 'ADMIN' ? 'ENTERPRISE' : 'EMPLOYEE'

  // 创建反馈记录
  const feedback = await prisma.platformFeedback.create({
    data: {
      type,
      title,
      content,
      screenshots: screenshots || [],
      source,
      workflowId,
      executionId,
      userId: user.id,
      organizationId: user.organizationId,
    },
  })

  return ApiResponse.success(feedback, 201)
})
