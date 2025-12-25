import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  checkResourcePermission,
  getResourcePermissions,
  setResourcePermission,
  removeResourcePermission,
  canManagePermission,
} from '@/lib/permissions/resource'
import { ResourcePermission, PermissionTargetType } from '@prisma/client'
import { ApiResponse } from '@/lib/api/api-response'
import { logPermissionChange } from '@/lib/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET: 获取模板权限列表
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查模板是否存在
    const template = await prisma.workflowTemplate.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        templateType: 'INTERNAL', // 只有内部模板支持权限管理
      },
    })

    if (!template) {
      return ApiResponse.error('模板不存在或不支持权限管理', 404)
    }

    // 获取权限列表
    const permissions = await getResourcePermissions('TEMPLATE', id)

    // 获取当前用户对该模板的权限
    const userPermission = await checkResourcePermission(
      session.user.id,
      'TEMPLATE',
      id,
      'VIEWER'
    )

    return ApiResponse.success({
      data: permissions,
      currentUserPermission: userPermission.permission,
      canManage: userPermission.permission === 'MANAGER',
    })
  } catch (error) {
    console.error('Failed to get template permissions:', error)
    return ApiResponse.error('获取权限列表失败', 500)
  }
}

// POST: 添加/更新权限
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查用户是否有管理权限
    const canManage = await canManagePermission(session.user.id, 'TEMPLATE', id)
    if (!canManage) {
      return ApiResponse.error('权限不足', 403)
    }

    // 检查模板类型
    const template = await prisma.workflowTemplate.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        templateType: 'INTERNAL',
      },
    })

    if (!template) {
      return ApiResponse.error('模板不存在或不支持权限管理', 404)
    }

    const body = await request.json()
    const { targetType, targetId, permission } = body as {
      targetType: PermissionTargetType
      targetId: string | null
      permission: ResourcePermission
    }

    // 验证参数
    if (!targetType || !permission) {
      return ApiResponse.error('缺少必要参数', 400)
    }

    if (!['USER', 'DEPARTMENT', 'ALL'].includes(targetType)) {
      return ApiResponse.error('无效的目标类型', 400)
    }

    if (!['VIEWER', 'EDITOR', 'MANAGER'].includes(permission)) {
      return ApiResponse.error('无效的权限级别', 400)
    }

    if (targetType !== 'ALL' && !targetId) {
      return ApiResponse.error('缺少目标 ID', 400)
    }

    // 验证目标是否存在
    if (targetType === 'USER' && targetId) {
      const user = await prisma.user.findFirst({
        where: {
          id: targetId,
          organizationId: session.user.organizationId,
        },
      })
      if (!user) {
        return ApiResponse.error('用户不存在', 400)
      }
    }

    if (targetType === 'DEPARTMENT' && targetId) {
      const dept = await prisma.department.findFirst({
        where: {
          id: targetId,
          organizationId: session.user.organizationId,
        },
      })
      if (!dept) {
        return ApiResponse.error('部门不存在', 400)
      }
    }

    // 检查是否已存在权限（用于判断是添加还是更新）
    const existingPermission = await prisma.templatePermission.findFirst({
      where: {
        templateId: id,
        targetType,
        targetId: targetType === 'ALL' ? null : targetId,
      },
    })

    // 设置权限
    await setResourcePermission(
      'TEMPLATE',
      id,
      targetType,
      targetType === 'ALL' ? null : targetId,
      permission,
      session.user.id
    )

    // 获取目标名称用于审计日志
    let targetName: string | undefined
    if (targetType === 'USER' && targetId) {
      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { name: true, email: true },
      })
      targetName = user?.name || user?.email || undefined
    } else if (targetType === 'DEPARTMENT' && targetId) {
      const dept = await prisma.department.findUnique({
        where: { id: targetId },
        select: { name: true },
      })
      targetName = dept?.name || undefined
    }

    // 记录审计日志
    await logPermissionChange(
      session.user.id,
      session.user.organizationId,
      existingPermission ? 'updated' : 'added',
      {
        resourceType: 'TEMPLATE',
        resourceId: id,
        resourceName: template.name,
        targetType,
        targetId: targetType === 'ALL' ? null : targetId,
        targetName,
        oldPermission: existingPermission?.permission || null,
        newPermission: permission,
      }
    )

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to set template permission:', error)
    return ApiResponse.error('设置权限失败', 500)
  }
}

// DELETE: 删除权限
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查用户是否有管理权限
    const canManage = await canManagePermission(session.user.id, 'TEMPLATE', id)
    if (!canManage) {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const { targetType, targetId } = body as {
      targetType: PermissionTargetType
      targetId: string | null
    }

    if (!targetType) {
      return ApiResponse.error('缺少必要参数', 400)
    }

    // 获取现有权限用于审计日志
    const existingPermission = await prisma.templatePermission.findFirst({
      where: {
        templateId: id,
        targetType,
        targetId: targetType === 'ALL' ? null : targetId,
      },
    })

    // 获取模板名称
    const template = await prisma.workflowTemplate.findUnique({
      where: { id },
      select: { name: true },
    })

    // 获取目标名称用于审计日志
    let targetName: string | undefined
    if (targetType === 'USER' && targetId) {
      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { name: true, email: true },
      })
      targetName = user?.name || user?.email || undefined
    } else if (targetType === 'DEPARTMENT' && targetId) {
      const dept = await prisma.department.findUnique({
        where: { id: targetId },
        select: { name: true },
      })
      targetName = dept?.name || undefined
    }

    // 删除权限
    await removeResourcePermission(
      'TEMPLATE',
      id,
      targetType,
      targetType === 'ALL' ? null : targetId
    )

    // 记录审计日志
    if (existingPermission) {
      await logPermissionChange(
        session.user.id,
        session.user.organizationId,
        'removed',
        {
          resourceType: 'TEMPLATE',
          resourceId: id,
          resourceName: template?.name,
          targetType,
          targetId: targetType === 'ALL' ? null : targetId,
          targetName,
          oldPermission: existingPermission.permission,
          newPermission: null,
        }
      )
    }

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete template permission:', error)
    return ApiResponse.error('删除权限失败', 500)
  }
}
