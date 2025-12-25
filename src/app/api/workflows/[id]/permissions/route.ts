import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PermissionLevel, PermissionTargetType } from '@prisma/client'
import { invalidateWorkflowPermissionCache } from '@/lib/permissions/workflow'
import { ApiResponse } from '@/lib/api/api-response'
import { logPermissionChange } from '@/lib/audit'
import {
  checkResourcePermission,
  getResourcePermissions,
  canManagePermission,
} from '@/lib/permissions/resource'

// GET: 获取工作流权限列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: workflowId } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
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

    // 获取权限列表（使用统一的资源权限服务）
    const permissions = await getResourcePermissions('WORKFLOW', workflowId)

    // 获取当前用户对该工作流的权限
    const userPermission = await checkResourcePermission(
      session.user.id,
      'WORKFLOW',
      workflowId,
      'VIEWER'
    )

    return ApiResponse.success({
      data: permissions,
      currentUserPermission: userPermission.permission,
      canManage: userPermission.permission === 'MANAGER',
    })
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

    if (!session?.user?.id || !session?.user?.organizationId) {
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

    // 使用统一的权限检查服务
    const canManage = await canManagePermission(session.user.id, 'WORKFLOW', workflowId)
    if (!canManage) {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const { targetType, targetId, permission } = body

    // 验证参数
    if (!Object.values(PermissionTargetType).includes(targetType as PermissionTargetType)) {
      return ApiResponse.error('无效的目标类型', 400)
    }

    if (!Object.values(PermissionLevel).includes(permission as PermissionLevel)) {
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

      // 获取目标名称用于审计日志
      let targetName: string | undefined
      if (targetType === 'USER' && targetId) {
        const user = await prisma.user.findUnique({
          where: { id: targetId },
          select: { name: true, email: true },
        })
        targetName = user?.name || user?.email || undefined
      } else if (targetType === 'DEPARTMENT' && targetId) {
        targetName = updatedPermission.department?.name || undefined
      }

      // 记录审计日志
      await logPermissionChange(
        session.user.id,
        session.user.organizationId,
        'updated',
        {
          resourceType: 'WORKFLOW',
          resourceId: workflowId,
          resourceName: workflow.name,
          targetType,
          targetId: targetType === 'ALL' ? null : targetId,
          targetName,
          oldPermission: existingPermission.permission,
          newPermission: permission,
        }
      )

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

    // 获取目标名称用于审计日志
    let targetName: string | undefined
    if (targetType === 'USER' && targetId) {
      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { name: true, email: true },
      })
      targetName = user?.name || user?.email || undefined
    } else if (targetType === 'DEPARTMENT' && targetId) {
      targetName = newPermission.department?.name || undefined
    }

    // 记录审计日志
    await logPermissionChange(
      session.user.id,
      session.user.organizationId,
      'added',
      {
        resourceType: 'WORKFLOW',
        resourceId: workflowId,
        resourceName: workflow.name,
        targetType,
        targetId: targetType === 'ALL' ? null : targetId,
        targetName,
        oldPermission: null,
        newPermission: permission,
      }
    )

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

    if (!session?.user?.id || !session?.user?.organizationId) {
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

    // 使用统一的权限检查服务
    const canManage = await canManagePermission(session.user.id, 'WORKFLOW', workflowId)
    if (!canManage) {
      return ApiResponse.error('权限不足', 403)
    }

    // 检查权限是否存在
    const permission = await prisma.workflowPermission.findFirst({
      where: {
        id: permissionId,
        workflowId,
      },
      include: {
        department: {
          select: { name: true },
        },
      },
    })

    if (!permission) {
      return ApiResponse.error('权限不存在', 404)
    }

    // 获取目标名称用于审计日志
    let targetName: string | undefined
    if (permission.targetType === 'USER' && permission.targetId) {
      const user = await prisma.user.findUnique({
        where: { id: permission.targetId },
        select: { name: true, email: true },
      })
      targetName = user?.name || user?.email || undefined
    } else if (permission.targetType === 'DEPARTMENT') {
      targetName = permission.department?.name || undefined
    }

    await prisma.workflowPermission.delete({
      where: { id: permissionId },
    })

    await invalidateWorkflowPermissionCache(workflowId)

    // 记录审计日志
    await logPermissionChange(
      session.user.id,
      session.user.organizationId,
      'removed',
      {
        resourceType: 'WORKFLOW',
        resourceId: workflowId,
        resourceName: workflow.name,
        targetType: permission.targetType,
        targetId: permission.targetId,
        targetName,
        oldPermission: permission.permission,
        newPermission: null,
      }
    )

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete workflow permission:', error)
    return ApiResponse.error('删除权限失败', 500)
  }
}
