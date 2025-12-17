/**
 * 异步任务状态 API
 *
 * GET    /api/tasks/[taskId] - 获取任务状态
 * DELETE /api/tasks/[taskId] - 取消任务
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { executionQueue } from '@/lib/workflow/queue'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

/**
 * GET /api/tasks/[taskId]
 * 获取任务状态
 *
 * Response:
 * {
 *   taskId: string
 *   status: 'pending' | 'running' | 'completed' | 'failed'
 *   result?: ExecutionResult  // 任务完成时返回
 *   error?: string            // 任务失败时返回
 *   createdAt: string
 *   startedAt?: string
 *   completedAt?: string
 *   execution?: {...}         // 执行详情
 * }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { taskId } = await params
    const { task, execution } = await executionQueue.getTaskWithDetails(taskId)

    if (!task) {
      return NextResponse.json(
        { error: '任务不存在或已过期' },
        { status: 404 }
      )
    }

    // 验证权限（只能查看自己的任务）
    if (task.userId !== session.user.id) {
      return NextResponse.json(
        { error: '无权访问此任务' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      taskId: task.id,
      workflowId: task.workflowId,
      status: task.status,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      execution,
    })
  } catch (error) {
    console.error('Get task status error:', error)
    return NextResponse.json(
      { error: '获取任务状态失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/tasks/[taskId]
 * 取消任务（仅限 pending 状态）
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { taskId } = await params
    const task = executionQueue.getTask(taskId)

    if (!task) {
      return NextResponse.json(
        { error: '任务不存在或已过期' },
        { status: 404 }
      )
    }

    // 验证权限
    if (task.userId !== session.user.id) {
      return NextResponse.json(
        { error: '无权取消此任务' },
        { status: 403 }
      )
    }

    const cancelled = executionQueue.cancelTask(taskId)

    if (!cancelled) {
      return NextResponse.json(
        { error: '只能取消等待中的任务' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '任务已取消',
    })
  } catch (error) {
    console.error('Cancel task error:', error)
    return NextResponse.json(
      { error: '取消任务失败' },
      { status: 500 }
    )
  }
}
