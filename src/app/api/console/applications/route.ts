import { NextRequest } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import type { PlatformRole, ApplicationStatus } from '@prisma/client'

// GET - 获取申请列表
export async function GET(request: NextRequest) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:read')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { searchParams } = new URL(request.url)

  // 分页参数
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const skip = (page - 1) * pageSize

  // 筛选参数
  const status = searchParams.get('status') as ApplicationStatus | null
  const search = searchParams.get('search') || ''

  // 构建查询条件
  const where: Record<string, unknown> = {}

  if (status) {
    where.status = status
  }

  if (search) {
    where.OR = [
      { orgName: { contains: search } },
      { contactEmail: { contains: search } },
      { contactName: { contains: search } },
    ]
  }

  // 查询申请列表
  const [applications, total] = await Promise.all([
    prisma.orgApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.orgApplication.count({ where }),
  ])

  return ApiResponse.success({
    data: applications,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
