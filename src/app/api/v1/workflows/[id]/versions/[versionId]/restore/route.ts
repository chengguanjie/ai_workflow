/**
 * V1 Workflow Version Restore API Route
 *
 * Provides endpoint for restoring a workflow to a specific version.
 *
 * Endpoint:
 * - POST /api/v1/workflows/[id]/versions/[versionId]/restore - Restore to version
 *
 * Requirements: 7.4
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
import { versionService } from '@/lib/services/version.service'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>
}

// Restore request validation schema
const restoreSchema = z.object({
  commitMessage: z.string().max(500).optional(),
})

/**
 * POST /api/v1/workflows/[id]/versions/[versionId]/restore
 *
 * Restore the workflow to a specific version's configuration.
 * This creates a new version with the restored configuration.
 *
 * Request body (optional):
 * - commitMessage: Custom message for the restore operation
 *
 * Returns the newly created version after restore.
 *
 * Requirement 7.4: Restore workflow to specified version's configuration
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token with 'workflows' scope
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId, versionId } = await params

    // Find workflow to validate access
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // Validate cross-organization access
    const crossOrgResult = validateCrossOrganization(
      token.organizationId,
      workflow.organizationId
    )
    if (!crossOrgResult.success) {
      return createCrossOrgNotFoundResponse('工作流')
    }

    // Get target version to validate it exists
    const targetVersion = await versionService.getVersion(versionId)

    if (!targetVersion || targetVersion.workflowId !== workflowId) {
      return ApiResponse.error('版本不存在', 404)
    }

    // Parse optional request body for custom commit message
    let commitMessage: string | undefined
    try {
      const body = await request.json()
      const parseResult = restoreSchema.safeParse(body)
      if (parseResult.success) {
        commitMessage = parseResult.data.commitMessage
      }
    } catch {
      // No body or invalid JSON is acceptable - use default commit message
    }

    // Perform restore using versionService.rollback
    // Requirement 7.4: Restore workflow to specified version's configuration
    const newVersion = await versionService.rollback(
      workflowId,
      versionId,
      token.createdById,
      commitMessage
    )

    // Get creator info for response
    const creator = await prisma.user.findUnique({
      where: { id: token.createdById },
      select: { id: true, name: true },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      id: newVersion.id,
      versionNumber: newVersion.versionNumber,
      versionTag: newVersion.versionTag,
      commitMessage: newVersion.commitMessage,
      versionType: newVersion.versionType,
      isPublished: newVersion.isPublished,
      isActive: newVersion.isActive,
      restoredFromVersionId: versionId,
      restoredFromVersionNumber: targetVersion.versionNumber,
      createdAt: newVersion.createdAt.toISOString(),
      createdBy: creator ? { id: creator.id, name: creator.name } : null,
    })
  } catch (error) {
    console.error('V1 API restore version error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '恢复版本失败',
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
