import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PermissionLevel, PermissionTargetType } from '@prisma/client'
import { invalidateWorkflowPermissionCache, getWorkflowPermissionLevel } from '@/lib/permissions/workflow'
import { ApiResponse } from '@/lib/api/api-response'
import { logPermissionChange } from '@/lib/audit'

type PermissionDto = {
  id: string
  permission: PermissionLevel
  targetType: PermissionTargetType
  targetId: string | null
  department?: { id: string; name: string } | null
  user?: { id: string; name: string | null; email: string; avatar: string | null } | null
}

function canManageWorkflowPermissions(sessionUser: {
  id: string
  role: string
}, workflow: { creatorId: string | null }) {
  return sessionUser.role === 'OWNER' || sessionUser.role === 'ADMIN' || workflow.creatorId === sessionUser.id
}

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

    const canManage = canManageWorkflowPermissions(session.user, workflow)
    if (!canManage) {
      return ApiResponse.error('权限不足', 403)
    }

    const permissions = await prisma.workflowPermission.findMany({
      where: { workflowId },
      include: {
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const userIds = permissions
      .filter(p => p.targetType === 'USER' && p.targetId)
      .map(p => p.targetId!) 
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, avatar: true },
        })
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    const dtos: PermissionDto[] = permissions.map(p => ({
      id: p.id,
      permission: p.permission,
      targetType: p.targetType,
      targetId: p.targetId,
      department: p.targetType === 'DEPARTMENT' ? p.department : null,
      user: p.targetType === 'USER' && p.targetId ? userMap.get(p.targetId) || null : null,
    }))

    const currentUserPermission = await getWorkflowPermissionLevel(session.user.id, workflowId)

    return ApiResponse.success({
      permissions: dtos,
      currentUserPermission,
      canManage: true,
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

    if (!canManageWorkflowPermissions(session.user, workflow)) {
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

    if (!canManageWorkflowPermissions(session.user, workflow)) {
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

    return ApiResponse.success({ deleted: true })
  } catch (error) {
    console.error('Failed to delete workflow permission:', error)
    return ApiResponse.error('删除权限失败', 500)
  }
}
