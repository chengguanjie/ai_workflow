/**
 * V1 Workflow Versions API Route
 *
 * Provides endpoints for managing workflow versions via public API.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/versions - Get paginated list of versions
 * - POST /api/v1/workflows/[id]/versions - Create a new version snapshot
 *
 * Requirements: 7.1, 7.2, 7.5
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
  params: Promise<{ id: string }>
}

// Create version request validation schema
const createVersionSchema = z.object({
  commitMessage: z.string().min(1, '请输入提交说明').max(500),
  versionTag: z.string().max(50).optional(),
  publish: z.boolean().optional().default(false),
})

/**
 * GET /api/v1/workflows/[id]/versions
 *
 * Get a paginated list of workflow versions.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 20, max: 100)
 *
 * Returns version list with metadata:
 * - id, versionNumber, versionTag, commitMessage
 * - isPublished, createdAt, createdBy
 *
 * Requirement 7.1: Return paginated list of versions
 * Requirement 7.5: Include version metadata
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token with 'workflows' scope
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

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

    // Parse pagination parameters
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))

    // Get versions using versionService
    const result = await versionService.getVersions(workflowId, { page, limit: pageSize })

    // Transform versions to include createdBy info
    // Requirement 7.5: Include version metadata
    const versionsWithCreator = await Promise.all(
      result.versions.map(async (version) => {
        const creator = version.createdById
          ? await prisma.user.findUnique({
              where: { id: version.createdById },
              select: { id: true, name: true },
            })
          : null

        return {
          id: version.id,
          versionNumber: version.versionNumber,
          versionTag: version.versionTag,
          commitMessage: version.commitMessage,
          isPublished: version.isPublished,
          isActive: version.isActive,
          createdAt: version.createdAt.toISOString(),
          createdBy: creator ? { id: creator.id, name: creator.name } : null,
        }
      })
    )

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      versions: versionsWithCreator,
      pagination: {
        page: result.page,
        pageSize: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    })
  } catch (error) {
    console.error('V1 API get versions error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取版本列表失败',
      500
    )
  }
}

/**
 * POST /api/v1/workflows/[id]/versions
 *
 * Create a new version snapshot of the workflow.
 *
 * Request body:
 * - commitMessage: Required description of the version
 * - versionTag: Optional tag for the version
 * - publish: Optional boolean to publish the version immediately
 *
 * Requirement 7.2: Create new version snapshot with commitMessage
 * Requirement 7.5: Include version metadata in response
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

    // Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return ApiResponse.error('请求体格式无效', 400)
    }

    const parseResult = createVersionSchema.safeParse(body)
    if (!parseResult.success) {
      return ApiResponse.error(parseResult.error.issues[0].message, 400)
    }

    const { commitMessage, versionTag, publish } = parseResult.data

    // Create version using versionService
    // Requirement 7.2: Create new version snapshot
    const version = await versionService.createVersion(workflowId, token.createdById, {
      commitMessage,
      versionTag,
      publish,
      versionType: 'MANUAL',
    })

    // Get creator info for response
    const creator = await prisma.user.findUnique({
      where: { id: token.createdById },
      select: { id: true, name: true },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    // Requirement 7.5: Include version metadata
    return ApiResponse.created({
      id: version.id,
      versionNumber: version.versionNumber,
      versionTag: version.versionTag,
      commitMessage: version.commitMessage,
      isPublished: version.isPublished,
      isActive: version.isActive,
      createdAt: version.createdAt.toISOString(),
      createdBy: creator ? { id: creator.id, name: creator.name } : null,
    })
  } catch (error) {
    console.error('V1 API create version error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '创建版本失败',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
