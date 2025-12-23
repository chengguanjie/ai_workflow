/**
 * Workflow Detail API Routes
 * 
 * Provides endpoints for getting, updating, and deleting a single workflow.
 * Uses withAuth for authentication and validates request bodies.
 * Delegates business logic to WorkflowService.
 * 
 * Requirements: 1.1, 1.3, 2.1, 3.1
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { validateRequestBody } from '@/lib/api/with-validation'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError } from '@/lib/errors'
import { workflowService } from '@/server/services/workflow.service'
import { workflowUpdateSchema } from '@/lib/validations/workflow'

// Note: withAuth already handles errors internally, but we use NotFoundError
// for proper error categorization. The enhanced error handling middleware
// can be applied at a higher level if needed.

/**
 * GET /api/workflows/[id]
 * 
 * Get a single workflow by ID.
 * Returns the full workflow including configuration and creator info.
 * 
 * Requirements: 1.1, 1.3, 3.1
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Delegate to service layer
  const workflow = await workflowService.getById(id, user.organizationId)

  if (!workflow) {
    throw new NotFoundError('工作流不存在')
  }

  return ApiResponse.success(workflow)
})

/**
 * PUT /api/workflows/[id]
 * 
 * Update an existing workflow.
 * Supports partial updates - only provided fields will be updated.
 * 
 * Request Body (all optional):
 * - name: Workflow name (1-100 chars)
 * - description: Workflow description (max 500 chars)
 * - config: Workflow configuration with nodes and edges
 * - isActive: Whether the workflow is active
 * - category: Workflow category (max 50 chars)
 * - tags: Array of tag strings
 * 
 * Requirements: 1.1, 1.3, 2.1, 3.1
 */
export const PUT = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Validate request body
  const data = await validateRequestBody(request, workflowUpdateSchema)

  // Delegate to service layer
  const workflow = await workflowService.update(id, user.organizationId, {
    name: data.name,
    description: data.description,
    config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
    isActive: data.isActive,
    category: data.category,
    tags: data.tags,
    expectedVersion: data.expectedVersion,
    forceOverwrite: data.forceOverwrite,
  })

  return ApiResponse.success(workflow)
})

/**
 * DELETE /api/workflows/[id]
 * 
 * Soft delete a workflow.
 * The workflow is marked as deleted but not physically removed.
 * 
 * Requirements: 1.1, 1.3, 3.1
 */
export const DELETE = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const id = params?.id
  if (!id) {
    throw new NotFoundError('工作流不存在')
  }

  // Delegate to service layer
  await workflowService.delete(id, user.organizationId)

  return ApiResponse.noContent()
})
