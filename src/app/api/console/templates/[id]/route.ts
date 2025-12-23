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

// GET: 获取模板详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await checkPermission('template:read')
  if (check.error) {
    return ApiResponse.error(check.error, check.status as any)
  }

  const { id } = await params

  const template = await prisma.workflowTemplate.findUnique({
    where: { id },
  })

  if (!template) {
    return ApiResponse.error('模板不存在', 404)
  }

  return ApiResponse.success({ data: template })
}

// PATCH: 更新模板
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await checkPermission('template:update')
  if (check.error) {
    return ApiResponse.error(check.error, check.status as any)
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
      return ApiResponse.error('模板不存在', 404)
    }

    // 只能编辑公域模板
    if (existingTemplate.templateType !== 'PUBLIC' || !existingTemplate.isOfficial) {
      return ApiResponse.error('只能编辑公域模板', 403)
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!name?.trim()) {
        return ApiResponse.error('模板名称不能为空', 400)
      }
      updateData.name = name.trim()
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }

    if (category !== undefined) {
      if (!category?.trim()) {
        return ApiResponse.error('模板分类不能为空', 400)
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

    return ApiResponse.success({ data: template })
  } catch (error) {
    console.error('Failed to update template:', error)
    return ApiResponse.error('更新模板失败', 500)
  }
}

// DELETE: 删除模板
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await checkPermission('template:delete')
  if (check.error) {
    return ApiResponse.error(check.error, check.status as any)
  }

  const { id } = await params

  try {
    // 检查模板是否存在
    const existingTemplate = await prisma.workflowTemplate.findUnique({
      where: { id },
    })

    if (!existingTemplate) {
      return ApiResponse.error('模板不存在', 404)
    }

    // 只能删除公域模板
    if (existingTemplate.templateType !== 'PUBLIC' || !existingTemplate.isOfficial) {
      return ApiResponse.error('只能删除公域模板', 403)
    }

    await prisma.workflowTemplate.delete({
      where: { id },
    })

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete template:', error)
    return ApiResponse.error('删除模板失败', 500)
  }
}
