/**
 * V1 Workflow Triggers API Routes
 *
 * Provides public API endpoints for workflow trigger management.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET  /api/v1/workflows/[id]/triggers - List triggers for a workflow
 * - POST /api/v1/workflows/[id]/triggers - Create a new trigger
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
import { generateWebhookPath, generateWebhookSecret } from '@/lib/webhook/signature'
import { scheduler } from '@/lib/scheduler'
import cron from 'node-cron'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Validate cron expression format
 */
function isValidCronExpression(expression: string): boolean {
  return cron.validate(expression)
}

/**
 * GET /api/v1/workflows/[id]/triggers
 * List all triggers for a workflow
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

    // Find workflow
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // Validate cross-organization access
    const crossOrgResult = validateCrossOrganization(
      token.organizationId,
      workflow.organizationId
    )
    if (!crossOrgResult.success) {
      return createCrossOrgNotFoundResponse('工作流')
    }

    // Parse query parameters
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)))
    const type = url.searchParams.get('type')
    const enabledParam = url.searchParams.get('enabled')

    // Build query conditions
    const where: Record<string, unknown> = { workflowId }
    if (type && ['MANUAL', 'WEBHOOK', 'SCHEDULE'].includes(type)) {
      where.type = type
    }
    if (enabledParam !== null) {
      where.enabled = enabledParam === 'true'
    }

    // Query triggers
    const [triggers, total] = await Promise.all([
      prisma.workflowTrigger.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { logs: true },
          },
        },
      }),
      prisma.workflowTrigger.count({ where }),
    ])

    // Build webhook URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const triggersWithUrl = triggers.map((trigger) => ({
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
      logsCount: trigger._count.logs,
      createdAt: trigger.createdAt,
      updatedAt: trigger.updatedAt,
    }))

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.paginated(triggersWithUrl, {
      page,
      pageSize,
      total,
    })
  } catch (error) {
    console.error('V1 API list triggers error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取触发器列表失败',
      500
    )
  }
}

/**
 * POST /api/v1/workflows/[id]/triggers
 * Create a new trigger for a workflow
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

    // Find workflow
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // Validate cross-organization access
    const crossOrgResult = validateCrossOrganization(
      token.organizationId,
      workflow.organizationId
    )
    if (!crossOrgResult.success) {
      return createCrossOrgNotFoundResponse('工作流')
    }

    // Parse request body
    const body = await request.json().catch(() => null)
    if (!body) {
      return ApiResponse.error('请求体不能为空', 400)
    }

    const {
      name,
      type,
      enabled = true,
      cronExpression,
      timezone = 'Asia/Shanghai',
      inputTemplate,
      retryOnFail = false,
      maxRetries = 3,
    } = body as {
      name?: string
      type?: string
      enabled?: boolean
      cronExpression?: string
      timezone?: string
      inputTemplate?: Record<string, unknown>
      retryOnFail?: boolean
      maxRetries?: number
    }

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return ApiResponse.error('触发器名称不能为空', 400)
    }
    if (name.length > 100) {
      return ApiResponse.error('触发器名称不能超过100个字符', 400)
    }

    if (!type || !['WEBHOOK', 'SCHEDULE'].includes(type)) {
      return ApiResponse.error('触发器类型必须是 WEBHOOK 或 SCHEDULE', 400)
    }

    // Validate cron expression for SCHEDULE type
    if (type === 'SCHEDULE') {
      if (!cronExpression) {
        return ApiResponse.error('定时任务必须配置 Cron 表达式', 400, { code: 'invalid_cron' })
      }
      if (!isValidCronExpression(cronExpression)) {
        return ApiResponse.error('无效的 Cron 表达式', 400, { code: 'invalid_cron' })
      }
    }

    // Validate maxRetries
    if (maxRetries !== undefined && (maxRetries < 1 || maxRetries > 10)) {
      return ApiResponse.error('maxRetries 必须在 1-10 之间', 400)
    }

    // Generate webhook path and secret for WEBHOOK type
    let webhookPath: string | null = null
    let webhookSecret: string | null = null

    if (type === 'WEBHOOK') {
      webhookPath = generateWebhookPath()
      webhookSecret = generateWebhookSecret()
    }

    // Get the user who created the token for createdById
    const tokenWithUser = await prisma.apiToken.findUnique({
      where: { id: token.id },
      select: { createdById: true },
    })

    const createdById = tokenWithUser?.createdById || token.id

    // Create trigger
    const trigger = await prisma.workflowTrigger.create({
      data: {
        name: name.trim(),
        type: type as 'WEBHOOK' | 'SCHEDULE',
        enabled,
        webhookPath,
        webhookSecret,
        cronExpression: cronExpression || null,
        timezone,
        inputTemplate: inputTemplate ? JSON.parse(JSON.stringify(inputTemplate)) : undefined,
        retryOnFail,
        maxRetries,
        workflowId,
        createdById,
      },
    })

    // If it's a schedule trigger and enabled, add to scheduler
    if (type === 'SCHEDULE' && enabled && cronExpression) {
      try {
        scheduler.scheduleJob(
          trigger.id,
          cronExpression,
          workflowId,
          workflow.organizationId,
          createdById,
          { inputTemplate, timezone, retryOnFail, maxRetries }
        )
      } catch (error) {
        console.error('Failed to schedule job:', error)
      }
    }

    // Build response
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const response = {
      id: trigger.id,
      name: trigger.name,
      type: trigger.type,
      enabled: trigger.enabled,
      webhookUrl: webhookPath ? `${baseUrl}/api/webhooks/${webhookPath}` : null,
      webhookSecret: webhookSecret, // Only returned on creation
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      inputTemplate: trigger.inputTemplate,
      retryOnFail: trigger.retryOnFail,
      maxRetries: trigger.maxRetries,
      createdAt: trigger.createdAt,
    }

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.created(response)
  } catch (error) {
    console.error('V1 API create trigger error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '创建触发器失败',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
