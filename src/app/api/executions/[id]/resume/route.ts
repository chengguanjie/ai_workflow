/**
 * 断点续执行 API
 *
 * POST /api/executions/[id]/resume - 恢复执行失败的工作流
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { validateCheckpoint, createWorkflowHash } from '@/lib/workflow/checkpoint'
import { executionQueue } from '@/lib/workflow/queue'
import { redactDeep } from '@/lib/observability/redaction'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/executions/[id]/resume
 * 恢复执行失败的工作流
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    const { id: executionId } = await params

    // 获取原执行记录
    const originalExecution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            config: true,
            organizationId: true,
          },
        },
      },
    })

    if (!originalExecution) {
      return ApiResponse.error('执行记录不存在或无权访问', 404)
    }

    // 检查是否可以恢复
    if (!originalExecution.canResume) {
      return ApiResponse.error('此执行记录不支持恢复执行', 400)
    }

    if (originalExecution.status !== 'FAILED') {
      return ApiResponse.error('只能恢复失败的执行记录', 400)
    }

    // 验证工作流是否已变更
    const config = originalExecution.workflow.config as { nodes?: unknown[]; edges?: unknown[] }
    const currentHash = createWorkflowHash(config.nodes || [], config.edges || [])
    const validation = await validateCheckpoint(executionId, currentHash)

    if (!validation.valid) {
      return ApiResponse.error(validation.reason || '检查点验证失败', 400)
    }

    // 创建新的执行记录（复制检查点）
    const newExecution = await prisma.execution.create({
      data: {
        workflowId: originalExecution.workflowId,
        userId: session.user.id,
        input: JSON.parse(JSON.stringify(redactDeep(originalExecution.input ?? {}))),
        status: 'PENDING',
        checkpoint: originalExecution.checkpoint ?? undefined,
        resumedFromId: executionId,
        organizationId: originalExecution.workflow.organizationId,
      },
    })

    // 标记原执行为已恢复（不再可恢复）
    await prisma.execution.update({
      where: { id: executionId },
      data: { canResume: false },
    })

    // 将任务加入队列
    const taskId = await executionQueue.enqueue(
      originalExecution.workflowId,
      originalExecution.workflow.organizationId,
      session.user.id,
      (originalExecution.input as Record<string, unknown>) ?? {},
      {
        priority: 1, // 恢复执行优先级较高
      }
    )

    return ApiResponse.success({
      success: true,
      execution: {
        id: newExecution.id,
        status: newExecution.status,
        resumedFromId: executionId,
        taskId,
      },
      message: '工作流恢复执行已启动',
    })
  } catch (error) {
    console.error('Resume execution error:', error)
    return ApiResponse.error('恢复执行失败', 500)
  }
}

/**
 * GET /api/executions/[id]/resume
 * 获取执行记录的恢复状态
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    const { id: executionId } = await params

    // 获取执行记录
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
      select: {
        id: true,
        status: true,
        canResume: true,
        checkpoint: true,
        lastCheckpoint: true,
        resumedFromId: true,
        error: true,
        workflow: {
          select: {
            config: true,
          },
        },
      },
    })

    if (!execution) {
      return ApiResponse.error('执行记录不存在或无权访问', 404)
    }

    // 检查是否可以恢复
    let canResumeNow = false
    let resumeBlockReason: string | undefined

    if (execution.status !== 'FAILED') {
      resumeBlockReason = '只能恢复失败的执行记录'
    } else if (!execution.canResume) {
      resumeBlockReason = '此执行已被恢复或没有可用的检查点'
    } else if (!execution.checkpoint) {
      resumeBlockReason = '没有可用的检查点'
    } else {
      // 验证工作流是否已变更
      const config = execution.workflow.config as { nodes?: unknown[]; edges?: unknown[] }
      const currentHash = createWorkflowHash(config.nodes || [], config.edges || [])
      const validation = await validateCheckpoint(executionId, currentHash)

      if (!validation.valid) {
        resumeBlockReason = validation.reason
      } else {
        canResumeNow = true
      }
    }

    // 获取检查点信息
    const checkpoint = execution.checkpoint as {
      completedNodes?: Record<string, unknown>
      failedNodeId?: string
    } | null

    return ApiResponse.success({
      executionId: execution.id,
      status: execution.status,
      canResume: canResumeNow,
      resumeBlockReason,
      lastCheckpoint: execution.lastCheckpoint,
      resumedFromId: execution.resumedFromId,
      error: execution.error,
      checkpointInfo: checkpoint
        ? {
          completedNodesCount: Object.keys(checkpoint.completedNodes || {}).length,
          failedNodeId: checkpoint.failedNodeId,
        }
        : null,
    })
  } catch (error) {
    console.error('Get resume status error:', error)
    return ApiResponse.error('获取恢复状态失败', 500)
  }
}
