/**
 * 任务队列 API
 *
 * GET /api/tasks - 获取队列状态
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { executionQueue } from '@/lib/workflow/queue'

/**
 * GET /api/tasks
 * 获取队列状态
 *
 * Response:
 * {
 *   queue: {
 *     pending: number
 *     running: number
 *     completed: number
 *     failed: number
 *     total: number
 *   }
 * }
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 只有管理员可以查看队列状态
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: '无权查看队列状态' },
        { status: 403 }
      )
    }

    const status = executionQueue.getQueueStatus()

    return NextResponse.json({
      queue: status,
    })
  } catch (error) {
    console.error('Get queue status error:', error)
    return NextResponse.json(
      { error: '获取队列状态失败' },
      { status: 500 }
    )
  }
}
