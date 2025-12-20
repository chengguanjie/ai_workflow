/**
 * 工作流版本管理 API
 *
 * GET  /api/workflows/[id]/versions - 获取版本列表
 * POST /api/workflows/[id]/versions - 创建新版本
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { versionService } from '@/lib/services/version.service'
import { workflowService } from '@/server/services/workflow.service'
import { z } from 'zod'

// 创建版本请求验证
const createVersionSchema = z.object({
  versionTag: z.string().max(50).optional(),
  commitMessage: z.string().min(1, '请输入提交说明').max(500),
  publish: z.boolean().optional().default(false),
})

/**
 * GET /api/workflows/[id]/versions
 * 获取工作流版本列表
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

  // 获取分页参数
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const result = await versionService.getVersions(workflowId, { page, limit })

  return ApiResponse.success(result)
})

/**
 * POST /api/workflows/[id]/versions
 * 创建新版本
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const workflowId = params?.id
  if (!workflowId) {
    throw new NotFoundError('工作流不存在')
  }

  // 验证工作流存在且用户有权限
  const workflow = await workflowService.getById(workflowId, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  // 解析并验证请求体
  const body = await request.json()
  const parseResult = createVersionSchema.safeParse(body)

  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.issues[0].message)
  }

  const { versionTag, commitMessage, publish } = parseResult.data

  // 创建版本
  const version = await versionService.createVersion(workflowId, user.id, {
    versionTag,
    commitMessage,
    publish,
    versionType: 'MANUAL',
  })

  return ApiResponse.success(version, 201)
})
