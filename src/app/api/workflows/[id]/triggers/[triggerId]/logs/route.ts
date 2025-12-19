/**
 * Trigger Logs API
 *
 * GET /api/workflows/[id]/triggers/[triggerId]/logs - List trigger logs
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { validateQueryParams } from '@/lib/api/with-validation'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'
import { triggerLogListSchema } from '@/lib/validations/trigger'
import { NotFoundError, BusinessError } from '@/lib/errors'

/**
 * GET /api/workflows/[id]/triggers/[triggerId]/logs
 *
 * List trigger logs with pagination and filtering
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  const triggerId = params?.triggerId

  if (!workflowId || !triggerId) {
    throw new BusinessError('缺少必要参数')
  }

  // 验证触发器存在且属于当前组织
  const trigger = await prisma.workflowTrigger.findFirst({
    where: {
      id: triggerId,
      workflowId,
      workflow: {
        organizationId: user.organizationId,
        deletedAt: null,
      },
    },
    select: { id: true },
  })

  if (!trigger) {
    throw new NotFoundError('触发器不存在')
  }

  // 解析查询参数
  const query = validateQueryParams(request, triggerLogListSchema)

  // 构建查询条件
  const where: Record<string, unknown> = { triggerId }
  if (query.status) {
    where.status = query.status
  }
  if (query.startDate || query.endDate) {
    where.triggeredAt = {}
    if (query.startDate) {
      (where.triggeredAt as Record<string, Date>).gte = new Date(query.startDate)
    }
    if (query.endDate) {
      (where.triggeredAt as Record<string, Date>).lte = new Date(query.endDate)
    }
  }

  // 查询日志
  const [logs, total] = await Promise.all([
    prisma.triggerLog.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { triggeredAt: 'desc' },
      select: {
        id: true,
        status: true,
        requestMethod: true,
        requestHeaders: true,
        requestBody: true,
        requestIp: true,
        executionId: true,
        responseCode: true,
        errorMessage: true,
        triggeredAt: true,
        completedAt: true,
        duration: true,
      },
    }),
    prisma.triggerLog.count({ where }),
  ])

  return ApiResponse.paginated(logs, {
    page: query.page,
    pageSize: query.pageSize,
    total,
  })
})
