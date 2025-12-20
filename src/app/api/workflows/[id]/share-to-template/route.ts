/**
 * 分享工作流到内部模板库 API
 *
 * POST /api/workflows/[id]/share-to-template - 将工作流分享为内部模板
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import type { WorkflowTemplate, TemplateVisibility } from '@prisma/client'

interface ShareToTemplateRequest {
  name: string
  description?: string
  category: string
  tags?: string[]
  visibility?: TemplateVisibility
}

/**
 * POST /api/workflows/[id]/share-to-template
 * 将工作流分享为内部模板
 */
export const POST = withAuth<ApiSuccessResponse<WorkflowTemplate>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<WorkflowTemplate>>> => {
    const workflowId = params?.id
    if (!workflowId) {
      throw new NotFoundError('工作流不存在')
    }

    // 获取工作流
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        creatorId: true,
      },
    })

    if (!workflow) {
      throw new NotFoundError('工作流不存在')
    }

    // 解析请求体
    const body = (await request.json()) as ShareToTemplateRequest
    const { name, description, category, tags, visibility } = body

    // 验证必填字段
    if (!name?.trim()) {
      throw new ValidationError('模板名称不能为空')
    }

    if (!category?.trim()) {
      throw new ValidationError('模板分类不能为空')
    }

    // 验证配置
    const config = workflow.config as Record<string, unknown>
    if (!config || typeof config !== 'object') {
      throw new ValidationError('工作流配置无效')
    }

    if (!Array.isArray(config.nodes) || !Array.isArray(config.edges)) {
      throw new ValidationError('工作流配置必须包含 nodes 和 edges')
    }

    // 获取用户的部门信息
    const userWithDept = await prisma.user.findUnique({
      where: { id: user.id },
      select: { departmentId: true },
    })

    // 创建模板
    const template = await prisma.workflowTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || workflow.description,
        category: category.trim(),
        tags: tags || [],
        config: JSON.parse(JSON.stringify(config)),
        visibility: visibility || 'ORGANIZATION',
        templateType: 'INTERNAL', // 内部模板
        organizationId: user.organizationId,
        creatorId: user.id,
        creatorName: user.name || user.email,
        creatorDepartmentId: userWithDept?.departmentId || null,
        isOfficial: false,
        isHidden: false,
      },
    })

    return ApiResponse.created(template)
  }
)
