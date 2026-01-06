/**
 * 节点测试反馈 API
 *
 * POST /api/executions/[id]/node-feedback - 提交节点测试反馈
 * GET /api/executions/[id]/node-feedback - 查询节点测试反馈
 *
 * Feature: workflow-test-mode
 * Requirements: 3.3, 3.4, 4.5
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ApiResponse } from '@/lib/api/api-response'
import { handleError } from '@/lib/api/error-middleware'
import { NotFoundError, ValidationError, AuthenticationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// 错误分类枚举
const errorCategories = [
  'OUTPUT_FORMAT',
  'OUTPUT_CONTENT',
  'MISSING_DATA',
  'LOGIC_ERROR',
  'PERFORMANCE',
  'OTHER',
] as const

// 节点反馈提交验证 Schema
const createNodeFeedbackSchema = z.object({
  nodeId: z.string().min(1, '节点 ID 不能为空'),
  nodeName: z.string().min(1, '节点名称不能为空'),
  nodeType: z.string().min(1, '节点类型不能为空'),
  isCorrect: z.boolean(),
  errorReason: z.string().optional(),
  errorCategory: z.enum(errorCategories).optional(),
  nodeOutput: z.record(z.string(), z.unknown()).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/executions/[id]/node-feedback
 * 提交节点测试反馈
 *
 * Feature: workflow-test-mode, Property 1: 反馈数据完整性和持久化
 * Validates: Requirements 3.3, 3.4
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new AuthenticationError('未登录')
    }

    const { id: executionId } = await params

    // 验证执行记录存在且用户有权限
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
    })

    if (!execution) {
      throw new NotFoundError('执行记录不存在')
    }

    // 解析并验证请求体
    const body = await request.json()
    const parseResult = createNodeFeedbackSchema.safeParse(body)

    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0].message)
    }

    const { nodeId, nodeName, nodeType, isCorrect, errorReason, errorCategory, nodeOutput } =
      parseResult.data

    // 如果标记为错误但没有提供错误原因，给出提示
    if (!isCorrect && !errorReason && !errorCategory) {
      throw new ValidationError('标记为错误时，请提供错误原因或错误分类')
    }

    // 创建节点反馈记录
    const feedback = await prisma.nodeTestFeedback.create({
      data: {
        executionId,
        nodeId,
        nodeName,
        nodeType,
        isCorrect,
        errorReason: errorReason || null,
        errorCategory: errorCategory || null,
        nodeOutput: nodeOutput || null,
        userId: session.user.id,
      },
    })

    return ApiResponse.created({
      feedback: {
        id: feedback.id,
        executionId: feedback.executionId,
        nodeId: feedback.nodeId,
        nodeName: feedback.nodeName,
        nodeType: feedback.nodeType,
        isCorrect: feedback.isCorrect,
        errorReason: feedback.errorReason,
        errorCategory: feedback.errorCategory,
        nodeOutput: feedback.nodeOutput,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
        userId: feedback.userId,
      },
    })
  } catch (error) {
    return handleError(error, request)
  }
}

/**
 * GET /api/executions/[id]/node-feedback
 * 查询节点测试反馈
 *
 * Feature: workflow-test-mode, Property 4: 多维度查询正确性
 * Validates: Requirements 4.5
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new AuthenticationError('未登录')
    }

    const { id: executionId } = await params
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get('nodeId')

    // 验证执行记录存在且用户有权限
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
    })

    if (!execution) {
      throw new NotFoundError('执行记录不存在')
    }

    // 构建查询条件
    const whereClause: {
      executionId: string
      nodeId?: string
    } = {
      executionId,
    }

    if (nodeId) {
      whereClause.nodeId = nodeId
    }

    // 查询节点反馈
    const feedbacks = await prisma.nodeTestFeedback.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    })

    return ApiResponse.success({
      feedbacks: feedbacks.map((feedback) => ({
        id: feedback.id,
        executionId: feedback.executionId,
        nodeId: feedback.nodeId,
        nodeName: feedback.nodeName,
        nodeType: feedback.nodeType,
        isCorrect: feedback.isCorrect,
        errorReason: feedback.errorReason,
        errorCategory: feedback.errorCategory,
        nodeOutput: feedback.nodeOutput,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
        userId: feedback.userId,
      })),
    })
  } catch (error) {
    return handleError(error, request)
  }
}
