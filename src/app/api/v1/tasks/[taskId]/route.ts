/**
 * 公开的任务状态查询 API (使用 API Token 认证)
 *
 * GET /api/v1/tasks/[taskId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executionQueue } from '@/lib/workflow/queue'
import { createHash } from 'crypto'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

// 验证 API Token
async function verifyApiToken(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: '缺少 Authorization 头', status: 401 }
  }

  const token = authHeader.slice(7)
  if (!token) {
    return { error: '无效的 Token', status: 401 }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
  })

  if (!apiToken) {
    return { error: '无效的 Token', status: 401 }
  }

  if (!apiToken.isActive) {
    return { error: 'Token 已禁用', status: 403 }
  }

  if (apiToken.expiresAt && new Date(apiToken.expiresAt) < new Date()) {
    return { error: 'Token 已过期', status: 403 }
  }

  return { organizationId: apiToken.organizationId }
}

/**
 * GET /api/v1/tasks/[taskId]
 * 查询异步任务状态
 *
 * Headers:
 *   Authorization: Bearer YOUR_API_TOKEN
 *
 * Response:
 * {
 *   taskId: string
 *   status: 'pending' | 'running' | 'completed' | 'failed'
 *   result?: {
 *     output?: Record<string, unknown>
 *     error?: string
 *     duration?: number
 *     totalTokens?: number
 *   }
 *   createdAt: string
 *   completedAt?: string
 * }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // 验证 Token
    const authResult = await verifyApiToken(request.headers.get('Authorization'))
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { taskId } = await params
    const { task, execution } = await executionQueue.getTaskWithDetails(taskId)

    if (!task) {
      return NextResponse.json(
        { error: '任务不存在或已过期' },
        { status: 404 }
      )
    }

    // 返回任务状态
    const response: Record<string, unknown> = {
      taskId: task.id,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
    }

    if (task.startedAt) {
      response.startedAt = task.startedAt.toISOString()
    }

    if (task.completedAt) {
      response.completedAt = task.completedAt.toISOString()
    }

    if (task.status === 'completed' || task.status === 'failed') {
      response.result = {
        output: task.result?.output || execution?.output,
        error: task.error || execution?.error,
        duration: task.result?.duration || execution?.duration,
        totalTokens: task.result?.totalTokens || execution?.totalTokens,
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Get task status error:', error)
    return NextResponse.json(
      { error: '获取任务状态失败' },
      { status: 500 }
    )
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
