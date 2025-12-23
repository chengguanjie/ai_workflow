/**
 * Scheduler API
 *
 * GET  /api/scheduler - Get scheduler and queue status
 * POST /api/scheduler - Initialize/reload scheduler
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ApiResponse } from '@/lib/api/api-response'
import { scheduler } from '@/lib/scheduler'
import { executionQueue } from '@/lib/workflow/queue'

// 只允许管理员访问
async function checkAdminAccess() {
  const session = await auth()
  if (!session?.user) {
    return { error: '未登录', status: 401 }
  }
  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return { error: '无权限', status: 403 }
  }
  return { user: session.user }
}

/**
 * GET /api/scheduler
 *
 * Get scheduler and queue status
 */
export async function GET(_request: NextRequest) {
  const authResult = await checkAdminAccess()
  if ('error' in authResult) {
    return ApiResponse.error(authResult.error!, authResult.status!)
  }

  try {
    const schedulerStatus = scheduler.getStatus()
    const queueStatus = await executionQueue.getQueueStatus()

    return ApiResponse.success({
      status: 'ok',
      scheduler: schedulerStatus,
      queue: queueStatus,
    })
  } catch (error) {
    console.error('Get scheduler status error:', error)
    return ApiResponse.error('获取调度器状态失败', 500)
  }
}

/**
 * POST /api/scheduler
 *
 * Initialize or reload the scheduler
 */
export async function POST(request: NextRequest) {
  const authResult = await checkAdminAccess()
  if ('error' in authResult) {
    return ApiResponse.error(authResult.error!, authResult.status!)
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { action } = body as { action?: string }

    if (action === 'stop') {
      scheduler.stopAll()
      return ApiResponse.success({
        status: 'ok',
        message: '调度器已停止',
        jobCount: 0,
      })
    }

    if (action === 'reload') {
      scheduler.stopAll()
    }

    await scheduler.initialize()

    return ApiResponse.success({
      status: 'ok',
      message: '调度器已初始化',
      jobCount: scheduler.getJobCount(),
    })
  } catch (error) {
    console.error('Initialize scheduler error:', error)
    return ApiResponse.error('初始化调度器失败', 500)
  }
}
