import { NextRequest, NextResponse } from 'next/server'
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
  params: Promise<{ taskId: string }>
}

/**
 * GET /api/v1/tasks/[taskId]
 * 查询异步任务状态
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // 验证 Token 和作用域 (tasks 使用 executions 作用域)
    const authResult = await validateApiTokenWithScope(request, 'executions')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { taskId } = await params
    const { task, execution } = await executionQueue.getTaskWithDetails(taskId)

    if (!task) {
      return ApiResponse.error('任务不存在或已过期', 404)
    }

    // 跨组织验证：验证任务关联的执行记录是否属于Token所属组织
    // 如果有执行记录，验证其组织ID
    if (execution) {
      const crossOrgResult = validateCrossOrganization(
        token.organizationId,
        execution.organizationId
      )
      if (!crossOrgResult.success) {
        // 返回404而非403，避免信息泄露
        return createCrossOrgNotFoundResponse('任务')
      }
    }

    // 更新Token使用统计
    await updateTokenUsage(token.id)

    // 返回任务状态
    const data: Record<string, unknown> = {
      taskId: task.id,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
    }

    if (task.startedAt) {
      data.startedAt = task.startedAt.toISOString()
    }

    if (task.completedAt) {
      data.completedAt = task.completedAt.toISOString()
    }

    if (task.status === 'completed' || task.status === 'failed') {
      data.result = {
        output: task.result?.output || execution?.output,
        error: task.error || execution?.error,
        duration: task.result?.duration || execution?.duration,
        totalTokens: task.result?.totalTokens || execution?.totalTokens,
      }
    }

    if (execution) {
      data.executionId = execution.id
      data.executionStatus = execution.status
    }

    return ApiResponse.success(data)
  } catch (error) {
    console.error('Get task status error:', error)
    return ApiResponse.error('获取任务状态失败', 500)
  }
}

// OPTIONS: 支持 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
