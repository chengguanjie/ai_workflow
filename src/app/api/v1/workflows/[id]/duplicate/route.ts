/**
 * V1 Workflow Duplicate API Route
 *
 * Provides endpoint for duplicating a workflow via public API.
 * Creates a new workflow as a copy of the source workflow.
 *
 * Endpoint:
 * - POST /api/v1/workflows/[id]/duplicate - Duplicate workflow
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  createCrossOrgNotFoundResponse,
  updateTokenUsage,
} from '@/lib/auth'
import { Prisma } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/v1/workflows/[id]/duplicate
 *
 * Create a copy of an existing workflow.
 * By default, appends "(副本)" to the name.
 * Optionally accepts a custom name parameter.
 *
 * Request body (optional):
 * - name: Custom name for the duplicated workflow
 *
 * Returns the newly created workflow.
 *
 * Requirements:
 * - 6.1: Create new workflow as copy of source
 * - 6.2: Append "(副本)" to name by default
 * - 6.3: Copy all nodes, edges, and configuration
 * - 6.4: Set publishStatus to DRAFT and version to 1
 * - 6.5: Return newly created workflow with new ID
 * - 6.6: Support custom name parameter
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token with 'workflows' scope
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

    // Parse optional request body for custom name
    let customName: string | undefined
    try {
      const body = await request.json()
      if (body && typeof body.name === 'string' && body.name.trim().length > 0) {
        customName = body.name.trim()
      }
    } catch {
      // No body or invalid JSON is acceptable - use default naming
    }

    // Find source workflow
    const sourceWorkflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        config: true,
        organizationId: true,
      },
    })

    if (!sourceWorkflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // Validate cross-organization access
    const crossOrgResult = validateCrossOrganization(
      token.organizationId,
      sourceWorkflow.organizationId
    )
    if (!crossOrgResult.success) {
      return createCrossOrgNotFoundResponse('工作流')
    }

    // Determine the name for the new workflow
    // Requirement 6.6: Use custom name if provided
    // Requirement 6.2: Otherwise append "(副本)"
    const newName = customName || `${sourceWorkflow.name} (副本)`

    // Validate name length
    if (newName.length > 100) {
      return ApiResponse.error('工作流名称不能超过100个字符', 400)
    }

    // Prepare config for the new workflow
    // Requirement 6.3: Copy all nodes, edges, and configuration
    // Requirement 6.4: Set version to 1
    let newConfig = sourceWorkflow.config
    if (newConfig && typeof newConfig === 'object') {
      newConfig = {
        ...(newConfig as Record<string, unknown>),
        version: 1,
      }
    }

    // Create the duplicate workflow
    // Requirement 6.1: Create new workflow as copy
    // Requirement 6.4: Set publishStatus to DRAFT and version to 1
    const duplicatedWorkflow = await prisma.workflow.create({
      data: {
        name: newName,
        description: sourceWorkflow.description,
        category: sourceWorkflow.category,
        tags: sourceWorkflow.tags as Prisma.InputJsonValue,
        config: newConfig as Prisma.InputJsonValue,
        draftConfig: newConfig as Prisma.InputJsonValue,
        publishStatus: 'DRAFT',
        version: 1,
        organizationId: token.organizationId,
        creatorId: token.createdById,
      },
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        draftConfig: true,
        publishedConfig: true,
        publishStatus: true,
        version: true,
        category: true,
        tags: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    // Requirement 6.5: Return newly created workflow with new ID
    return ApiResponse.created(duplicatedWorkflow)
  } catch (error) {
    console.error('V1 API duplicate workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '复制工作流失败',
      500
    )
  }
}

// OPTIONS: Support CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
