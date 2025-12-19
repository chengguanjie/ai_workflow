/**
 * 从模板创建工作流 API
 *
 * POST /api/templates/[id]/use - 使用模板创建新工作流
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import type { Workflow } from '@prisma/client'

interface UseTemplateRequest {
  name?: string
  description?: string
}

/**
 * POST /api/templates/[id]/use
 * 从模板创建新工作流
 */
export const POST = withAuth<ApiSuccessResponse<Workflow>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<Workflow>>> => {
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
      throw new AuthorizationError('无权使用此模板')
    }

    const body = (await request.json()) as UseTemplateRequest
    const { name, description } = body

    // 创建工作流
    const workflow = await prisma.workflow.create({
      data: {
        name: name?.trim() || `${template.name} - 副本`,
        description: description?.trim() || template.description,
        category: template.category,
        tags: template.tags as string[],
        config: template.config as object,
        organizationId: user.organizationId,
        creatorId: user.id,
      },
    })

    // 增加模板使用计数
    await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    })

    return ApiResponse.created(workflow)
  }
)
