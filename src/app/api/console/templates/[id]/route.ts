/**
 * 平台管理后台 - 单个模板管理 API
 *
 * GET /api/console/templates/[id] - 获取模板详情
 * PATCH /api/console/templates/[id] - 更新模板
 * DELETE /api/console/templates/[id] - 删除模板
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission, Permission } from '@/lib/console-auth/permissions'
import type { PlatformRole } from '@prisma/client'

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

// GET: 获取模板详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await checkPermission('template:read')
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const { id } = await params

  const template = await prisma.workflowTemplate.findUnique({
    where: { id },
  })

  if (!template) {
    return NextResponse.json({ error: '模板不存在' }, { status: 404 })
  }

  return NextResponse.json({ data: template })
}

// PATCH: 更新模板
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await checkPermission('template:update')
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { name, description, category, tags, thumbnail, config, isHidden } = body

    // 检查模板是否存在
    const existingTemplate = await prisma.workflowTemplate.findUnique({
      where: { id },
    })

    if (!existingTemplate) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 })
    }

    // 只能编辑公域模板
    if (existingTemplate.templateType !== 'PUBLIC' || !existingTemplate.isOfficial) {
      return NextResponse.json({ error: '只能编辑公域模板' }, { status: 403 })
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!name?.trim()) {
        return NextResponse.json({ error: '模板名称不能为空' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }

    if (category !== undefined) {
      if (!category?.trim()) {
        return NextResponse.json({ error: '模板分类不能为空' }, { status: 400 })
      }
      updateData.category = category.trim()
    }

    if (tags !== undefined) {
      updateData.tags = tags
    }

    if (thumbnail !== undefined) {
      updateData.thumbnail = thumbnail
    }

    if (config !== undefined) {
      updateData.config = JSON.parse(JSON.stringify(config))
    }

    if (isHidden !== undefined) {
      updateData.isHidden = isHidden
    }

    const template = await prisma.workflowTemplate.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ data: template })
  } catch (error) {
    console.error('Failed to update template:', error)
    return NextResponse.json({ error: '更新模板失败' }, { status: 500 })
  }
}

// DELETE: 删除模板
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await checkPermission('template:delete')
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const { id } = await params

  try {
    // 检查模板是否存在
    const existingTemplate = await prisma.workflowTemplate.findUnique({
      where: { id },
    })

    if (!existingTemplate) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 })
    }

    // 只能删除公域模板
    if (existingTemplate.templateType !== 'PUBLIC' || !existingTemplate.isOfficial) {
      return NextResponse.json({ error: '只能删除公域模板' }, { status: 403 })
    }

    await prisma.workflowTemplate.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete template:', error)
    return NextResponse.json({ error: '删除模板失败' }, { status: 500 })
  }
}
