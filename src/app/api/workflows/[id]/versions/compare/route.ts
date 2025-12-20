/**
 * 版本对比 API
 *
 * GET /api/workflows/[id]/versions/compare - 对比两个版本的差异
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { versionService } from '@/lib/services/version.service'
import { workflowService } from '@/server/services/workflow.service'

/**
 * GET /api/workflows/[id]/versions/compare?from=xxx&to=xxx
 * 对比两个版本
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new NotFoundError('工作流不存在')
  }

  // 验证工作流存在且用户有权限
  const workflow = await workflowService.getById(workflowId, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 获取对比参数
  const { searchParams } = new URL(request.url)
  const fromVersionId = searchParams.get('from')
  const toVersionId = searchParams.get('to')

  if (!fromVersionId || !toVersionId) {
    throw new ValidationError('请提供要对比的两个版本ID（from 和 to）')
  }

  // 执行对比
  const comparison = await versionService.compareVersions(fromVersionId, toVersionId)

  // 生成摘要文本
  const summaryText = versionService.generateChangeSummaryText(comparison)

  return ApiResponse.success({
    comparison,
    summaryText
  })
})
