/**
 * V1 Workflow Single Node API Routes
 *
 * Provides public API endpoints for single node operations.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/nodes/[nodeId] - Get node details
 * - PUT /api/v1/workflows/[id]/nodes/[nodeId] - Update node
 * - DELETE /api/v1/workflows/[id]/nodes/[nodeId] - Delete node
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
import { getDefaultConfig } from '@/lib/workflow/node-operations'
import type {
  WorkflowConfig,
  NodeConfig,
  NodePosition,
  NodeType,
} from '@/types/workflow'

// Valid node types
const VALID_NODE_TYPES: NodeType[] = ['INPUT', 'PROCESS', 'CODE', 'OUTPUT', 'LOGIC']

interface RouteParams {
  params: Promise<{ id: string; nodeId: string }>
}

/**
 * Helper to get workflow config
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
 * GET /api/v1/workflows/[id]/nodes/[nodeId]
 * Get single node details
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

    // Get connected edges
    const edges = config?.edges || []
    const incomingEdges = edges.filter((e) => e.target === nodeId)
    const outgoingEdges = edges.filter((e) => e.source === nodeId)

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      node,
      connections: {
        incoming: incomingEdges,
        outgoing: outgoingEdges,
      },
    })
  } catch (error) {
    console.error('V1 API get node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取节点失败',
      500
    )
  }
}

/**
 * PUT /api/v1/workflows/[id]/nodes/[nodeId]
 * Update a node's configuration
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    // Get current config
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const nodes = [...(config?.nodes || [])]
    const nodeIndex = nodes.findIndex((n) => n.id === nodeId)

    if (nodeIndex === -1) {
      return ApiResponse.error('节点不存在', 404)
    }

    const {
      name,
      type,
      position,
      config: nodeConfig,
      comment,
    } = body as {
      name?: string
      type?: NodeType
      position?: NodePosition
      config?: NodeConfig['config']
      comment?: string
    }

    // Validate node type if provided
    if (type !== undefined && !VALID_NODE_TYPES.includes(type)) {
      return ApiResponse.error(`无效的节点类型: ${type}`, 400)
    }

    // Update node
    const existingNode = nodes[nodeIndex]
    
    // Handle node type change - apply default config for new type
    let finalConfig = existingNode.config
    if (type !== undefined && type !== existingNode.type) {
      // Get default config for the new type
      const defaultConfig = getDefaultConfig(type)
      // Merge with provided config, or use default if no config provided
      finalConfig = nodeConfig !== undefined
        ? { ...defaultConfig, ...nodeConfig }
        : defaultConfig
    } else if (nodeConfig !== undefined) {
      // No type change, just merge config
      finalConfig = { ...existingNode.config, ...nodeConfig }
    }

    const updatedNode: NodeConfig = {
      ...existingNode,
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(position !== undefined && { position }),
      ...(comment !== undefined && { comment }),
      config: finalConfig,
    } as NodeConfig

    nodes[nodeIndex] = updatedNode

    // Update workflow config
    const newConfig: WorkflowConfig = {
      ...config,
      version: (config?.version || 0) + 1,
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

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      node: updatedNode,
      workflowVersion: newConfig.version,
    })
  } catch (error) {
    console.error('V1 API update node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '更新节点失败',
      500
    )
  }
}

/**
 * DELETE /api/v1/workflows/[id]/nodes/[nodeId]
 * Delete a node and its connected edges
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Get current config
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const nodes = [...(config?.nodes || [])]
    const edges = [...(config?.edges || [])]

    const nodeIndex = nodes.findIndex((n) => n.id === nodeId)

    if (nodeIndex === -1) {
      return ApiResponse.error('节点不存在', 404)
    }

    const nodeToDelete = nodes[nodeIndex]

    // Protect INPUT nodes - cannot delete if it's the only INPUT node
    if (nodeToDelete.type === 'INPUT') {
      const inputNodeCount = nodes.filter((n) => n.type === 'INPUT').length
      if (inputNodeCount <= 1) {
        return ApiResponse.error('不能删除唯一的 INPUT 节点', 400)
      }
    }

    // Remove the node
    const deletedNode = nodes.splice(nodeIndex, 1)[0]

    // Remove connected edges
    const deletedEdges = edges.filter(
      (e) => e.source === nodeId || e.target === nodeId
    )
    const remainingEdges = edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    )

    // Update workflow config
    const newConfig: WorkflowConfig = {
      ...config,
      version: (config?.version || 0) + 1,
      nodes,
      edges: remainingEdges,
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

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      deleted: {
        node: deletedNode,
        edges: deletedEdges,
      },
      workflowVersion: newConfig.version,
    })
  } catch (error) {
    console.error('V1 API delete node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '删除节点失败',
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
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
