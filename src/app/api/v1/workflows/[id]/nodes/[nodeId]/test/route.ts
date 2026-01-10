/**
 * V1 Workflow Node Test API Route
 *
 * Provides public API endpoint for testing individual nodes.
 * Uses API Token authentication with scope validation.
 *
 * Endpoint:
 * - POST /api/v1/workflows/[id]/nodes/[nodeId]/test - Test a node with sample input
 *
 * Requirements: 3.1, 3.4, 3.6
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
import {
  nodeTestService,
  isNonTestableNodeType,
  type TestNodeRequest,
} from '@/lib/services/node-test.service'
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
 * POST /api/v1/workflows/[id]/nodes/[nodeId]/test
 * Test a single node with sample input
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId, nodeId } = await params

    // Parse request body
    const body = await request.json().catch(() => null)
    if (!body) {
      return ApiResponse.error('请求体不能为空', 400)
    }

    const { input, timeout } = body as TestNodeRequest

    // Validate input
    if (!input || typeof input !== 'object') {
      return ApiResponse.error('input 参数必须是一个对象', 400)
    }

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

    // Check if node type is testable
    if (isNonTestableNodeType(node.type)) {
      return ApiResponse.error(
        `节点类型 ${node.type} 不支持独立测试。INPUT 和 OUTPUT 节点需要在完整工作流中执行。`,
        400
      )
    }

    // Execute node test
    const result = await nodeTestService.testNode(
      node,
      config,
      workflow.organizationId,
      token.createdById,
      { input, timeout }
    )

    // Update token usage
    await updateTokenUsage(token.id)

    // Return response
    if (result.success) {
      return ApiResponse.success({
        success: true,
        output: result.output,
        metrics: result.metrics,
      })
    } else {
      return ApiResponse.success({
        success: false,
        error: result.error,
        metrics: result.metrics,
      })
    }
  } catch (error) {
    console.error('V1 API test node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '测试节点失败',
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
