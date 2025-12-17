import { NextRequest, NextResponse } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import type { PlatformRole, OrgStatus } from '@prisma/client'

// PUT - 更改企业状态
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:status')) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 })
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
      return NextResponse.json(
        { error: '无效的状态值' },
        { status: 400 }
      )
    }

    // 检查企业是否存在
    const existing = await prisma.organization.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '企业不存在' }, { status: 404 })
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

    return NextResponse.json({
      id: organization.id,
      status: organization.status,
      statusReason: organization.statusReason,
    })
  } catch (error) {
    console.error('更改企业状态失败:', error)
    return NextResponse.json(
      { error: '更改企业状态失败' },
      { status: 500 }
    )
  }
}
