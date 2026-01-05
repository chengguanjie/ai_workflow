/**
 * V1 Single Workflow Trigger API Routes
 *
 * Provides public API endpoints for individual trigger operations.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET    /api/v1/workflows/[id]/triggers/[triggerId] - Get trigger details
 * - PUT    /api/v1/workflows/[id]/triggers/[triggerId] - Update trigger
 * - DELETE /api/v1/workflows/[id]/triggers/[triggerId] - Delete trigger
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  createCrossOrgNotFoundResponse,
  updateTokenUsage,
} from '@/lib/auth'
import { scheduler } from '@/lib/scheduler'
import cron from 'node-cron'

interface RouteParams {
  params: Promise<{ id: string; triggerId: string }>
}

/**
 * Validate cron expression format
 */
function isValidCronExpression(expression: string): boolean {
  return cron.validate(expression)
}

/**
 * Validate trigger ownership and return trigger with workflow info
 */
async function validateTriggerOwnership(
  workflowId: string,
  triggerId: string,
  tokenOrganizationId: string
) {
  const trigger = await prisma.workflowTrigger.findFirst({
    where: {
      id: triggerId,
      workflowId,
      workflow: {
        deletedAt: null,
      },
    },
    include: {
      workflow: {
        select: { id: true, name: true, organizationId: true },
      },
    },
  })

  if (!trigger) {
    return { success: false as const, error: 'not_found' }
  }

  // Validate cross-organization access
  const crossOrgResult = validateCrossOrganization(
    tokenOrganizationId,
    trigger.workflow.organizationId
  )
  if (!crossOrgResult.success) {
    return { success: false as const, error: 'cross_org' }
  }

  return { success: true as const, trigger }
}

/**
 * GET /api/v1/workflows/[id]/triggers/[triggerId]
 * Get trigger details including recent logs
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId, triggerId } = await params

    // Validate trigger ownership
    const ownershipResult = await validateTriggerOwnership(
      workflowId,
      triggerId,
      token.organizationId
    )

    if (!ownershipResult.success) {
      if (ownershipResult.error === 'cross_org') {
        return createCrossOrgNotFoundResponse('触发器')
      }
      return ApiResponse.error('触发器不存在', 404)
    }

    const { trigger } = ownershipResult

    // Get recent trigger logs
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

    // Statistics
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

    // Update token usage
    await updateTokenUsage(token.id)

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
      workflow: {
        id: trigger.workflow.id,
        name: trigger.workflow.name,
      },
      recentLogs,
      stats: {
        total: trigger.triggerCount,
        success: statsMap.SUCCESS || 0,
        failed: statsMap.FAILED || 0,
        skipped: statsMap.SKIPPED || 0,
      },
    })
  } catch (error) {
    console.error('V1 API get trigger error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取触发器详情失败',
      500
    )
  }
}

/**
 * PUT /api/v1/workflows/[id]/triggers/[triggerId]
 * Update trigger settings
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId, triggerId } = await params

    // Validate trigger ownership
    const ownershipResult = await validateTriggerOwnership(
      workflowId,
      triggerId,
      token.organizationId
    )

    if (!ownershipResult.success) {
      if (ownershipResult.error === 'cross_org') {
        return createCrossOrgNotFoundResponse('触发器')
      }
      return ApiResponse.error('触发器不存在', 404)
    }

    const { trigger } = ownershipResult

    // Parse request body
    const body = await request.json().catch(() => null)
    if (!body) {
      return ApiResponse.error('请求体不能为空', 400)
    }

    const {
      name,
      enabled,
      cronExpression,
      timezone,
      inputTemplate,
      retryOnFail,
      maxRetries,
    } = body as {
      name?: string
      enabled?: boolean
      cronExpression?: string | null
      timezone?: string
      inputTemplate?: Record<string, unknown> | null
      retryOnFail?: boolean
      maxRetries?: number
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return ApiResponse.error('触发器名称不能为空', 400)
      }
      if (name.length > 100) {
        return ApiResponse.error('触发器名称不能超过100个字符', 400)
      }
    }

    // Validate cron expression if provided
    if (cronExpression !== undefined && cronExpression !== null) {
      if (!isValidCronExpression(cronExpression)) {
        return ApiResponse.error('无效的 Cron 表达式', 400, { code: 'invalid_cron' })
      }
    }

    // Validate maxRetries if provided
    if (maxRetries !== undefined && (maxRetries < 1 || maxRetries > 10)) {
      return ApiResponse.error('maxRetries 必须在 1-10 之间', 400)
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name.trim()
    if (enabled !== undefined) updateData.enabled = enabled
    if (cronExpression !== undefined) updateData.cronExpression = cronExpression
    if (timezone !== undefined) updateData.timezone = timezone
    if (inputTemplate !== undefined) {
      updateData.inputTemplate = inputTemplate ? JSON.parse(JSON.stringify(inputTemplate)) : null
    }
    if (retryOnFail !== undefined) updateData.retryOnFail = retryOnFail
    if (maxRetries !== undefined) updateData.maxRetries = maxRetries

    // Update trigger
    const updatedTrigger = await prisma.workflowTrigger.update({
      where: { id: triggerId },
      data: updateData,
    })

    // Sync scheduler for SCHEDULE type triggers
    if (trigger.type === 'SCHEDULE') {
      try {
        const isEnabled = enabled !== undefined ? enabled : trigger.enabled
        const cronExp = cronExpression !== undefined ? cronExpression : trigger.cronExpression

        if (isEnabled && cronExp) {
          // Update or add scheduled job
          const finalInputTemplate = (inputTemplate !== undefined ? inputTemplate : trigger.inputTemplate) as Record<string, unknown> | null
          const finalTimezone = (timezone !== undefined ? timezone : trigger.timezone) || 'Asia/Shanghai'
          const finalRetryOnFail = retryOnFail !== undefined ? retryOnFail : trigger.retryOnFail
          const finalMaxRetries = maxRetries !== undefined ? maxRetries : trigger.maxRetries

          scheduler.scheduleJob(
            triggerId,
            cronExp,
            workflowId,
            trigger.workflow.organizationId,
            trigger.createdById,
            { 
              inputTemplate: finalInputTemplate, 
              timezone: finalTimezone, 
              retryOnFail: finalRetryOnFail, 
              maxRetries: finalMaxRetries 
            }
          )
        } else {
          // Disabled or removed cron expression, remove scheduled job
          scheduler.removeJob(triggerId)
        }
      } catch (error) {
        console.error('Failed to update scheduled job:', error)
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Update token usage
    await updateTokenUsage(token.id)

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
  } catch (error) {
    console.error('V1 API update trigger error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '更新触发器失败',
      500
    )
  }
}

/**
 * DELETE /api/v1/workflows/[id]/triggers/[triggerId]
 * Delete a trigger
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId, triggerId } = await params

    // Validate trigger ownership
    const ownershipResult = await validateTriggerOwnership(
      workflowId,
      triggerId,
      token.organizationId
    )

    if (!ownershipResult.success) {
      if (ownershipResult.error === 'cross_org') {
        return createCrossOrgNotFoundResponse('触发器')
      }
      return ApiResponse.error('触发器不存在', 404)
    }

    const { trigger } = ownershipResult

    // Remove from scheduler if it's a SCHEDULE type
    if (trigger.type === 'SCHEDULE') {
      scheduler.removeJob(triggerId)
    }

    // Delete trigger (associated logs will be cascade deleted)
    await prisma.workflowTrigger.delete({
      where: { id: triggerId },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({ message: '触发器已删除' })
  } catch (error) {
    console.error('V1 API delete trigger error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '删除触发器失败',
      500
    )
  }
}

// OPTIONS: Support CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
