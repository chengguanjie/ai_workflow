/**
 * 工作流版本详情 API
 *
 * GET /api/workflows/[id]/versions/[versionId] - 获取版本详情
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { versionService } from '@/lib/services/version.service'
import { workflowService } from '@/server/services/workflow.service'

/**
 * GET /api/workflows/[id]/versions/[versionId]
 * 获取版本详情
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
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

  // 获取版本详情
  const version = await versionService.getVersion(versionId)

  if (!version || version.workflowId !== workflowId) {
    throw new NotFoundError('版本不存在')
  }

  return ApiResponse.success(version)
})
