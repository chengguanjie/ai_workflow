import { NextRequest, NextResponse } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import type { PlatformRole, OrgStatus } from '@prisma/client'
import { ApiResponse } from '@/lib/api/api-response'

// PUT - 更改企业状态
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:status')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { status, reason } = body as {
      status: OrgStatus
      reason?: string
    }

    // 验证状态值
    const validStatuses: OrgStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED']
    if (!validStatuses.includes(status)) {
      return ApiResponse.error('无效的状态值', 400)
    }

    // 检查企业是否存在
    const existing = await prisma.organization.findUnique({
      where: { id },
    })

    if (!existing) {
      return ApiResponse.error('企业不存在', 404)
    }

    // 更新状态
    const organization = await prisma.organization.update({
      where: { id },
      data: {
        status,
        statusReason: reason || null,
      },
    })

    // 记录审计日志
    await prisma.platformAuditLog.create({
      data: {
        action: `ORG_STATUS_${status}`,
        resource: 'organization',
        resourceId: id,
        detail: {
          organizationName: existing.name,
          previousStatus: existing.status,
          newStatus: status,
          reason,
        },
        adminId: session.user.id,
      },
    })

    return ApiResponse.success({
      id: organization.id,
      status: organization.status,
      statusReason: organization.statusReason,
    })
  } catch (error) {
    console.error('更改企业状态失败:', error)
    return ApiResponse.error('更改企业状态失败', 500)
  }
}
