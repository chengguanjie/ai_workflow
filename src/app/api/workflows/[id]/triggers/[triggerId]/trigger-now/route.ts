/**
 * 手动触发定时任务 API
 *
 * POST /api/workflows/[id]/triggers/[triggerId]/trigger-now
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError, BusinessError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { scheduler } from '@/lib/scheduler'

interface RouteParams {
  id: string
  triggerId: string
}

/**
 * POST /api/workflows/[id]/triggers/[triggerId]/trigger-now
 * 立即执行一次定时任务
 */
export const POST = withAuth(async (
  request: NextRequest,
  { user, params }: AuthContext
) => {
  const { id: workflowId, triggerId } = params as unknown as RouteParams

  // 验证工作流存在且属于当前组织
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId: user.organizationId,
      deletedAt: null,
    },
  })

  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 验证触发器存在且属于该工作流
  const trigger = await prisma.workflowTrigger.findFirst({
    where: {
      id: triggerId,
      workflowId,
    },
  })

  if (!trigger) {
    throw new NotFoundError('触发器不存在')
  }

  // 检查触发器类型
  if (trigger.type !== 'SCHEDULE') {
    throw new BusinessError('只有定时任务类型的触发器才能手动触发')
  }

  // 检查触发器是否启用并已调度
  if (!scheduler.hasJob(triggerId)) {
    // 如果未调度，尝试先调度
    if (trigger.enabled && trigger.cronExpression) {
      scheduler.scheduleJob(
        trigger.id,
        trigger.cronExpression,
        workflowId,
        user.organizationId,
        trigger.createdById,
        {
          inputTemplate: trigger.inputTemplate as Record<string, unknown> | null,
          timezone: trigger.timezone || 'Asia/Shanghai',
          retryOnFail: trigger.retryOnFail,
          maxRetries: trigger.maxRetries,
        }
      )
    } else {
      throw new BusinessError('触发器未启用或未配置 Cron 表达式')
    }
  }

  // 执行触发
  try {
    await scheduler.triggerNow(triggerId)

    return ApiResponse.success({
      message: '触发成功，任务已加入执行队列',
      triggerId,
      triggeredAt: new Date().toISOString(),
    })
  } catch (error) {
    throw new BusinessError(
      error instanceof Error ? error.message : '触发失败'
    )
  }
})
