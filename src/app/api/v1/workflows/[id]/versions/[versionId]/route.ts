/**
 * V1 Workflow Version Detail API Route
 *
 * Provides endpoint for getting a specific version's details.
 *
 * Endpoint:
 * - GET /api/v1/workflows/[id]/versions/[versionId] - Get version details
 *
 * Requirements: 7.3
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

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>
}

/**
 * GET /api/v1/workflows/[id]/versions/[versionId]
 *
 * Get the specific version's complete configuration.
 *
 * Returns:
 * - Version metadata (id, versionNumber, versionTag, commitMessage, etc.)
 * - Complete configuration snapshot (nodes, edges, etc.)
 *
 * Requirement 7.3: Return specific version's configuration
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Get version details using versionService
    const version = await versionService.getVersion(versionId)

    // Validate version exists and belongs to the workflow
    if (!version || version.workflowId !== workflowId) {
      return ApiResponse.error('版本不存在', 404)
    }

    // Get creator info for response
    const creator = version.createdById
      ? await prisma.user.findUnique({
          where: { id: version.createdById },
          select: { id: true, name: true },
        })
      : null

    // Update token usage
    await updateTokenUsage(token.id)

    // Requirement 7.3: Return specific version's configuration
    return ApiResponse.success({
      id: version.id,
      versionNumber: version.versionNumber,
      versionTag: version.versionTag,
      commitMessage: version.commitMessage,
      versionType: version.versionType,
      isPublished: version.isPublished,
      isActive: version.isActive,
      config: version.config,
      changesSummary: version.changesSummary,
      executionCount: version.executionCount,
      successRate: version.successRate,
      avgRating: version.avgRating,
      createdAt: version.createdAt.toISOString(),
      createdBy: creator ? { id: creator.id, name: creator.name } : null,
    })
  } catch (error) {
    console.error('V1 API get version detail error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取版本详情失败',
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
