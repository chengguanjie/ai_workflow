import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PermissionLevel, PermissionTargetType } from '@prisma/client'
import { invalidateWorkflowPermissionCache } from '@/lib/permissions/workflow'
import { ApiResponse } from '@/lib/api/api-response'

// GET: 获取工作流权限列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: workflowId } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查工作流是否存在且属于当前组织
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // 只有 OWNER、ADMIN 或工作流创建者可以查看权限设置
    const canManagePermissions =
      session.user.role === 'OWNER' ||
      session.user.role === 'ADMIN' ||
      workflow.creatorId === session.user.id

    if (!canManagePermissions) {
      return ApiResponse.error('权限不足', 403)
    }

    const permissions = await prisma.workflowPermission.findMany({
      where: { workflowId },
      include: {
        department: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // 批量获取用户信息（避免 N+1 查询）
    const userIds = permissions
      .filter((p) => p.targetType === 'USER' && p.targetId)
      .map((p) => p.targetId as string)

    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, avatar: true },
        })
        : []

    const userMap = new Map(users.map((u) => [u.id, u]))

    const enrichedPermissions = permissions.map((p) => ({
      ...p,
      user: p.targetType === 'USER' && p.targetId ? userMap.get(p.targetId) || null : null,
    }))

    return ApiResponse.success({ permissions: enrichedPermissions })
  } catch (error) {
    console.error('Failed to get workflow permissions:', error)
    return ApiResponse.error('获取权限列表失败', 500)
  }
}

// POST: 添加工作流权限
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: workflowId } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查工作流是否存在
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // 只有 OWNER、ADMIN 或工作流创建者可以设置权限
    const canManagePermissions =
      session.user.role === 'OWNER' ||
      session.user.role === 'ADMIN' ||
      workflow.creatorId === session.user.id

    if (!canManagePermissions) {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const { targetType, targetId, permission } = body

    // 验证参数
    if (!Object.values(PermissionTargetType).includes(targetType as any)) {
      return ApiResponse.error('无效的目标类型', 400)
    }

    if (!Object.values(PermissionLevel).includes(permission as any)) {
      return ApiResponse.error('无效的权限级别', 400)
    }

    // 验证目标存在
    if (targetType === 'USER') {
      if (!targetId) {
        return ApiResponse.error('请指定用户', 400)
      }
      const user = await prisma.user.findFirst({
        where: {
          id: targetId,
          organizationId: session.user.organizationId,
        },
      })
      if (!user) {
        return ApiResponse.error('用户不存在', 400)
      }
    } else if (targetType === 'DEPARTMENT') {
      if (!targetId) {
        return ApiResponse.error('请指定部门', 400)
      }
      const department = await prisma.department.findFirst({
        where: {
          id: targetId,
          organizationId: session.user.organizationId,
        },
      })
      if (!department) {
        return ApiResponse.error('部门不存在', 400)
      }
    }

    // 检查是否已存在相同权限
    const existingPermission = await prisma.workflowPermission.findFirst({
      where: {
        workflowId,
        targetType,
        targetId: targetType === 'ALL' ? null : targetId,
      },
    })

    if (existingPermission) {
      // 更新现有权限
      const updatedPermission = await prisma.workflowPermission.update({
        where: { id: existingPermission.id },
        data: { permission },
        include: {
          department: {
            select: { id: true, name: true },
          },
        },
      })
      await invalidateWorkflowPermissionCache(workflowId)
      return ApiResponse.success({ permission: updatedPermission })
    }

    // 创建新权限
    const newPermission = await prisma.workflowPermission.create({
      data: {
        workflowId,
        targetType,
        targetId: targetType === 'ALL' ? null : targetId,
        departmentId: targetType === 'DEPARTMENT' ? targetId : null,
        permission,
        createdById: session.user.id,
      },
      include: {
        department: {
          select: { id: true, name: true },
        },
      },
    })

    await invalidateWorkflowPermissionCache(workflowId)
    return ApiResponse.created({ permission: newPermission })
  } catch (error) {
    console.error('Failed to create workflow permission:', error)
    return ApiResponse.error('添加权限失败', 500)
  }
}

// DELETE: 删除工作流权限
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: workflowId } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const { searchParams } = new URL(request.url)
    const permissionId = searchParams.get('permissionId')

    if (!permissionId) {
      return ApiResponse.error('请指定权限ID', 400)
    }

    // 检查工作流是否存在
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    // 只有 OWNER、ADMIN 或工作流创建者可以删除权限
    const canManagePermissions =
      session.user.role === 'OWNER' ||
      session.user.role === 'ADMIN' ||
      workflow.creatorId === session.user.id

    if (!canManagePermissions) {
      return ApiResponse.error('权限不足', 403)
    }

    // 检查权限是否存在
    const permission = await prisma.workflowPermission.findFirst({
      where: {
        id: permissionId,
        workflowId,
      },
    })

    if (!permission) {
      return ApiResponse.error('权限不存在', 404)
    }

    await prisma.workflowPermission.delete({
      where: { id: permissionId },
    })

    await invalidateWorkflowPermissionCache(workflowId)
    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete workflow permission:', error)
    return ApiResponse.error('删除权限失败', 500)
  }
}
