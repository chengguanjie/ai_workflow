import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'
import { ApiResponse } from '@/lib/api/api-response'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  createCrossOrgNotFoundResponse,
  updateTokenUsage,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/v1/workflows/[id]/execute
 * 使用 API Token 执行工作流
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // 验证 Token 和作用域
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

    // 查找工作流（不限制组织，用于后续跨组织验证）
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
      },
    })

    // 如果工作流不存在，返回404
    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // 跨组织验证：返回404而非403，避免信息泄露
    const crossOrgResult = validateCrossOrganization(
      token.organizationId,
      workflow.organizationId
    )
    if (!crossOrgResult.success) {
      return createCrossOrgNotFoundResponse('工作流')
    }

    // 解析请求体
    const body = await request.json().catch(() => ({}))
    const { input, async: asyncExecution, mode } = body as {
      input?: Record<string, unknown>
      async?: boolean
      mode?: 'draft' | 'production'
    }
    const executionMode = mode === 'draft' || mode === 'production' ? mode : 'production'

    // 更新 Token 使用统计
    await updateTokenUsage(token.id)

    // 异步执行模式
    if (asyncExecution) {
      const taskId = await executionQueue.enqueue(
        workflowId,
        token.organizationId,
        token.createdById,
        input,
        { mode: executionMode }
      )

      return ApiResponse.success({
        taskId,
        status: 'pending',
        message: '任务已加入队列',
        pollUrl: `/api/v1/tasks/${taskId}`,
      })
    }

    // 同步执行
    const result = await executeWorkflow(
      workflowId,
      token.organizationId,
      token.createdById,
      input,
      { mode: executionMode }
    )

    return ApiResponse.success({
      executionId: result.executionId,
      status: result.status,
      output: result.output,
      error: result.error,
      duration: result.duration,
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      outputFiles: result.outputFiles?.map(f => ({
        fileName: f.fileName,
        format: f.format,
        size: f.size,
        url: f.url,
      })),
    })
  } catch (error) {
    console.error('Public API execute workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '执行工作流失败',
      500,
      { status: 'FAILED' }
    )
  }
}

// OPTIONS: 支持 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
