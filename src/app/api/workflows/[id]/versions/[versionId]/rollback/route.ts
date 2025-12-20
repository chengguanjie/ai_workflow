/**
 * 版本回滚 API
 *
 * POST /api/workflows/[id]/versions/[versionId]/rollback - 回滚到指定版本
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { versionService } from '@/lib/services/version.service'
import { workflowService } from '@/server/services/workflow.service'
import { z } from 'zod'

const rollbackSchema = z.object({
  commitMessage: z.string().max(500).optional(),
})

/**
 * POST /api/workflows/[id]/versions/[versionId]/rollback
 * 回滚到指定版本
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  const versionId = params?.versionId

  if (!workflowId || !versionId) {
    throw new NotFoundError('版本不存在')
  }

  // 验证工作流存在且用户有权限
  const workflow = await workflowService.getById(workflowId, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 解析请求体
  let commitMessage: string | undefined
  try {
    const body = await request.json()
    const parseResult = rollbackSchema.safeParse(body)
    if (parseResult.success) {
      commitMessage = parseResult.data.commitMessage
    }
  } catch {
    // 忽略解析错误，使用默认提交信息
  }

  // 执行回滚
  const newVersion = await versionService.rollback(workflowId, versionId, user.id, commitMessage)

  return ApiResponse.success(newVersion)
})
