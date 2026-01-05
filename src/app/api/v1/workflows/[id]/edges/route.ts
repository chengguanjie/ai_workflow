/**
 * V1 Workflow Edges API Routes
 *
 * Provides public API endpoints for edge (connection) operations.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/edges - List all edges
 * - POST /api/v1/workflows/[id]/edges - Add a new edge
 * - DELETE /api/v1/workflows/[id]/edges - Delete edge by source and target
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
import type { WorkflowConfig, EdgeConfig } from '@/types/workflow'

interface RouteParams {
  params: Promise<{ id: string }>
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
 * GET /api/v1/workflows/[id]/edges
 * List all edges in a workflow
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

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

    // Get config
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const edges = config?.edges || []

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      edges,
      totalCount: edges.length,
    })
  } catch (error) {
    console.error('V1 API list edges error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取连接列表失败',
      500
    )
  }
}

/**
 * POST /api/v1/workflows/[id]/edges
 * Add a new edge to the workflow
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

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

    const {
      source,
      target,
      sourceHandle,
      targetHandle,
      id: providedId,
    } = body as {
      source: string
      target: string
      sourceHandle?: string
      targetHandle?: string
      id?: string
    }

    // Validate required fields
    if (!source || !target) {
      return ApiResponse.error('源节点ID和目标节点ID不能为空', 400)
    }

    // Get current config
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const nodes = config?.nodes || []
    const edges = [...(config?.edges || [])]

    // Validate source and target nodes exist
    const sourceNode = nodes.find((n) => n.id === source)
    const targetNode = nodes.find((n) => n.id === target)

    if (!sourceNode) {
      return ApiResponse.error(`源节点不存在：${source}`, 400)
    }

    if (!targetNode) {
      return ApiResponse.error(`目标节点不存在：${target}`, 400)
    }

    // Check for duplicate edge
    const existingEdge = edges.find(
      (e) =>
        e.source === source &&
        e.target === target &&
        (e.sourceHandle || null) === (sourceHandle || null) &&
        (e.targetHandle || null) === (targetHandle || null)
    )

    if (existingEdge) {
      return ApiResponse.error('该连接已存在', 400)
    }

    // Check for circular dependency (simple check)
    if (source === target) {
      return ApiResponse.error('不能连接到自身', 400)
    }

    // Generate edge ID
    const edgeId =
      providedId || `edge-${source}-${target}-${Date.now().toString(36)}`

    // Check for duplicate ID
    if (edges.some((e) => e.id === edgeId)) {
      return ApiResponse.error(`连接ID已存在：${edgeId}`, 400)
    }

    // Create new edge
    const newEdge: EdgeConfig = {
      id: edgeId,
      source,
      target,
      sourceHandle: sourceHandle || null,
      targetHandle: targetHandle || null,
    }

    edges.push(newEdge)

    // Update workflow config
    const newConfig: WorkflowConfig = {
      ...config,
      version: (config?.version || 0) + 1,
      edges,
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

    return ApiResponse.created({
      edge: newEdge,
      connectedNodes: {
        source: { id: sourceNode.id, name: sourceNode.name, type: sourceNode.type },
        target: { id: targetNode.id, name: targetNode.name, type: targetNode.type },
      },
    })
  } catch (error) {
    console.error('V1 API add edge error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '添加连接失败',
      500
    )
  }
}

/**
 * DELETE /api/v1/workflows/[id]/edges
 * Delete an edge by source and target (or by ID in query params)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate API token
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult
    const { id: workflowId } = await params

    // Parse query params or body
    const searchParams = request.nextUrl.searchParams
    const edgeId = searchParams.get('edgeId')
    const source = searchParams.get('source')
    const target = searchParams.get('target')

    if (!edgeId && (!source || !target)) {
      return ApiResponse.error(
        '请提供 edgeId 或同时提供 source 和 target 参数',
        400
      )
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
    const edges = [...(config?.edges || [])]

    // Find edge to delete
    let edgeIndex: number
    if (edgeId) {
      edgeIndex = edges.findIndex((e) => e.id === edgeId)
    } else {
      edgeIndex = edges.findIndex(
        (e) => e.source === source && e.target === target
      )
    }

    if (edgeIndex === -1) {
      return ApiResponse.error('连接不存在', 404)
    }

    // Remove the edge
    const deletedEdge = edges.splice(edgeIndex, 1)[0]

    // Update workflow config
    const newConfig: WorkflowConfig = {
      ...config,
      version: (config?.version || 0) + 1,
      edges,
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

    return ApiResponse.success({ deleted: deletedEdge })
  } catch (error) {
    console.error('V1 API delete edge error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '删除连接失败',
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
