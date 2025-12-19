/**
 * Workflow Triggers API Routes
 *
 * GET  /api/workflows/[id]/triggers - List triggers for a workflow
 * POST /api/workflows/[id]/triggers - Create a new trigger
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { validateQueryParams, validateRequestBody } from '@/lib/api/with-validation'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'
import { triggerCreateSchema, triggerListSchema } from '@/lib/validations/trigger'
import { generateWebhookPath, generateWebhookSecret } from '@/lib/webhook/signature'
import { scheduler } from '@/lib/scheduler'
import { NotFoundError, BusinessError } from '@/lib/errors'

/**
 * GET /api/workflows/[id]/triggers
 *
 * List all triggers for a workflow
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new BusinessError('缺少工作流 ID')
  }

  // 验证工作流存在且属于当前组织
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })

  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 解析查询参数
  const query = validateQueryParams(request, triggerListSchema)

  // 构建查询条件
  const where: Record<string, unknown> = { workflowId }
  if (query.type) {
    where.type = query.type
  }
  if (query.enabled !== undefined) {
    where.enabled = query.enabled
  }

  // 查询触发器
  const [triggers, total] = await Promise.all([
    prisma.workflowTrigger.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { logs: true },
        },
      },
    }),
    prisma.workflowTrigger.count({ where }),
  ])

  // 构建 Webhook URL
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

  return ApiResponse.paginated(triggersWithUrl, {
    page: query.page,
    pageSize: query.pageSize,
    total,
  })
})

/**
 * POST /api/workflows/[id]/triggers
 *
 * Create a new trigger for a workflow
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new BusinessError('缺少工作流 ID')
  }

  // 验证工作流存在且属于当前组织
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: { id: true, name: true },
  })

  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 验证请求体
  const data = await validateRequestBody(request, triggerCreateSchema)

  // Webhook 类型需要生成路径和密钥
  let webhookPath: string | null = null
  let webhookSecret: string | null = null

  if (data.type === 'WEBHOOK') {
    webhookPath = generateWebhookPath()
    webhookSecret = generateWebhookSecret()
  }

  // 创建触发器
  const trigger = await prisma.workflowTrigger.create({
    data: {
      name: data.name,
      type: data.type,
      enabled: data.enabled,
      webhookPath,
      webhookSecret,
      cronExpression: data.cronExpression,
      timezone: data.timezone,
      inputTemplate: data.inputTemplate ? JSON.parse(JSON.stringify(data.inputTemplate)) : undefined,
      retryOnFail: data.retryOnFail,
      maxRetries: data.maxRetries,
      workflowId,
      createdById: user.id,
    },
  })

  // 如果是定时任务且启用，添加到调度器
  if (data.type === 'SCHEDULE' && data.enabled && data.cronExpression) {
    try {
      scheduler.scheduleJob(
        trigger.id,
        data.cronExpression,
        workflowId,
        user.organizationId,
        user.id,
        data.inputTemplate
      )
    } catch (error) {
      console.error('Failed to schedule job:', error)
    }
  }

  // 构建响应
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const response = {
    id: trigger.id,
    name: trigger.name,
    type: trigger.type,
    enabled: trigger.enabled,
    webhookUrl: webhookPath ? `${baseUrl}/api/webhooks/${webhookPath}` : null,
    webhookSecret: webhookSecret, // 仅在创建时返回密钥
    cronExpression: trigger.cronExpression,
    timezone: trigger.timezone,
    inputTemplate: trigger.inputTemplate,
    retryOnFail: trigger.retryOnFail,
    maxRetries: trigger.maxRetries,
    createdAt: trigger.createdAt,
  }

  return ApiResponse.created(response)
})
