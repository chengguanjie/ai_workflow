/**
 * Workflow Publish API Routes
 *
 * Provides endpoints for publishing workflow drafts to production.
 * Implements the Draft/Published dual-state mechanism.
 *
 * POST /api/workflows/[id]/publish - Publish draft to production
 * DELETE /api/workflows/[id]/publish - Discard draft changes
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { workflowService } from '@/server/services/workflow.service'
import { z } from 'zod'

// Validation schema for publish request
const publishSchema = z.object({
  commitMessage: z.string().max(500).optional(),
  createVersion: z.boolean().optional().default(true),
})

/**
 * POST /api/workflows/[id]/publish
 *
 * Publish the current draft configuration to production.
 * This copies draftConfig to publishedConfig and updates the status.
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Validate request body (optional)
  let data: { commitMessage?: string; createVersion: boolean } = { commitMessage: undefined, createVersion: true }
  try {
    const body = await request.json()
    data = publishSchema.parse(body)
  } catch {
    // Use defaults if no body provided
  }

  // Delegate to service layer
  const workflow = await workflowService.publish(
    id,
    user.organizationId,
    user.id,
    {
      commitMessage: data.commitMessage,
      createVersion: data.createVersion,
    }
  )

  return ApiResponse.success({
    ...workflow,
    message: '工作流已发布到生产环境',
  })
})

/**
 * DELETE /api/workflows/[id]/publish
 *
 * Discard draft changes and revert to the published configuration.
 */
export const DELETE = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Delegate to service layer
  const workflow = await workflowService.discardDraft(id, user.organizationId)

  return ApiResponse.success({
    ...workflow,
    message: '草稿已丢弃，已恢复到已发布版本',
  })
})

/**
 * GET /api/workflows/[id]/publish
 *
 * Get the publish status and compare draft vs published config.
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Check if there are unpublished changes
  const hasChanges = await workflowService.hasUnpublishedChanges(id, user.organizationId)

  // Get full workflow for status info
  const workflow = await workflowService.getById(id, user.organizationId)
  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  return ApiResponse.success({
    hasUnpublishedChanges: hasChanges,
    publishStatus: workflow.publishStatus,
    publishedAt: workflow.publishedAt,
    publishedBy: workflow.publishedBy,
  })
})
