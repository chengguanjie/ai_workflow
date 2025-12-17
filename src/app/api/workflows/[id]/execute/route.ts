/**
 * 工作流执行 API
 *
 * POST /api/workflows/[id]/execute - 执行工作流
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/workflows/[id]/execute
 * 执行工作流
 *
 * Request body:
 * {
 *   input?: Record<string, unknown>  // 初始输入（覆盖输入节点的值）
 *   async?: boolean                   // 是否异步执行（默认 false）
 * }
 *
 * Response (同步执行):
 * {
 *   status: 'COMPLETED' | 'FAILED'
 *   output?: Record<string, unknown>
 *   error?: string
 *   duration?: number
 *   totalTokens?: number
 *   outputFiles?: Array<{...}>
 * }
 *
 * Response (异步执行):
 * {
 *   taskId: string
 *   status: 'pending'
 *   message: string
 * }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: workflowId } = await params
    const body = await request.json().catch(() => ({}))
    const { input, async: asyncExecution } = body as {
      input?: Record<string, unknown>
      async?: boolean
    }

    // 异步执行模式
    if (asyncExecution) {
      const taskId = await executionQueue.enqueue(
        workflowId,
        session.user.organizationId,
        session.user.id,
        input
      )

      return NextResponse.json({
        taskId,
        status: 'pending',
        message: '任务已加入队列，请轮询查询执行状态',
        pollUrl: `/api/tasks/${taskId}`,
      })
    }

    // 同步执行
    const result = await executeWorkflow(
      workflowId,
      session.user.organizationId,
      session.user.id,
      input
    )

    return NextResponse.json({
      status: result.status,
      output: result.output,
      error: result.error,
      duration: result.duration,
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      outputFiles: result.outputFiles,
    })
  } catch (error) {
    console.error('Execute workflow error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '执行工作流失败',
        status: 'FAILED',
      },
      { status: 500 }
    )
  }
}
