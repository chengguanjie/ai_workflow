/**
 * 工作流执行 API
 *
 * POST /api/workflows/[id]/execute - 执行工作流
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { validateRequestBody } from '@/lib/api/with-validation'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, TimeoutError } from '@/lib/errors'
import { workflowExecuteSchema, WorkflowExecuteInput } from '@/lib/validations/workflow'
import { executeWorkflow, ExecutionResult } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'
import { prisma } from '@/lib/db'

/**
 * Async execution response type
 */
interface AsyncExecutionResponse {
  taskId: string
  status: 'pending'
  message: string
  pollUrl: string
}

/**
 * Sync execution response type
 */
interface SyncExecutionResponse {
  executionId: string
  status: ExecutionResult['status']
  output?: Record<string, unknown>
  error?: string
  duration?: number
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
  outputFiles?: Array<{
    id: string
    fileName: string
    format: string
    url: string
    size: number
  }>
}

/**
 * Combined execution response type
 */
type ExecutionResponse = AsyncExecutionResponse | SyncExecutionResponse

/**
 * Default execution timeout in milliseconds (5 minutes)
 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Execute workflow with timeout control
 */
async function executeWithTimeout(
  workflowId: string,
  organizationId: string,
  userId: string,
  input?: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`工作流执行超时 (${timeoutMs / 1000}秒)`))
    }, timeoutMs)
  })

  const result = await Promise.race([
    executeWorkflow(workflowId, organizationId, userId, input),
    timeoutPromise,
  ])

  return result
}


/**
 * POST /api/workflows/[id]/execute
 * 执行工作流
 *
 * Request body:
 * {
 *   input?: Record<string, unknown>  // 初始输入（覆盖输入节点的值）
 *   async?: boolean                   // 是否异步执行（默认 false）
 *   timeout?: number                  // 执行超时（秒，1-3600）
 * }
 *
 * Response (同步执行):
 * {
 *   success: true,
 *   data: {
 *     executionId: string
 *     status: 'COMPLETED' | 'FAILED'
 *     output?: Record<string, unknown>
 *     error?: string
 *     duration?: number
 *     totalTokens?: number
 *     outputFiles?: Array<{...}>
 *   }
 * }
 *
 * Response (异步执行):
 * {
 *   success: true,
 *   data: {
 *     taskId: string
 *     status: 'pending'
 *     message: string
 *     pollUrl: string
 *   }
 * }
 */
export const POST = withAuth<ApiSuccessResponse<ExecutionResponse>>(async (request: NextRequest, { user, params }: AuthContext): Promise<NextResponse<ApiSuccessResponse<ExecutionResponse>>> => {
  const workflowId = params?.id
  
  if (!workflowId) {
    throw new NotFoundError('工作流ID不能为空')
  }

  // Validate request body
  const body = await validateRequestBody(request, workflowExecuteSchema)
  const { input, async: asyncExecution, timeout } = body as WorkflowExecuteInput

  // Verify workflow exists and user has access
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })

  if (!workflow) {
    throw new NotFoundError('工作流不存在或无权访问')
  }

  // Async execution mode
  if (asyncExecution) {
    const taskId = await executionQueue.enqueue(
      workflowId,
      user.organizationId,
      user.id,
      input
    )

    return ApiResponse.success({
      taskId,
      status: 'pending',
      message: '任务已加入队列，请轮询查询执行状态',
      pollUrl: `/api/tasks/${taskId}`,
    })
  }

  // Sync execution with timeout control
  const timeoutMs = timeout ? timeout * 1000 : DEFAULT_TIMEOUT_MS
  
  const result = await executeWithTimeout(
    workflowId,
    user.organizationId,
    user.id,
    input,
    timeoutMs
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
    outputFiles: result.outputFiles,
  })
})
