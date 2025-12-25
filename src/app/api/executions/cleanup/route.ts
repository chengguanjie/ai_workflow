/**
 * 清理卡住的执行记录 API
 *
 * POST /api/executions/cleanup - 将长时间处于 RUNNING 状态的执行标记为 FAILED
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// 默认超时时间：30 分钟
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未登录', 401)
    }

    const body = await request.json().catch(() => ({}))
    const timeoutMs = body.timeoutMs || DEFAULT_TIMEOUT_MS
    const executionId = body.executionId // 可选：指定清理某个执行

    const cutoffTime = new Date(Date.now() - timeoutMs)

    // 构建查询条件
    const where = {
      organizationId: session.user.organizationId,
      status: 'RUNNING' as const,
      ...(executionId
        ? { id: executionId }
        : { startedAt: { lt: cutoffTime } }
      ),
    }

    // 查找卡住的执行记录
    const stuckExecutions = await prisma.execution.findMany({
      where,
      select: {
        id: true,
        workflowId: true,
        startedAt: true,
        workflow: {
          select: { name: true }
        }
      }
    })

    if (stuckExecutions.length === 0) {
      return ApiResponse.success({
        message: '没有发现卡住的执行记录',
        cleaned: 0,
      })
    }

    // 批量更新为 FAILED 状态
    const updateResult = await prisma.execution.updateMany({
      where: {
        id: { in: stuckExecutions.map(e => e.id) }
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: '执行超时：系统自动标记为失败。可能原因：1. 服务器重启 2. 执行过程中发生未捕获的异常 3. 网络中断',
      }
    })

    return ApiResponse.success({
      message: `已清理 ${updateResult.count} 条卡住的执行记录`,
      cleaned: updateResult.count,
      executions: stuckExecutions.map(e => ({
        id: e.id,
        workflowName: e.workflow.name,
        startedAt: e.startedAt,
      }))
    })
  } catch (error) {
    console.error('清理执行记录失败:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '清理失败',
      500
    )
  }
}

// GET: 获取卡住的执行记录（不执行清理）
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const timeoutMs = parseInt(searchParams.get('timeoutMs') || String(DEFAULT_TIMEOUT_MS))

    const cutoffTime = new Date(Date.now() - timeoutMs)

    const stuckExecutions = await prisma.execution.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: 'RUNNING',
        startedAt: { lt: cutoffTime }
      },
      select: {
        id: true,
        workflowId: true,
        startedAt: true,
        createdAt: true,
        workflow: {
          select: { name: true }
        }
      },
      orderBy: { startedAt: 'asc' }
    })

    return ApiResponse.success({
      count: stuckExecutions.length,
      timeoutMinutes: Math.round(timeoutMs / 60000),
      executions: stuckExecutions.map(e => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflow.name,
        startedAt: e.startedAt,
        runningMinutes: e.startedAt
          ? Math.round((Date.now() - new Date(e.startedAt).getTime()) / 60000)
          : null,
      }))
    })
  } catch (error) {
    console.error('获取卡住的执行记录失败:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取失败',
      500
    )
  }
}
