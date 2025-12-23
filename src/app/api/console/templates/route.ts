import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission, Permission } from '@/lib/console-auth/permissions'
import type { PlatformRole } from '@prisma/client'
import { ApiResponse } from '@/lib/api/api-response'

// 权限检查装饰器
async function checkPermission(permission: Permission) {
  const session = await consoleAuth()
  if (!session?.user) {
    return { error: '未登录', status: 401, admin: null }
  }

  const role = session.user.role as PlatformRole
  if (!hasPermission(role, permission)) {
    return { error: '权限不足', status: 403, admin: null }
  }

  return { error: null, status: 200, admin: session.user }
}

// GET: 获取公域模板列表
export async function GET(request: NextRequest) {
  const check = await checkPermission('template:read')
  if (check.error) {
    return ApiResponse.error(check.error, check.status as any)
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const category = searchParams.get('category') || undefined
  const search = searchParams.get('search') || undefined

  const where: Record<string, unknown> = {
    templateType: 'PUBLIC',
    isOfficial: true,
  }

  if (category) {
    where.category = category
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ]
  }

  const [templates, total] = await Promise.all([
    prisma.workflowTemplate.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.workflowTemplate.count({ where }),
  ])

  return ApiResponse.paginated(templates, {
    page,
    pageSize,
    total,
  })
}

// POST: 创建公域模板
export async function POST(request: NextRequest) {
  const check = await checkPermission('template:create')
  if (check.error) {
    return ApiResponse.error(check.error, check.status as any)
  }

  try {
    const body = await request.json()
    const { name, description, category, tags, thumbnail, config } = body

    if (!name?.trim()) {
      return ApiResponse.error('模板名称不能为空', 400)
    }

    if (!category?.trim()) {
      return ApiResponse.error('模板分类不能为空', 400)
    }

    if (!config || typeof config !== 'object') {
      return ApiResponse.error('模板配置无效', 400)
    }

    const template = await prisma.workflowTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        category: category.trim(),
        tags: tags || [],
        thumbnail,
        config: JSON.parse(JSON.stringify(config)),
        templateType: 'PUBLIC',
        visibility: 'PUBLIC',
        isOfficial: true,
        isHidden: false,
        organizationId: null,
        creatorId: null,
        creatorName: '官方',
      },
    })

    return ApiResponse.created({ data: template })
  } catch (error) {
    console.error('Failed to create template:', error)
    return ApiResponse.error('创建模板失败', 500)
  }
}
