/**
 * 版本发布 API
 *
 * POST /api/workflows/[id]/versions/[versionId]/publish - 发布版本
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { versionService } from '@/lib/services/version.service'
import { workflowService } from '@/server/services/workflow.service'

/**
 * POST /api/workflows/[id]/versions/[versionId]/publish
 * 发布版本（设为活跃版本）
 */
export const POST = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
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

  // 发布版本
  const version = await versionService.publishVersion(workflowId, versionId)

  return ApiResponse.success(version)
})
