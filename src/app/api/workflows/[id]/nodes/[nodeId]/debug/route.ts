/**
 * 节点调试 API
 *
 * POST /api/workflows/[id]/nodes/[nodeId]/debug - 调试单个节点
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError, TimeoutError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { debugNode, DebugResult } from '@/lib/workflow/debug'
import type { WorkflowConfig } from '@/types/workflow'

interface DebugRequest {
  mockInputs?: Record<string, Record<string, unknown>>
  timeout?: number
}

const DEFAULT_DEBUG_TIMEOUT_MS = 30 * 1000

/**
 * POST /api/workflows/[id]/nodes/[nodeId]/debug
 * 调试单个节点
 *
 * Request body:
 * {
 *   mockInputs?: Record<string, Record<string, unknown>>  // 模拟的上游节点输出
 *   timeout?: number                                       // 超时时间（秒，1-60）
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     status: 'success' | 'error' | 'skipped'
 *     output: Record<string, unknown>
 *     error?: string
 *     duration: number
 *     tokenUsage?: {
 *       promptTokens: number
 *       completionTokens: number
 *       totalTokens: number
 *     }
 *   }
 * }
 */
export const POST = withAuth<ApiSuccessResponse<DebugResult>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<DebugResult>>> => {
    const workflowId = params?.id
    const nodeId = params?.nodeId

    if (!workflowId) {
      throw new ValidationError('工作流ID不能为空')
    }

    if (!nodeId) {
      throw new ValidationError('节点ID不能为空')
    }

    const body = (await request.json()) as DebugRequest
    const { mockInputs = {}, timeout } = body

    if (timeout !== undefined && (timeout < 1 || timeout > 60)) {
      throw new ValidationError('超时时间必须在1-60秒之间')
    }

    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        config: true,
      },
    })

    if (!workflow) {
      throw new NotFoundError('工作流不存在或无权访问')
    }

    const config = workflow.config as unknown as WorkflowConfig

    if (!config || !config.nodes) {
      throw new ValidationError('工作流配置无效')
    }

    const targetNode = config.nodes.find((n) => n.id === nodeId)

    if (!targetNode) {
      throw new NotFoundError('节点不存在')
    }

    const timeoutMs = timeout ? timeout * 1000 : DEFAULT_DEBUG_TIMEOUT_MS

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(`节点调试超时 (${timeoutMs / 1000}秒)`))
      }, timeoutMs)
    })

    const result = await Promise.race([
      debugNode({
        workflowId,
        organizationId: user.organizationId,
        userId: user.id,
        node: targetNode,
        mockInputs,
        config,
      }),
      timeoutPromise,
    ])

    return ApiResponse.success(result)
  }
)
