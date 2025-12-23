import { NextRequest } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import type { PlatformRole } from '@prisma/client'

// GET - 获取企业详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:read')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: [
          { role: 'asc' }, // OWNER first
          { createdAt: 'asc' },
        ],
      },
      _count: {
        select: {
          workflows: true,
          users: true,
          apiKeys: true,
          apiTokens: true,
        },
      },
    },
  })

  if (!organization) {
    return ApiResponse.error('企业不存在', 404)
  }

  // 获取最近的执行统计
  const recentExecutions = await prisma.execution.groupBy({
    by: ['status'],
    where: {
      workflow: {
        organizationId: id,
      },
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30天内
      },
    },
    _count: true,
  })

  // Get total executions count for this organization's workflows
  const executionCount = await prisma.execution.count({
    where: {
      workflow: {
        organizationId: id,
      },
    },
  })

  return ApiResponse.success({
    ...organization,
    stats: {
      workflowCount: organization._count.workflows,
      userCount: organization._count.users,
      executionCount,
      apiKeyCount: organization._count.apiKeys,
      apiTokenCount: organization._count.apiTokens,
      recentExecutions: recentExecutions.reduce(
        (acc, item) => ({
          ...acc,
          [item.status]: item._count,
        }),
        {}
      ),
    },
  })
}

// PUT - 更新企业信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:update')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  try {
    const body = await request.json()

    const {
      name,
      logo,
      description,
      industry,
      website,
      phone,
      address,
      plan,
      apiQuota,
      billingEmail,
      billingContact,
      notes,
    } = body

    // 检查企业是否存在
    const existing = await prisma.organization.findUnique({
      where: { id },
    })

    if (!existing) {
      return ApiResponse.error('企业不存在', 404)
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name
    if (logo !== undefined) updateData.logo = logo
    if (description !== undefined) updateData.description = description
    if (industry !== undefined) updateData.industry = industry
    if (website !== undefined) updateData.website = website
    if (phone !== undefined) updateData.phone = phone
    if (address !== undefined) updateData.address = address
    if (plan !== undefined) updateData.plan = plan
    if (apiQuota !== undefined) updateData.apiQuota = apiQuota
    if (billingEmail !== undefined) updateData.billingEmail = billingEmail
    if (billingContact !== undefined) updateData.billingContact = billingContact
    if (notes !== undefined) updateData.notes = notes

    // 更新企业
    const organization = await prisma.organization.update({
      where: { id },
      data: updateData,
    })

    // 记录审计日志
    await prisma.platformAuditLog.create({
      data: {
        action: 'UPDATE_ORG',
        resource: 'organization',
        resourceId: id,
        detail: JSON.parse(JSON.stringify({
          changes: updateData,
          previousValues: {
            name: existing.name,
            plan: existing.plan,
            apiQuota: existing.apiQuota,
          },
        })),
        adminId: session.user.id,
      },
    })

    return ApiResponse.success(organization)
  } catch (error) {
    console.error('更新企业失败:', error)
    return ApiResponse.error('更新企业失败', 500)
  }
}

// DELETE - 删除企业（仅超级管理员）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'organization:delete')) {
    return ApiResponse.error('权限不足', 403)
  }

  const { id } = await params

  try {
    // 检查企业是否存在
    const existing = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            workflows: true,
          },
        },
      },
    })

    if (!existing) {
      return ApiResponse.error('企业不存在', 404)
    }

    // 记录审计日志（在删除前记录）
    await prisma.platformAuditLog.create({
      data: {
        action: 'DELETE_ORG',
        resource: 'organization',
        resourceId: id,
        detail: {
          organizationName: existing.name,
          userCount: existing._count.users,
          workflowCount: existing._count.workflows,
        },
        adminId: session.user.id,
      },
    })

    // 删除企业（级联删除关联数据）
    await prisma.organization.delete({
      where: { id },
    })

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('删除企业失败:', error)
    return ApiResponse.error('删除企业失败', 500)
  }
}
