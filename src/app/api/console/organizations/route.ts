import { NextRequest, NextResponse } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import { hash } from 'bcryptjs'
import type { PlatformRole, Plan, OrgStatus } from '@prisma/client'

// 生成随机密码
function generatePassword(length = 12): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// GET - 获取企业列表
export async function GET(request: NextRequest) {
  const session = await consoleAuth()

  if (!session?.user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:read')) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  // 分页参数
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const skip = (page - 1) * pageSize

  // 筛选参数
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') as OrgStatus | null
  const plan = searchParams.get('plan') as Plan | null

  // 排序参数
  const sortBy = searchParams.get('sortBy') || 'createdAt'
  const sortOrder = searchParams.get('sortOrder') || 'desc'

  // 构建查询条件
  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { users: { some: { email: { contains: search } } } },
    ]
  }

  if (status) {
    where.status = status
  }

  if (plan) {
    where.plan = plan
  }

  // 查询企业列表
  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      include: {
        users: {
          where: { role: 'OWNER' },
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        _count: {
          select: {
            users: true,
            workflows: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: pageSize,
    }),
    prisma.organization.count({ where }),
  ])

  // 格式化返回数据
  const data = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    logo: org.logo,
    industry: org.industry,
    plan: org.plan,
    status: org.status,
    apiQuota: org.apiQuota,
    apiUsed: org.apiUsed,
    owner: org.users[0] || null,
    userCount: org._count.users,
    workflowCount: org._count.workflows,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  }))

  return NextResponse.json({
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}

// POST - 创建企业
export async function POST(request: NextRequest) {
  const session = await consoleAuth()

  if (!session?.user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:create')) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const {
      name,
      industry,
      website,
      phone,
      address,
      plan = 'FREE',
      apiQuota = 10000,
      owner,
      notes,
    } = body

    // 验证必填字段
    if (!name || !owner?.email || !owner?.name) {
      return NextResponse.json(
        { error: '企业名称、企业主邮箱和姓名为必填项' },
        { status: 400 }
      )
    }

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email: owner.email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: '该邮箱已被使用' },
        { status: 400 }
      )
    }

    // 生成或使用提供的密码
    const tempPassword = owner.password || generatePassword()
    const passwordHash = await hash(tempPassword, 12)

    // 创建企业和企业主（事务）
    const organization = await prisma.organization.create({
      data: {
        name,
        industry,
        website,
        phone,
        address,
        plan,
        apiQuota,
        status: 'ACTIVE',
        createdByAdminId: session.user.id,
        notes,
        users: {
          create: {
            email: owner.email,
            name: owner.name,
            passwordHash,
            role: 'OWNER',
            isActive: true,
          },
        },
      },
      include: {
        users: {
          where: { role: 'OWNER' },
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    })

    // 记录审计日志
    await prisma.platformAuditLog.create({
      data: {
        action: 'CREATE_ORG',
        resource: 'organization',
        resourceId: organization.id,
        detail: {
          organizationName: name,
          plan,
          ownerEmail: owner.email,
        },
        adminId: session.user.id,
      },
    })

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        status: organization.status,
        createdAt: organization.createdAt,
      },
      owner: {
        id: organization.users[0].id,
        email: organization.users[0].email,
        name: organization.users[0].name,
        // 仅当自动生成密码时返回临时密码
        tempPassword: owner.password ? undefined : tempPassword,
      },
    })
  } catch (error) {
    console.error('创建企业失败:', error)
    return NextResponse.json(
      { error: '创建企业失败' },
      { status: 500 }
    )
  }
}
