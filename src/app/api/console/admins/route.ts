import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { hash } from 'bcryptjs'
import { ApiResponse } from '@/lib/api/api-response'
import { PlatformRole } from '@prisma/client'

// 获取管理员列表
export async function GET(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    // 只有超管和管理员可以查看管理员列表
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role as string)) {
      return ApiResponse.error('权限不足', 403)
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const role = searchParams.get('role')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (role) {
      where.role = role
    }
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ]
    }

    const [admins, total] = await Promise.all([
      prisma.platformAdmin.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          loginAttempts: true,
          lockedUntil: true,
          createdAt: true,
          createdById: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.platformAdmin.count({ where }),
    ])

    return ApiResponse.paginated(admins, {
      page,
      pageSize,
      total,
    })
  } catch (error) {
    console.error('获取管理员列表失败:', error)
    return ApiResponse.error('获取失败', 500)
  }
}

// 创建新管理员
export async function POST(request: NextRequest) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    // 只有超管可以创建管理员
    if (session.user.role !== 'SUPER_ADMIN') {
      return ApiResponse.error('只有超级管理员可以创建管理员', 403)
    }

    const body = await request.json()
    const { email, name, password, role } = body

    if (!email || !password) {
      return ApiResponse.error('邮箱和密码为必填', 400)
    }

    // 检查邮箱是否已存在
    const existing = await prisma.platformAdmin.findUnique({
      where: { email },
    })
    if (existing) {
      return ApiResponse.error('该邮箱已被使用', 400)
    }

    // 验证角色
    const validRoles: PlatformRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'SUPPORT']
    if (role && !validRoles.includes(role)) {
      return ApiResponse.error('无效的角色', 400)
    }

    const passwordHash = await hash(password, 12)

    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        name,
        passwordHash,
        role: role || 'OPERATOR',
        createdById: session.user.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    // 记录审计日志
    await prisma.platformAuditLog.create({
      data: {
        action: 'CREATE_ADMIN',
        resource: 'admin',
        resourceId: admin.id,
        detail: { email, name, role: role || 'OPERATOR' },
        adminId: session.user.id,
      },
    })

    return ApiResponse.created(admin)
  } catch (error) {
    console.error('创建管理员失败:', error)
    return ApiResponse.error('创建失败', 500)
  }
}
