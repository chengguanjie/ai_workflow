/**
 * V1 Workflow Publish API Routes
 *
 * Provides public API endpoints for publishing workflows.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - POST /api/v1/workflows/[id]/publish - Publish workflow
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
import type { WorkflowConfig } from '@/types/workflow'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/v1/workflows/[id]/publish
 * Publish the current draft workflow to production
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

    // Find workflow
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
        version: true,
        config: true,
        draftConfig: true,
        publishedConfig: true,
        publishStatus: true,
        creatorId: true,
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

    // Get config to publish
    const configToPublish = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig

    if (!configToPublish) {
      return ApiResponse.error('没有可发布的配置', 400)
    }

    // Validate config has required elements
    const nodes = configToPublish.nodes || []
    const edges = configToPublish.edges || []

    if (nodes.length === 0) {
      return ApiResponse.error('工作流至少需要一个节点', 400)
    }

    // Check for INPUT node
    const hasInputNode = nodes.some((n) => n.type === 'INPUT')
    if (!hasInputNode) {
      return ApiResponse.error('工作流需要至少一个输入节点', 400)
    }

    // Check for PROCESS node
    const hasProcessNode = nodes.some((n) => n.type === 'PROCESS')
    if (!hasProcessNode) {
      return ApiResponse.error('工作流需要至少一个处理节点', 400)
    }

    // Validate all non-INPUT nodes have incoming edges
    for (const node of nodes) {
      if (node.type === 'INPUT') continue

      const hasIncoming = edges.some((e) => e.target === node.id)
      if (!hasIncoming) {
        return ApiResponse.error(
          `节点 "${node.name}" (${node.id}) 没有输入连接`,
          400
        )
      }
    }

    // Create version record
    const newVersion = workflow.version + 1
    const configJson = JSON.parse(JSON.stringify(configToPublish))

    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        versionNumber: newVersion,
        versionType: 'MANUAL',
        config: configJson,
        commitMessage: `API发布版本 v${newVersion}`,
        isPublished: true,
        isActive: true,
        createdById: token.createdById,
      },
    })

    // Update workflow
    const updatedWorkflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        config: configJson,
        publishedConfig: configJson,
        draftConfig: configJson,
        publishStatus: 'PUBLISHED',
        version: newVersion,
        publishedAt: new Date(),
        publishedBy: token.createdById,
      },
      select: {
        id: true,
        name: true,
        version: true,
        publishStatus: true,
        updatedAt: true,
      },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success({
      message: '工作流发布成功',
      workflow: updatedWorkflow,
      publishedVersion: newVersion,
    })
  } catch (error) {
    console.error('V1 API publish workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '发布工作流失败',
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
