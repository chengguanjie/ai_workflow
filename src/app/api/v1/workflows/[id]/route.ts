/**
 * V1 Workflow Detail API Routes
 *
 * Provides public API endpoints for workflow CRUD operations.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET /api/v1/workflows/[id] - Get workflow details
 * - PUT /api/v1/workflows/[id] - Update workflow
 * - DELETE /api/v1/workflows/[id] - Delete workflow
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
 * GET /api/v1/workflows/[id]
 * Get workflow details including full configuration
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
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        draftConfig: true,
        publishedConfig: true,
        publishStatus: true,
        version: true,
        category: true,
        tags: true,
        isActive: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    // Update token usage
    await updateTokenUsage(token.id)

    // Remove organizationId from response and return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { organizationId: _orgId, ...workflowData } = workflow

    return ApiResponse.success(workflowData)
  } catch (error) {
    console.error('V1 API get workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取工作流失败',
      500
    )
  }
}

/**
 * PUT /api/v1/workflows/[id]
 * Update workflow configuration
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    // Find existing workflow
    const existingWorkflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        version: true,
        publishStatus: true,
        publishedConfig: true,
      },
    })

    if (!existingWorkflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // Validate cross-organization access
    const crossOrgResult = validateCrossOrganization(
      token.organizationId,
      existingWorkflow.organizationId
    )
    if (!crossOrgResult.success) {
      return createCrossOrgNotFoundResponse('工作流')
    }

    const {
      name,
      description,
      config,
      category,
      tags,
      isActive,
      expectedVersion,
      forceOverwrite,
      publish,
    } = body as {
      name?: string
      description?: string
      config?: WorkflowConfig
      category?: string
      tags?: string[]
      isActive?: boolean
      expectedVersion?: number
      forceOverwrite?: boolean
      publish?: boolean
    }

    // Version conflict check
    if (expectedVersion !== undefined && !forceOverwrite) {
      if (existingWorkflow.version !== expectedVersion) {
        return ApiResponse.error(
          `版本冲突：当前版本为 ${existingWorkflow.version}，期望版本为 ${expectedVersion}`,
          409,
          { currentVersion: existingWorkflow.version }
        )
      }
    }

    // Validate fields
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return ApiResponse.error('工作流名称不能为空', 400)
      }
      if (name.length > 100) {
        return ApiResponse.error('工作流名称不能超过100个字符', 400)
      }
    }

    if (description !== undefined && description.length > 500) {
      return ApiResponse.error('工作流描述不能超过500个字符', 400)
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (category !== undefined) updateData.category = category || null
    if (tags !== undefined) updateData.tags = tags
    if (isActive !== undefined) updateData.isActive = isActive

    // Handle config update
    if (config !== undefined) {
      // Increment version for config
      const newVersion = config.version !== undefined && config.version >= existingWorkflow.version
        ? config.version
        : existingWorkflow.version + 1
      config.version = newVersion

      updateData.config = JSON.parse(JSON.stringify(config))
      updateData.draftConfig = JSON.parse(JSON.stringify(config))
      updateData.version = newVersion

      // Update publish status if was published before
      if (existingWorkflow.publishStatus === 'PUBLISHED') {
        updateData.publishStatus = 'DRAFT_MODIFIED'
      }
    }

    // Handle publish
    if (publish === true) {
      const draftWorkflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        select: { draftConfig: true },
      })
      const configToPublish = config || draftWorkflow?.draftConfig

      if (configToPublish) {
        updateData.publishedConfig = JSON.parse(JSON.stringify(configToPublish))
        updateData.publishStatus = 'PUBLISHED'
      }
    }

    // Update workflow
    const updatedWorkflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        draftConfig: true,
        publishedConfig: true,
        publishStatus: true,
        version: true,
        category: true,
        tags: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.success(updatedWorkflow)
  } catch (error) {
    console.error('V1 API update workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '更新工作流失败',
      500
    )
  }
}

/**
 * DELETE /api/v1/workflows/[id]
 * Soft delete a workflow
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

    // Find workflow
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

    // Soft delete workflow
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { deletedAt: new Date() },
    })

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.noContent()
  } catch (error) {
    console.error('V1 API delete workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '删除工作流失败',
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
