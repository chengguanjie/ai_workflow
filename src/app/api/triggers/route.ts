/**
 * Triggers API Routes
 *
 * GET /api/triggers - List all triggers across all workflows for the organization
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'

/**
 * GET /api/triggers
 *
 * List all triggers across all workflows for the current organization
 */
export const GET = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  // Query all triggers for workflows in the organization
  const triggers = await prisma.workflowTrigger.findMany({
    where: {
      workflow: {
        organizationId: user.organizationId,
        deletedAt: null,
      },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: { logs: true },
      },
    },
  })

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
    workflowId: trigger.workflowId,
    workflow: trigger.workflow,
  }))

  return ApiResponse.success(triggersWithUrl)
})
