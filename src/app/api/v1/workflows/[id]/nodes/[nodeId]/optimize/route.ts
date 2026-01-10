/**
 * V1 Workflow Node Optimize API Route
 *
 * Provides public API endpoint for getting AI-powered optimization
 * suggestions for workflow nodes.
 * Uses API Token authentication with scope validation.
 *
 * Endpoint:
 * - POST /api/v1/workflows/[id]/nodes/[nodeId]/optimize - Get optimization suggestions
 *
 * Requirements: 5.1, 5.4, 5.5, 5.6
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
import { nodeOptimizationService } from '@/lib/services/node-optimization.service'
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
      version: true,
      config: true,
      draftConfig: true,
      publishStatus: true,
    },
  })
}

/**
 * POST /api/v1/workflows/[id]/nodes/[nodeId]/optimize
 * Get AI-powered optimization suggestions for a node
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

    // Parse request body (optional)
    const body = await request.json().catch(() => ({}))
    const { apply = false } = body as { apply?: boolean }

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

    // Check if node type is optimizable
    const optimizableTypes = ['PROCESS', 'CODE']
    if (!optimizableTypes.includes(node.type)) {
      return ApiResponse.error(
        `节点类型 ${node.type} 不支持优化建议`,
        400
      )
    }

    // Get optimization suggestions
    const result = await nodeOptimizationService.optimizeNode(
      node,
      config,
      token.organizationId,
      { apply }
    )

    // If apply=true and we have an updated node, save it to the database
    if (apply && result.updatedNode) {
      const nodes = config.nodes.map((n) =>
        n.id === nodeId ? result.updatedNode! : n
      )

      const newConfig: WorkflowConfig = {
        ...config,
        version: (config.version || 0) + 1,
        nodes,
      }

      const updateData: Record<string, unknown> = {
        config: JSON.parse(JSON.stringify(newConfig)),
        draftConfig: JSON.parse(JSON.stringify(newConfig)),
        version: newConfig.version,
      }

      // Update publish status if was published
      if (workflow.publishStatus === 'PUBLISHED') {
        updateData.publishStatus = 'DRAFT_MODIFIED'
      }

      // Save to database
      await prisma.workflow.update({
        where: { id: workflowId },
        data: updateData,
      })
    }

    // Update token usage
    await updateTokenUsage(token.id)

    // Return response
    return ApiResponse.success(result)
  } catch (error) {
    console.error('V1 API optimize node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取优化建议失败',
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
