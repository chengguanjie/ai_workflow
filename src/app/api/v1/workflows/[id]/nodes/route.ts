/**
 * V1 Workflow Nodes API Routes
 *
 * Provides public API endpoints for node operations.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/nodes - List all nodes
 * - POST /api/v1/workflows/[id]/nodes - Add a new node
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
import type {
  WorkflowConfig,
  NodeConfig,
  NodeType,
  NodePosition,
  InputNodeConfigData,
  ProcessNodeConfigData,
  LogicNodeConfigData,
  CodeNodeConfigData,
  OutputNodeConfigData,
} from '@/types/workflow'

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
 * Helper to generate unique node ID
 */
function generateNodeId(type: NodeType, existingNodes: NodeConfig[]): string {
  const prefix = type.toLowerCase()
  let counter = 1
  let nodeId = `${prefix}-${counter}`

  const existingIds = new Set(existingNodes.map((n) => n.id))
  while (existingIds.has(nodeId)) {
    counter++
    nodeId = `${prefix}-${counter}`
  }

  return nodeId
}

/**
 * GET /api/v1/workflows/[id]/nodes
 * List all nodes in a workflow
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

    // Get config (prefer draftConfig)
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const nodes = config?.nodes || []

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      nodes,
      totalCount: nodes.length,
    })
  } catch (error) {
    console.error('V1 API list nodes error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取节点列表失败',
      500
    )
  }
}

/**
 * POST /api/v1/workflows/[id]/nodes
 * Add a new node to the workflow
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

    // Get current config
    const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    const nodes = [...(config?.nodes || [])]
    const edges = [...(config?.edges || [])]

    const {
      type,
      name,
      position,
      config: nodeConfig,
      id: providedId,
      connectFrom,
      connectTo,
    } = body as {
      type: NodeType
      name?: string
      position?: NodePosition
      config?: InputNodeConfigData | ProcessNodeConfigData | LogicNodeConfigData | CodeNodeConfigData | OutputNodeConfigData
      id?: string
      connectFrom?: string // Source node ID to connect from
      connectTo?: string // Target node ID to connect to
    }

    // Validate required fields
    if (!type) {
      return ApiResponse.error('节点类型不能为空', 400)
    }

    const validTypes: NodeType[] = ['INPUT', 'PROCESS', 'CODE', 'OUTPUT', 'LOGIC']
    if (!validTypes.includes(type)) {
      return ApiResponse.error(
        `无效的节点类型：${type}，支持的类型：${validTypes.join(', ')}`,
        400
      )
    }

    // Generate node ID if not provided
    const nodeId = providedId || generateNodeId(type, nodes)

    // Check for duplicate ID
    if (nodes.some((n) => n.id === nodeId)) {
      return ApiResponse.error(`节点ID已存在：${nodeId}`, 400)
    }

    // Build default config based on node type
    let defaultConfig: NodeConfig['config']
    let defaultName: string

    switch (type) {
      case 'INPUT':
        defaultConfig = {
          fields: [
            {
              id: 'field-1',
              name: '输入',
              value: '',
              fieldType: 'text',
            },
          ],
        } as InputNodeConfigData
        defaultName = '用户输入'
        break

      case 'PROCESS':
        defaultConfig = {
          systemPrompt: '',
          userPrompt: '',
          temperature: 0.7,
          maxTokens: 4096,
        } as ProcessNodeConfigData
        defaultName = 'AI处理'
        break

      case 'LOGIC':
        defaultConfig = {
          mode: 'condition',
          conditions: [],
        } as LogicNodeConfigData
        defaultName = '条件判断'
        break

      case 'CODE':
        defaultConfig = {
          language: 'javascript',
          code: '// Your code here\nreturn { result: input };',
          timeout: 30000,
        } as CodeNodeConfigData
        defaultName = '代码执行'
        break

      case 'OUTPUT':
        defaultConfig = {
          format: 'text',
          prompt: '',
        } as OutputNodeConfigData
        defaultName = '输出'
        break

      default:
        defaultConfig = {}
        defaultName = '节点'
    }

    // Calculate default position if not provided
    const defaultPosition: NodePosition = position || {
      x: 250 + (nodes.length % 3) * 300,
      y: 100 + Math.floor(nodes.length / 3) * 200,
    }

    // Create new node
    const newNode: NodeConfig = {
      id: nodeId,
      type,
      name: name || defaultName,
      position: defaultPosition,
      config: nodeConfig || defaultConfig,
    } as NodeConfig

    // Add node to config
    nodes.push(newNode)

    // Handle edge connections
    const newEdges = [...edges]

    if (connectFrom) {
      // Validate source node exists
      if (!nodes.some((n) => n.id === connectFrom)) {
        return ApiResponse.error(`源节点不存在：${connectFrom}`, 400)
      }
      newEdges.push({
        id: `edge-${connectFrom}-${nodeId}`,
        source: connectFrom,
        target: nodeId,
      })
    }

    if (connectTo) {
      // Validate target node exists
      if (!nodes.some((n) => n.id === connectTo)) {
        return ApiResponse.error(`目标节点不存在：${connectTo}`, 400)
      }
      newEdges.push({
        id: `edge-${nodeId}-${connectTo}`,
        source: nodeId,
        target: connectTo,
      })
    }

    // Update workflow config
    const newConfig: WorkflowConfig = {
      ...config,
      version: (config?.version || 0) + 1,
      nodes,
      edges: newEdges,
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
      node: newNode,
      addedEdges: newEdges.filter(
        (e) => !edges.some((oe) => oe.id === e.id)
      ),
    })
  } catch (error) {
    console.error('V1 API add node error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '添加节点失败',
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
