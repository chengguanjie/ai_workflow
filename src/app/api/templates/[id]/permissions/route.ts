import { NextResponse } from 'next/server'
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

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET: 获取模板权限列表
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      return NextResponse.json({ error: '模板不存在或不支持权限管理' }, { status: 404 })
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

    return NextResponse.json({
      data: permissions,
      currentUserPermission: userPermission.permission,
      canManage: userPermission.permission === 'MANAGER',
    })
  } catch (error) {
    console.error('Failed to get template permissions:', error)
    return NextResponse.json({ error: '获取权限列表失败' }, { status: 500 })
  }
}

// POST: 添加/更新权限
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 检查用户是否有管理权限
    const canManage = await canManagePermission(session.user.id, 'TEMPLATE', id)
    if (!canManage) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
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
      return NextResponse.json({ error: '模板不存在或不支持权限管理' }, { status: 404 })
    }

    const body = await request.json()
    const { targetType, targetId, permission } = body as {
      targetType: PermissionTargetType
      targetId: string | null
      permission: ResourcePermission
    }

    // 验证参数
    if (!targetType || !permission) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    if (!['USER', 'DEPARTMENT', 'ALL'].includes(targetType)) {
      return NextResponse.json({ error: '无效的目标类型' }, { status: 400 })
    }

    if (!['VIEWER', 'EDITOR', 'MANAGER'].includes(permission)) {
      return NextResponse.json({ error: '无效的权限级别' }, { status: 400 })
    }

    if (targetType !== 'ALL' && !targetId) {
      return NextResponse.json({ error: '缺少目标 ID' }, { status: 400 })
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
        return NextResponse.json({ error: '用户不存在' }, { status: 400 })
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
        return NextResponse.json({ error: '部门不存在' }, { status: 400 })
      }
    }

    // 设置权限
    await setResourcePermission(
      'TEMPLATE',
      id,
      targetType,
      targetType === 'ALL' ? null : targetId,
      permission,
      session.user.id
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set template permission:', error)
    return NextResponse.json({ error: '设置权限失败' }, { status: 500 })
  }
}

// DELETE: 删除权限
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 检查用户是否有管理权限
    const canManage = await canManagePermission(session.user.id, 'TEMPLATE', id)
    if (!canManage) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { targetType, targetId } = body as {
      targetType: PermissionTargetType
      targetId: string | null
    }

    if (!targetType) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    // 删除权限
    await removeResourcePermission(
      'TEMPLATE',
      id,
      targetType,
      targetType === 'ALL' ? null : targetId
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete template permission:', error)
    return NextResponse.json({ error: '删除权限失败' }, { status: 500 })
  }
}
