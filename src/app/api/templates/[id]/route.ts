/**
 * 单个工作流模板 API
 *
 * GET /api/templates/[id] - 获取模板详情
 * PUT /api/templates/[id] - 更新模板
 * DELETE /api/templates/[id] - 删除模板
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import type { TemplateVisibility, WorkflowTemplate } from '@prisma/client'

interface UpdateTemplateRequest {
  name?: string
  description?: string
  category?: string
  tags?: string[]
  thumbnail?: string
  config?: Record<string, unknown>
  visibility?: TemplateVisibility
}

/**
 * GET /api/templates/[id]
 * 获取模板详情
 */
export const GET = withAuth<ApiSuccessResponse<WorkflowTemplate>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<WorkflowTemplate>>> => {
    const templateId = params?.id

    if (!templateId) {
      throw new ValidationError('模板ID不能为空')
    }

    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      throw new NotFoundError('模板不存在')
    }

    // 检查访问权限
    const canAccess =
      template.visibility === 'PUBLIC' ||
      template.isOfficial ||
      template.creatorId === user.id ||
      (template.visibility === 'ORGANIZATION' &&
        template.organizationId === user.organizationId)

    if (!canAccess) {
      throw new AuthorizationError('无权访问此模板')
    }

    // 增加使用计数（仅查看时）
    await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    })

    return ApiResponse.success(template)
  }
)

/**
 * PUT /api/templates/[id]
 * 更新模板
 */
export const PUT = withAuth<ApiSuccessResponse<WorkflowTemplate>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<WorkflowTemplate>>> => {
    const templateId = params?.id

    if (!templateId) {
      throw new ValidationError('模板ID不能为空')
    }

    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      throw new NotFoundError('模板不存在')
    }

    // 检查编辑权限（只有创建者可以编辑，官方模板不可编辑）
    if (template.isOfficial) {
      throw new AuthorizationError('官方模板不可编辑')
    }

    if (template.creatorId !== user.id) {
      throw new AuthorizationError('无权编辑此模板')
    }

    const body = (await request.json()) as UpdateTemplateRequest
    const { name, description, category, tags, thumbnail, config, visibility } = body

    // 验证配置
    if (config) {
      if (typeof config !== 'object') {
        throw new ValidationError('模板配置无效')
      }
      if (!Array.isArray(config.nodes) || !Array.isArray(config.edges)) {
        throw new ValidationError('模板配置必须包含 nodes 和 edges')
      }
    }

    const updatedTemplate = await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(category && { category: category.trim() }),
        ...(tags && { tags }),
        ...(thumbnail !== undefined && { thumbnail }),
        ...(config && { config: JSON.parse(JSON.stringify(config)) }),
        ...(visibility && { visibility }),
      },
    })

    return ApiResponse.success(updatedTemplate)
  }
)

/**
 * DELETE /api/templates/[id]
 * 删除模板
 */
export const DELETE = withAuth<ApiSuccessResponse<{ deleted: boolean }>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<{ deleted: boolean }>>> => {
    const templateId = params?.id

    if (!templateId) {
      throw new ValidationError('模板ID不能为空')
    }

    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      throw new NotFoundError('模板不存在')
    }

    // 检查删除权限（只有创建者可以删除，官方模板不可删除）
    if (template.isOfficial) {
      throw new AuthorizationError('官方模板不可删除')
    }

    if (template.creatorId !== user.id) {
      throw new AuthorizationError('无权删除此模板')
    }

    await prisma.workflowTemplate.delete({
      where: { id: templateId },
    })

    return ApiResponse.success({ deleted: true })
  }
)
