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
import type { TemplateVisibility, TemplateType, WorkflowTemplate } from '@prisma/client'
import type { JsonValue } from '@prisma/client/runtime/library'
import { CacheService } from '@/services/cache-service'

interface TemplateListParams {
  category?: string
  visibility?: TemplateVisibility
  templateType?: TemplateType // 新增：模板类型筛选
  search?: string
  page?: number
  limit?: number
  includeOfficial?: boolean
  minRating?: number // 新增：最低评分筛选
}

interface TemplateListItem {
  id: string
  name: string
  description: string | null
  category: string
  tags: JsonValue
  thumbnail: string | null
  templateType: TemplateType
  visibility: TemplateVisibility
  organizationId: string | null
  creatorId: string | null
  creatorName: string | null
  usageCount: number
  rating: number
  ratingCount: number
  isOfficial: boolean
  version: string
  createdAt: Date
  updatedAt: Date
}

interface TemplateListResponse {
  templates: TemplateListItem[]
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
      templateType: (searchParams.get('templateType') as TemplateType) || undefined,
      search: searchParams.get('search') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
      includeOfficial: searchParams.get('includeOfficial') !== 'false',
      minRating: searchParams.get('minRating') ? parseFloat(searchParams.get('minRating')!) : undefined,
    }

    const { category, visibility, templateType, search, page, limit, includeOfficial, minRating } = params

    // 构建查询条件
    const where: Record<string, unknown> = {
      isHidden: false, // 排除隐藏的模板
    }

    // 根据模板类型构建不同的查询条件
    if (templateType === 'PUBLIC') {
      // 只查询公域模板（平台官方推送）
      where.templateType = 'PUBLIC'
      where.isOfficial = true
    } else if (templateType === 'INTERNAL') {
      // 只查询内部模板
      where.templateType = 'INTERNAL'
      where.OR = [
        // 用户自己的私有模板
        { creatorId: user.id, visibility: 'PRIVATE' },
        // 企业内的模板
        { organizationId: user.organizationId, visibility: 'ORGANIZATION' },
      ]
    } else {
      // 默认：显示所有可见的模板
      where.OR = [
        // 官方模板（如果包含）
        ...(includeOfficial ? [{ isOfficial: true, templateType: 'PUBLIC' }] : []),
        // 用户自己的私有模板
        { creatorId: user.id, visibility: 'PRIVATE', templateType: 'INTERNAL' },
        // 企业内的模板
        { organizationId: user.organizationId, visibility: 'ORGANIZATION', templateType: 'INTERNAL' },
        // 公开的内部模板
        { visibility: 'PUBLIC', isOfficial: false, templateType: 'INTERNAL' },
      ]
    }

    if (category) {
      where.category = category
    }

    if (visibility && !templateType) {
      where.visibility = visibility
    }

    if (minRating && minRating > 0) {
      where.rating = { gte: minRating }
    }

    if (search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        },
      ]
    }

    // Generate Cache Key based on params
    const cacheKey = CacheService.generateKey('templates', `list:${user.organizationId}:${JSON.stringify(params)}`)

    const { templates, total } = await CacheService.getOrSet(
      cacheKey,
      async () => {
        const [templates, total] = await Promise.all([
          prisma.workflowTemplate.findMany({
            where,
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              tags: true,
              thumbnail: true,
              templateType: true,
              visibility: true,
              organizationId: true,
              creatorId: true,
              creatorName: true,
              usageCount: true,
              rating: true,
              ratingCount: true,
              isOfficial: true,
              version: true,
              createdAt: true,
              updatedAt: true,
            },
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
        return { templates, total }
      },
      300 // 5 minutes cache
    )

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

    // 获取用户的部门信息
    const userWithDept = await prisma.user.findUnique({
      where: { id: user.id },
      select: { departmentId: true },
    })

    const template = await prisma.workflowTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        category: category.trim(),
        tags: tags || [],
        thumbnail,
        config: JSON.parse(JSON.stringify(config)),
        visibility: visibility || 'PRIVATE',
        templateType: 'INTERNAL', // 用户创建的都是内部模板
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
