/**
 * Single Workflow Trigger API Routes
 *
 * GET    /api/workflows/[id]/triggers/[triggerId] - Get trigger details
 * PUT    /api/workflows/[id]/triggers/[triggerId] - Update trigger
 * DELETE /api/workflows/[id]/triggers/[triggerId] - Delete trigger
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { validateRequestBody } from '@/lib/api/with-validation'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'
import { triggerUpdateSchema } from '@/lib/validations/trigger'
import { scheduler } from '@/lib/scheduler'
import { NotFoundError, BusinessError } from '@/lib/errors'

/**
 * 验证触发器所有权
 */
async function validateTriggerOwnership(
  workflowId: string,
  triggerId: string,
  organizationId: string
) {
  const trigger = await prisma.workflowTrigger.findFirst({
    where: {
      id: triggerId,
      workflowId,
      workflow: {
        organizationId,
        deletedAt: null,
      },
    },
    include: {
      workflow: {
        select: { id: true, name: true },
      },
    },
  })

  if (!trigger) {
    throw new NotFoundError('触发器不存在')
  }

  return trigger
}

/**
 * GET /api/workflows/[id]/triggers/[triggerId]
 *
 * Get trigger details including recent logs
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  const triggerId = params?.triggerId

  if (!workflowId || !triggerId) {
    throw new BusinessError('缺少必要参数')
  }

  const trigger = await validateTriggerOwnership(workflowId, triggerId, user.organizationId)

  // 获取最近的触发日志
  const recentLogs = await prisma.triggerLog.findMany({
    where: { triggerId },
    orderBy: { triggeredAt: 'desc' },
    take: 10,
    select: {
      id: true,
      status: true,
      requestMethod: true,
      requestIp: true,
      executionId: true,
      responseCode: true,
      errorMessage: true,
      triggeredAt: true,
      completedAt: true,
      duration: true,
    },
  })

  // 统计信息
  const stats = await prisma.triggerLog.groupBy({
    by: ['status'],
    where: { triggerId },
    _count: true,
  })

  const statsMap = stats.reduce((acc, s) => {
    acc[s.status] = s._count
    return acc
  }, {} as Record<string, number>)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return ApiResponse.success({
    id: trigger.id,
    name: trigger.name,
    type: trigger.type,
    enabled: trigger.enabled,
    webhookUrl: trigger.webhookPath ? `${baseUrl}/api/webhooks/${trigger.webhookPath}` : null,
    hasSecret: !!trigger.webhookSecret,
    cronExpression: trigger.cronExpression,
    timezone: trigger.timezone,
    inputTemplate: trigger.inputTemplate,
    retryOnFail: trigger.retryOnFail,
    maxRetries: trigger.maxRetries,
    triggerCount: trigger.triggerCount,
    lastTriggeredAt: trigger.lastTriggeredAt,
    lastSuccessAt: trigger.lastSuccessAt,
    lastFailureAt: trigger.lastFailureAt,
    createdAt: trigger.createdAt,
    updatedAt: trigger.updatedAt,
    workflow: trigger.workflow,
    recentLogs,
    stats: {
      total: trigger.triggerCount,
      success: statsMap.SUCCESS || 0,
      failed: statsMap.FAILED || 0,
      skipped: statsMap.SKIPPED || 0,
    },
  })
})

/**
 * PUT /api/workflows/[id]/triggers/[triggerId]
 *
 * Update trigger settings
 */
export const PUT = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  const triggerId = params?.triggerId

  if (!workflowId || !triggerId) {
    throw new BusinessError('缺少必要参数')
  }

  const trigger = await validateTriggerOwnership(workflowId, triggerId, user.organizationId)

  // 验证请求体
  const data = await validateRequestBody(request, triggerUpdateSchema)

  // 构建更新数据
  const updateData: Record<string, unknown> = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.enabled !== undefined) updateData.enabled = data.enabled
  if (data.cronExpression !== undefined) updateData.cronExpression = data.cronExpression
  if (data.timezone !== undefined) updateData.timezone = data.timezone
  if (data.inputTemplate !== undefined) updateData.inputTemplate = data.inputTemplate
  if (data.retryOnFail !== undefined) updateData.retryOnFail = data.retryOnFail
  if (data.maxRetries !== undefined) updateData.maxRetries = data.maxRetries

  // 更新触发器
  const updatedTrigger = await prisma.workflowTrigger.update({
    where: { id: triggerId },
    data: updateData,
  })

  // 同步调度器
  if (trigger.type === 'SCHEDULE') {
    try {
      const isEnabled = data.enabled !== undefined ? data.enabled : trigger.enabled
      const cronExp = data.cronExpression !== undefined ? data.cronExpression : trigger.cronExpression

      if (isEnabled && cronExp) {
        // 更新或添加定时任务
        const inputTemplate = (data.inputTemplate !== undefined ? data.inputTemplate : trigger.inputTemplate) as Record<string, unknown> | null
        const timezone = (data.timezone !== undefined ? data.timezone : trigger.timezone) || 'Asia/Shanghai'
        const retryOnFail = data.retryOnFail !== undefined ? data.retryOnFail : trigger.retryOnFail
        const maxRetries = data.maxRetries !== undefined ? data.maxRetries : trigger.maxRetries

        scheduler.scheduleJob(
          triggerId,
          cronExp,
          workflowId,
          user.organizationId,
          trigger.createdById,
          { inputTemplate, timezone, retryOnFail, maxRetries }
        )
      } else {
        // 禁用或删除 cron 表达式，移除定时任务
        scheduler.removeJob(triggerId)
      }
    } catch (error) {
      console.error('Failed to update scheduled job:', error)
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return ApiResponse.success({
    id: updatedTrigger.id,
    name: updatedTrigger.name,
    type: updatedTrigger.type,
    enabled: updatedTrigger.enabled,
    webhookUrl: updatedTrigger.webhookPath
      ? `${baseUrl}/api/webhooks/${updatedTrigger.webhookPath}`
      : null,
    hasSecret: !!updatedTrigger.webhookSecret,
    cronExpression: updatedTrigger.cronExpression,
    timezone: updatedTrigger.timezone,
    inputTemplate: updatedTrigger.inputTemplate,
    retryOnFail: updatedTrigger.retryOnFail,
    maxRetries: updatedTrigger.maxRetries,
    updatedAt: updatedTrigger.updatedAt,
  })
})

/**
 * DELETE /api/workflows/[id]/triggers/[triggerId]
 *
 * Delete a trigger
 */
export const DELETE = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  const triggerId = params?.triggerId

  if (!workflowId || !triggerId) {
    throw new BusinessError('缺少必要参数')
  }

  const trigger = await validateTriggerOwnership(workflowId, triggerId, user.organizationId)

  // 从调度器中移除
  if (trigger.type === 'SCHEDULE') {
    scheduler.removeJob(triggerId)
  }

  // 删除触发器（关联的日志会级联删除）
  await prisma.workflowTrigger.delete({
    where: { id: triggerId },
  })

  return ApiResponse.success({ message: '触发器已删除' })
})
