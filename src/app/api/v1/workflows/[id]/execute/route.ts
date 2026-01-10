import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'
import { ApiResponse } from '@/lib/api/api-response'
import { TimeoutError } from '@/lib/errors'
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
 * Default execution timeout in milliseconds (5 minutes)
 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function clampTimeoutSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const seconds = Math.floor(value)
  if (seconds <= 0) return null
  // hard cap to 1 hour to avoid runaway requests
  return Math.min(seconds, 60 * 60)
}

async function executeWithTimeout(params: {
  workflowId: string
  organizationId: string
  userId: string
  input?: Record<string, unknown>
  timeoutMs: number
  mode: 'draft' | 'production'
}): Promise<Awaited<ReturnType<typeof executeWorkflow>>> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`工作流执行超时 (${Math.round(params.timeoutMs / 1000)}秒)`))
    }, params.timeoutMs)
  })

  return await Promise.race([
    executeWorkflow(params.workflowId, params.organizationId, params.userId, params.input, {
      mode: params.mode,
    }),
    timeoutPromise,
  ])
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
    const { input, async: asyncExecution, mode, timeout, debug } = body as {
      input?: Record<string, unknown>
      async?: boolean
      mode?: 'draft' | 'production'
      timeout?: number // seconds
      debug?: boolean
    }
    const executionMode = mode === 'draft' || mode === 'production' ? mode : 'production'
    const timeoutSeconds = clampTimeoutSeconds(timeout)
    const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : DEFAULT_TIMEOUT_MS
    const debugEnabled = Boolean(debug)

    // debug 模式会回传每个节点的输入/输出/错误等信息，要求更高权限
    if (debugEnabled) {
      const execScope = await validateApiTokenWithScope(request, 'executions')
      if (!execScope.success) {
        return execScope.response
      }
    }

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
    const result = await executeWithTimeout({
      workflowId,
      organizationId: token.organizationId,
      userId: token.createdById,
      input,
      timeoutMs,
      mode: executionMode,
    })

    const logs = debugEnabled
      ? await prisma.executionLog.findMany({
          where: { executionId: result.executionId },
          orderBy: { startedAt: 'asc' },
          select: {
            nodeId: true,
            nodeName: true,
            nodeType: true,
            status: true,
            input: true,
            output: true,
            error: true,
            duration: true,
            startedAt: true,
            completedAt: true,
            aiProvider: true,
            aiModel: true,
            promptTokens: true,
            completionTokens: true,
          },
        })
      : undefined

    return ApiResponse.success({
      executionId: result.executionId,
      status: result.status,
      output: result.output,
      error: result.error,
      duration: result.duration,
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      logs,
      outputFiles: result.outputFiles?.map(f => ({
        fileName: f.fileName,
        format: f.format,
        size: f.size,
        url: f.url,
      })),
    })
  } catch (error) {
    console.error('Public API execute workflow error:', error)
    if (error instanceof TimeoutError) {
      return ApiResponse.error(error.message, 504, { status: 'FAILED' })
    }
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
