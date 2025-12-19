/**
 * Workflow API Routes
 * 
 * Provides endpoints for listing and creating workflows.
 * Uses withAuth for authentication and withValidation for request validation.
 * Delegates business logic to WorkflowService.
 * 
 * Requirements: 1.1, 1.3, 2.1, 3.1
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { validateQueryParams, validateRequestBody } from '@/lib/api/with-validation'
import { ApiResponse } from '@/lib/api/api-response'
import { workflowService } from '@/server/services/workflow.service'
import { workflowListSchema, workflowCreateSchema } from '@/lib/validations/workflow'

/**
 * GET /api/workflows
 * 
 * List workflows with pagination and optional filtering.
 * Supports search by name/description and category filtering.
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 20, max: 100)
 * - search: Search term for name/description
 * - category: Filter by category
 * 
 * Requirements: 1.1, 1.3, 3.1, 4.1, 4.2
 */
export const GET = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  // Validate query parameters
  const params = validateQueryParams(request, workflowListSchema)

  // Delegate to service layer
  const result = await workflowService.list({
    organizationId: user.organizationId,
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    category: params.category,
  })

  // Return paginated response
  return ApiResponse.paginated(result.data, result.pagination)
})

/**
 * POST /api/workflows
 * 
 * Create a new workflow.
 * 
 * Request Body:
 * - name: Workflow name (required, 1-100 chars)
 * - description: Workflow description (optional, max 500 chars)
 * - config: Workflow configuration with nodes and edges (required)
 * 
 * Requirements: 1.1, 1.3, 2.1, 3.1
 */
export const POST = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  // Validate request body
  const data = await validateRequestBody(request, workflowCreateSchema)

  // Delegate to service layer
  const workflow = await workflowService.create({
    name: data.name,
    description: data.description,
    config: data.config,
    organizationId: user.organizationId,
    creatorId: user.id,
  })

  // Return created response
  return ApiResponse.created(workflow)
})
