/**
 * Regenerate Webhook Secret API
 *
 * POST /api/workflows/[id]/triggers/[triggerId]/regenerate-secret
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'
import { generateWebhookSecret } from '@/lib/webhook/signature'
import { NotFoundError, BusinessError } from '@/lib/errors'

/**
 * POST /api/workflows/[id]/triggers/[triggerId]/regenerate-secret
 *
 * Regenerate the webhook secret for a trigger
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
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
    select: {
      id: true,
      type: true,
    },
  })

  if (!trigger) {
    throw new NotFoundError('触发器不存在')
  }

  if (trigger.type !== 'WEBHOOK') {
    throw new BusinessError('只有 Webhook 类型的触发器可以重新生成密钥')
  }

  // 生成新密钥
  const newSecret = generateWebhookSecret()

  // 更新触发器
  await prisma.workflowTrigger.update({
    where: { id: triggerId },
    data: { webhookSecret: newSecret },
  })

  return ApiResponse.success({
    message: '密钥已重新生成',
    webhookSecret: newSecret,
  })
})
