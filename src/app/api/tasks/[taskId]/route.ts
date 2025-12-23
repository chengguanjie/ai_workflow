import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { executionQueue } from '@/lib/workflow/queue'
import { ApiResponse } from '@/lib/api/api-response'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

/**
 * GET /api/tasks/[taskId]
 * 获取任务状态
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    const { taskId } = await params
    const { task, execution } = await executionQueue.getTaskWithDetails(taskId)

    if (!task) {
      return ApiResponse.error('任务不存在或已过期', 404)
    }

    // 验证权限（只能查看自己的任务）
    if (task.userId !== session.user.id) {
      return ApiResponse.error('无权访问此任务', 403)
    }

    return ApiResponse.success({
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
    return ApiResponse.error('获取任务状态失败', 500)
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
      return ApiResponse.error('未登录', 401)
    }

    const { taskId } = await params
    const task = executionQueue.getTask(taskId)

    if (!task) {
      return ApiResponse.error('任务不存在或已过期', 404)
    }

    // 验证权限
    if (task.userId !== session.user.id) {
      return ApiResponse.error('无权取消此任务', 403)
    }

    const cancelled = executionQueue.cancelTask(taskId)

    if (!cancelled) {
      return ApiResponse.error('只能取消等待中的任务', 400)
    }

    return ApiResponse.success({
      message: '任务已取消',
    })
  } catch (error) {
    console.error('Cancel task error:', error)
    return ApiResponse.error('取消任务失败', 500)
  }
}
