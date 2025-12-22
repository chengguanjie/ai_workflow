/**
 * Workflow Version Comparison API
 *
 * Provides endpoint for comparing draft vs published workflow configs.
 *
 * GET /api/workflows/[id]/compare - Get comparison between draft and published
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { workflowService } from '@/server/services/workflow.service'

/**
 * GET /api/workflows/[id]/compare
 *
 * Get the comparison between draft and published workflow configurations.
 * Returns detailed changes including added, removed, and modified nodes/edges.
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  const comparison = await workflowService.getVersionComparison(id, user.organizationId)

  return ApiResponse.success(comparison)
})
