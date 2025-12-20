/**
 * Workflow Duplicate API Route
 *
 * Provides endpoint for duplicating a workflow.
 * Creates a new workflow as a copy of the source workflow.
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { workflowService } from '@/server/services/workflow.service'

/**
 * POST /api/workflows/[id]/duplicate
 *
 * Create a copy of an existing workflow.
 * The new workflow will have "(副本)" appended to its name.
 *
 * Returns the newly created workflow.
 */
export const POST = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Delegate to service layer
  const workflow = await workflowService.copy(id, user.organizationId, user.id)

  return ApiResponse.created(workflow)
})
