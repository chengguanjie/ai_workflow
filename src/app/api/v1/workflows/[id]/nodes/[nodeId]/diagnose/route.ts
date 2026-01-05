/**
 * V1 Workflow Node Diagnose API Route
 *
 * Provides public API endpoint for diagnosing node configuration issues.
 * Uses API Token authentication with scope validation.
 *
 * Endpoint:
 * - GET /api/v1/workflows/[id]/nodes/[nodeId]/diagnose - Diagnose a node's configuration
 *
 * Requirements: 4.1, 4.5, 4.6
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
import { nodeDiagnosisService } from '@/lib/services/node-diagnosis.service'
import type { WorkflowConfig } from '@/types/workflow'

interface RouteParams {
  params: Promise<{ id: string; nodeId: string }>
}

/**
 * Helper to get workflow with config
 */
async function getWorkflowWithConfig(workflowId: string) {
  return prisma.workflow.findFirst({
    where: {
      id: workflowId,
      deletedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      config: true,
      draftConfig: true,
    },
  })
}

/**
 * GET /api/v1/workflows/[id]/nodes/[nodeId]/diagnose
 * Diagnose a node's configuration and return issues
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId, nodeId } = await params

    // Find workflow
    const workflow = await getWorkflowWithConfig(workflowId)

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

    // Get config and find node
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const node = config?.nodes?.find((n) => n.id === nodeId)

    if (!node) {
      return ApiResponse.error('节点不存在', 404)
    }

    // Perform diagnosis
    const result = nodeDiagnosisService.diagnoseNode(node, config)

    // Update token usage
    await updateTokenUsage(token.id)

    // Return response
    return ApiResponse.success(result)
  } catch (error) {
    console.error('V1 API diagnose node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '诊断节点失败',
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
