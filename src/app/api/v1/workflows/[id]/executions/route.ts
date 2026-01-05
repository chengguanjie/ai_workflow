/**
 * V1 Workflow Executions API Route
 *
 * Provides endpoints for querying workflow execution history via public API.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/executions - Get paginated list of executions
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.6
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

interface RouteParams {
  params: Promise<{ id: string }>
}

// Valid execution statuses
type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

const VALID_STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']

/**
 * GET /api/v1/workflows/[id]/executions
 *
 * Get a paginated list of workflow executions.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 20, max: 100)
 * - status: Filter by execution status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
 * - startDate: Filter executions created after this date (ISO format)
 * - endDate: Filter executions created before this date (ISO format)
 *
 * Returns execution list with summary:
 * - id, status, duration, totalTokens, createdAt
 *
 * Requirement 9.1: Return paginated list of executions
 * Requirement 9.2: Support filtering by status
 * Requirement 9.3: Support filtering by date range
 * Requirement 9.4: Return execution summary
 * Requirement 9.6: Require 'executions' scope
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Requirement 9.6: Validate API token with 'executions' scope
    const authResult = await validateApiTokenWithScope(request, 'executions')
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      workflowId,
    }

    // Requirement 9.2: Filter by status
    if (status) {
      const upperStatus = status.toUpperCase() as ExecutionStatus
      if (!VALID_STATUSES.includes(upperStatus)) {
        return ApiResponse.error(
          `无效的状态值。有效值: ${VALID_STATUSES.join(', ')}`,
          400
        )
      }
      where.status = upperStatus
    }

    // Requirement 9.3: Filter by date range
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        const start = new Date(startDate)
        if (isNaN(start.getTime())) {
          return ApiResponse.error('无效的开始日期格式', 400)
        }
        where.createdAt.gte = start
      }
      if (endDate) {
        const end = new Date(endDate)
        if (isNaN(end.getTime())) {
          return ApiResponse.error('无效的结束日期格式', 400)
        }
        // Set to end of day
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    // Requirement 9.1: Get paginated executions
    const [executions, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
        select: {
          id: true,
          status: true,
          duration: true,
          totalTokens: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      prisma.execution.count({ where }),
    ])

    // Update token usage
    await updateTokenUsage(token.id)

    // Requirement 9.4: Return execution summary
    return ApiResponse.success({
      executions: executions.map((e) => ({
        id: e.id,
        status: e.status,
        duration: e.duration,
        totalTokens: e.totalTokens,
        createdAt: e.createdAt.toISOString(),
        startedAt: e.startedAt?.toISOString() || null,
        completedAt: e.completedAt?.toISOString() || null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('V1 API get executions error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取执行历史失败',
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
