/**
 * V1 Workflow Node Tools API Routes
 *
 * Provides public API endpoints for node tool configuration.
 * Only applicable to PROCESS type nodes.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id]/nodes/[nodeId]/tools - Get tool configuration
 * - PUT /api/v1/workflows/[id]/nodes/[nodeId]/tools - Update tool configuration
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
  ProcessNodeConfig,
  UIToolConfig,
} from '@/types/workflow'

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
 * Available tool types for PROCESS nodes
 */
const AVAILABLE_TOOL_TYPES = [
  {
    id: 'web_search',
    type: 'web_search',
    name: '网页搜索',
    description: '使用搜索引擎搜索网页内容',
    configSchema: {
      maxResults: { type: 'number', default: 5, min: 1, max: 20 },
      searchEngine: { type: 'string', default: 'google', enum: ['google', 'bing', 'duckduckgo'] },
    },
  },
  {
    id: 'web_fetch',
    type: 'web_fetch',
    name: '网页抓取',
    description: '抓取指定网页的内容',
    configSchema: {
      timeout: { type: 'number', default: 30000, min: 1000, max: 60000 },
      maxContentLength: { type: 'number', default: 50000 },
    },
  },
  {
    id: 'code_interpreter',
    type: 'code_interpreter',
    name: '代码解释器',
    description: '执行代码并返回结果',
    configSchema: {
      language: { type: 'string', default: 'python', enum: ['python', 'javascript'] },
      timeout: { type: 'number', default: 30000, min: 1000, max: 120000 },
    },
  },
  {
    id: 'file_search',
    type: 'file_search',
    name: '文件搜索',
    description: '在知识库中搜索相关文件',
    configSchema: {
      topK: { type: 'number', default: 5, min: 1, max: 20 },
      threshold: { type: 'number', default: 0.7, min: 0, max: 1 },
    },
  },
  {
    id: 'image_generation',
    type: 'image_generation',
    name: '图片生成',
    description: '根据描述生成图片',
    configSchema: {
      size: { type: 'string', default: '1024x1024', enum: ['1024x1024', '1792x1024', '1024x1792'] },
      quality: { type: 'string', default: 'standard', enum: ['standard', 'hd'] },
      style: { type: 'string', default: 'vivid', enum: ['vivid', 'natural'] },
    },
  },
  {
    id: 'http_request',
    type: 'http_request',
    name: 'HTTP请求',
    description: '发送HTTP请求到外部API',
    configSchema: {
      method: { type: 'string', default: 'GET', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      timeout: { type: 'number', default: 30000 },
      headers: { type: 'object', default: {} },
    },
  },
]

/**
 * GET /api/v1/workflows/[id]/nodes/[nodeId]/tools
 * Get tool configuration for a PROCESS node
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

    // Only PROCESS nodes support tools
    if (node.type !== 'PROCESS') {
      return ApiResponse.error('只有处理节点支持工具配置', 400)
    }

    const processNode = node as ProcessNodeConfig

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      nodeId: node.id,
      nodeName: node.name,
      toolConfig: {
        enableToolCalling: processNode.config.enableToolCalling || false,
        toolChoice: processNode.config.toolChoice || 'auto',
        maxToolCallRounds: processNode.config.maxToolCallRounds || 5,
        tools: processNode.config.tools || [],
        enabledTools: processNode.config.enabledTools || [],
      },
      availableTools: AVAILABLE_TOOL_TYPES,
    })
  } catch (error) {
    console.error('V1 API get tools error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取工具配置失败',
      500
    )
  }
}

/**
 * PUT /api/v1/workflows/[id]/nodes/[nodeId]/tools
 * Update tool configuration for a PROCESS node
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

    const node = nodes[nodeIndex]

    // Only PROCESS nodes support tools
    if (node.type !== 'PROCESS') {
      return ApiResponse.error('只有处理节点支持工具配置', 400)
    }

    const {
      enableToolCalling,
      toolChoice,
      maxToolCallRounds,
      tools,
      enabledTools,
      addTool,
      removeTool,
      updateTool,
    } = body as {
      enableToolCalling?: boolean
      toolChoice?: 'auto' | 'none' | 'required'
      maxToolCallRounds?: number
      tools?: UIToolConfig[]
      enabledTools?: string[]
      addTool?: UIToolConfig
      removeTool?: string
      updateTool?: { id: string; config: Partial<UIToolConfig> }
    }

    const processNode = node as ProcessNodeConfig
    const currentTools = [...(processNode.config.tools || [])]

    // Handle add tool
    if (addTool) {
      // Validate tool type
      const toolType = AVAILABLE_TOOL_TYPES.find((t) => t.type === addTool.type)
      if (!toolType) {
        return ApiResponse.error(`无效的工具类型：${addTool.type}`, 400)
      }

      // Check for duplicate
      if (currentTools.some((t) => t.id === addTool.id)) {
        return ApiResponse.error(`工具ID已存在：${addTool.id}`, 400)
      }

      currentTools.push({
        id: addTool.id || `${addTool.type}-${Date.now()}`,
        type: addTool.type,
        name: addTool.name || toolType.name,
        enabled: addTool.enabled !== false,
        config: addTool.config || {},
      })
    }

    // Handle remove tool
    if (removeTool) {
      const toolIndex = currentTools.findIndex((t) => t.id === removeTool)
      if (toolIndex !== -1) {
        currentTools.splice(toolIndex, 1)
      }
    }

    // Handle update tool
    if (updateTool) {
      const toolIndex = currentTools.findIndex((t) => t.id === updateTool.id)
      if (toolIndex === -1) {
        return ApiResponse.error(`工具不存在：${updateTool.id}`, 404)
      }

      currentTools[toolIndex] = {
        ...currentTools[toolIndex],
        ...updateTool.config,
      }
    }

    // Update node config
    const updatedConfig = {
      ...processNode.config,
      ...(enableToolCalling !== undefined && { enableToolCalling }),
      ...(toolChoice !== undefined && { toolChoice }),
      ...(maxToolCallRounds !== undefined && { maxToolCallRounds }),
      ...(tools !== undefined
        ? { tools }
        : addTool || removeTool || updateTool
        ? { tools: currentTools }
        : {}),
      ...(enabledTools !== undefined && { enabledTools }),
    }

    // Update node
    const updatedNode: ProcessNodeConfig = {
      ...processNode,
      config: updatedConfig,
    }

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
      nodeId: updatedNode.id,
      nodeName: updatedNode.name,
      toolConfig: {
        enableToolCalling: updatedConfig.enableToolCalling || false,
        toolChoice: updatedConfig.toolChoice || 'auto',
        maxToolCallRounds: updatedConfig.maxToolCallRounds || 5,
        tools: updatedConfig.tools || [],
        enabledTools: updatedConfig.enabledTools || [],
      },
    })
  } catch (error) {
    console.error('V1 API update tools error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '更新工具配置失败',
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
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
