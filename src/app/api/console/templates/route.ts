/**
 * 平台管理后台 - 公域模板管理 API
 *
 * GET /api/console/templates - 获取公域模板列表
 * POST /api/console/templates - 创建公域模板
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { hasPermission, Permission } from '@/lib/console-auth/permissions'

// 简单的 console 认证检查
async function getConsoleAdmin() {
  const cookieStore = await cookies()
  const adminId = cookieStore.get('console_admin_id')?.value

  if (!adminId) return null

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  })

  if (!admin || !admin.isActive) return null

  return admin
}

// 权限检查装饰器
async function checkPermission(permission: Permission) {
  const admin = await getConsoleAdmin()
  if (!admin) {
    return { error: '未登录', status: 401, admin: null }
  }
  if (!hasPermission(admin.role, permission)) {
    return { error: '权限不足', status: 403, admin: null }
  }
  return { error: null, status: 200, admin }
}

// GET: 获取公域模板列表
export async function GET(request: NextRequest) {
  const check = await checkPermission('template:read')
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status })
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

  return NextResponse.json({
    data: templates,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}

// POST: 创建公域模板
export async function POST(request: NextRequest) {
  const check = await checkPermission('template:create')
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  try {
    const body = await request.json()
    const { name, description, category, tags, thumbnail, config } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: '模板名称不能为空' }, { status: 400 })
    }

    if (!category?.trim()) {
      return NextResponse.json({ error: '模板分类不能为空' }, { status: 400 })
    }

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: '模板配置无效' }, { status: 400 })
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

    return NextResponse.json({ data: template }, { status: 201 })
  } catch (error) {
    console.error('Failed to create template:', error)
    return NextResponse.json({ error: '创建模板失败' }, { status: 500 })
  }
}
