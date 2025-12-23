import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { executionQueue } from '@/lib/workflow/queue'
import { ApiResponse } from '@/lib/api/api-response'

/**
 * GET /api/tasks
 * 获取队列状态
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    // 只有管理员可以查看队列状态
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('无权查看队列状态', 403)
    }

    const status = executionQueue.getQueueStatus()

    return ApiResponse.success({
      queue: status,
    })
  } catch (error) {
    console.error('Get queue status error:', error)
    return ApiResponse.error('获取队列状态失败', 500)
  }
}
