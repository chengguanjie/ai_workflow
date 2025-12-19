/**
 * 工作流模板 API
 *
 * GET /api/templates - 获取模板列表
 * POST /api/templates - 创建模板
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import type { TemplateVisibility, WorkflowTemplate } from '@prisma/client'

interface TemplateListParams {
  category?: string
  visibility?: TemplateVisibility
  search?: string
  page?: number
  limit?: number
  includeOfficial?: boolean
}

interface TemplateListResponse {
  templates: WorkflowTemplate[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface CreateTemplateRequest {
  name: string
  description?: string
  category: string
  tags?: string[]
  thumbnail?: string
  config: Record<string, unknown>
  visibility?: TemplateVisibility
}

/**
 * GET /api/templates
 * 获取模板列表
 */
export const GET = withAuth<ApiSuccessResponse<TemplateListResponse>>(
  async (
    request: NextRequest,
    { user }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<TemplateListResponse>>> => {
    const { searchParams } = new URL(request.url)

    const params: TemplateListParams = {
      category: searchParams.get('category') || undefined,
      visibility: (searchParams.get('visibility') as TemplateVisibility) || undefined,
      search: searchParams.get('search') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
      includeOfficial: searchParams.get('includeOfficial') !== 'false',
    }

    const { category, visibility, search, page, limit, includeOfficial } = params

    // 构建查询条件
    const where: Record<string, unknown> = {
      OR: [
        // 官方模板（如果包含）
        ...(includeOfficial ? [{ isOfficial: true, visibility: 'PUBLIC' }] : []),
        // 用户自己的私有模板
        { creatorId: user.id, visibility: 'PRIVATE' },
        // 企业内的模板
        { organizationId: user.organizationId, visibility: 'ORGANIZATION' },
        // 公开模板
        { visibility: 'PUBLIC', isOfficial: false },
      ],
    }

    if (category) {
      where.category = category
    }

    if (visibility) {
      where.visibility = visibility
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        },
      ]
    }

    const [templates, total] = await Promise.all([
      prisma.workflowTemplate.findMany({
        where,
        orderBy: [
          { isOfficial: 'desc' },
          { usageCount: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page! - 1) * limit!,
        take: limit,
      }),
      prisma.workflowTemplate.count({ where }),
    ])

    return ApiResponse.success({
      templates,
      total,
      page: page!,
      limit: limit!,
      totalPages: Math.ceil(total / limit!),
    })
  }
)

/**
 * POST /api/templates
 * 创建模板
 */
export const POST = withAuth<ApiSuccessResponse<WorkflowTemplate>>(
  async (
    request: NextRequest,
    { user }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<WorkflowTemplate>>> => {
    const body = (await request.json()) as CreateTemplateRequest

    const { name, description, category, tags, thumbnail, config, visibility } = body

    // 验证必填字段
    if (!name?.trim()) {
      throw new ValidationError('模板名称不能为空')
    }

    if (!category?.trim()) {
      throw new ValidationError('模板分类不能为空')
    }

    if (!config || typeof config !== 'object') {
      throw new ValidationError('模板配置无效')
    }

    // 验证配置中包含节点和边
    if (!Array.isArray(config.nodes) || !Array.isArray(config.edges)) {
      throw new ValidationError('模板配置必须包含 nodes 和 edges')
    }

    const template = await prisma.workflowTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        category: category.trim(),
        tags: tags || [],
        thumbnail,
        config: JSON.parse(JSON.stringify(config)),
        visibility: visibility || 'PRIVATE',
        organizationId: user.organizationId,
        creatorId: user.id,
        creatorName: user.name || user.email,
        isOfficial: false,
      },
    })

    return ApiResponse.created(template)
  }
)
