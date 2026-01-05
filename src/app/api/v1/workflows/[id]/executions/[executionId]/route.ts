/**
 * V1 Workflow Execution Detail API Route
 *
 * Provides endpoint for getting full execution details via public API.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/executions/[executionId] - Get execution details
 *
 * Requirements: 9.5, 9.6
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
  params: Promise<{ id: string; executionId: string }>
}

/**
 * GET /api/v1/workflows/[id]/executions/[executionId]
 *
 * Get full execution details including input, output, and node-level results.
 *
 * Returns:
 * - id, status, input, output
 * - duration, totalTokens, promptTokens, completionTokens
 * - startedAt, completedAt, createdAt
 * - error, errorDetail (if failed)
 * - logs: Array of node execution logs
 * - outputFiles: Array of generated files
 *
 * Requirement 9.5: Return full execution details including input, output, and node-level results
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
    const { id: workflowId, executionId } = await params

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

    // Requirement 9.5: Get full execution details
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflowId,
      },
      include: {
        logs: {
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            nodeId: true,
            nodeName: true,
            nodeType: true,
            input: true,
            output: true,
            status: true,
            aiProvider: true,
            aiModel: true,
            promptTokens: true,
            completionTokens: true,
            startedAt: true,
            completedAt: true,
            duration: true,
            error: true,
          },
        },
        outputFiles: {
          select: {
            id: true,
            fileName: true,
            format: true,
            mimeType: true,
            size: true,
            url: true,
            downloadCount: true,
            maxDownloads: true,
            expiresAt: true,
            nodeId: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!execution) {
      return ApiResponse.error('执行记录不存在', 404)
    }

    // Update token usage
    await updateTokenUsage(token.id)

    // Return full execution details
    return ApiResponse.success({
      id: execution.id,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      startedAt: execution.startedAt?.toISOString() || null,
      completedAt: execution.completedAt?.toISOString() || null,
      duration: execution.duration,
      totalTokens: execution.totalTokens,
      promptTokens: execution.promptTokens,
      completionTokens: execution.completionTokens,
      estimatedCost: execution.estimatedCost ? Number(execution.estimatedCost) : null,
      error: execution.error,
      errorDetail: execution.errorDetail,
      createdAt: execution.createdAt.toISOString(),
      user: execution.user ? {
        id: execution.user.id,
        name: execution.user.name,
      } : null,
      logs: execution.logs.map((log) => ({
        id: log.id,
        nodeId: log.nodeId,
        nodeName: log.nodeName,
        nodeType: log.nodeType,
        input: log.input,
        output: log.output,
        status: log.status,
        aiProvider: log.aiProvider,
        aiModel: log.aiModel,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt?.toISOString() || null,
        duration: log.duration,
        error: log.error,
      })),
      outputFiles: execution.outputFiles.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        format: file.format,
        mimeType: file.mimeType,
        size: file.size,
        url: file.url,
        downloadCount: file.downloadCount,
        maxDownloads: file.maxDownloads,
        expiresAt: file.expiresAt?.toISOString() || null,
        nodeId: file.nodeId,
        createdAt: file.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('V1 API get execution detail error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取执行详情失败',
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
