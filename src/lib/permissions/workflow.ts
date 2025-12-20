import { prisma } from '@/lib/db'
import { PermissionLevel, PermissionTargetType } from '@prisma/client'

/**
 * 权限级别优先级（数字越大权限越高）
 */
const PERMISSION_PRIORITY: Record<PermissionLevel, number> = {
  VIEW: 1,
  USE: 2,
  EDIT: 3,
}

/**
 * 检查用户对工作流的权限
 */
export async function checkWorkflowPermission(
  userId: string,
  workflowId: string,
  requiredPermission: PermissionLevel
): Promise<boolean> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      organizationId: true,
      departmentId: true,
    },
  })

  if (!user) return false

  // 获取工作流信息
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: {
      id: true,
      organizationId: true,
      creatorId: true,
    },
  })

  if (!workflow) return false

  // 工作流必须属于同一组织
  if (workflow.organizationId !== user.organizationId) return false

  // OWNER 和 ADMIN 拥有所有权限
  if (user.role === 'OWNER' || user.role === 'ADMIN') return true

  // 创建者拥有所有权限
  if (workflow.creatorId === userId) return true

  // 获取工作流的所有权限设置
  const permissions = await prisma.workflowPermission.findMany({
    where: { workflowId },
  })

  // 如果没有任何权限设置，默认组织内所有人都可以使用
  if (permissions.length === 0) {
    // 没有权限设置时，EDITOR 可以编辑，其他人可以使用
    if (user.role === 'EDITOR' && requiredPermission === 'EDIT') return true
    if (requiredPermission === 'VIEW' || requiredPermission === 'USE') return true
    return false
  }

  // 收集用户的所有适用权限
  const applicablePermissions: PermissionLevel[] = []

  for (const perm of permissions) {
    let applies = false

    switch (perm.targetType) {
      case PermissionTargetType.ALL:
        applies = true
        break
      case PermissionTargetType.USER:
        applies = perm.targetId === userId
        break
      case PermissionTargetType.DEPARTMENT:
        applies = perm.targetId === user.departmentId
        break
    }

    if (applies) {
      applicablePermissions.push(perm.permission)
    }
  }

  // 如果没有适用的权限，则无权访问
  if (applicablePermissions.length === 0) return false

  // 获取最高权限级别
  const maxPermission = applicablePermissions.reduce((max, current) =>
    PERMISSION_PRIORITY[current] > PERMISSION_PRIORITY[max] ? current : max
  )

  // 检查是否满足要求的权限级别
  return PERMISSION_PRIORITY[maxPermission] >= PERMISSION_PRIORITY[requiredPermission]
}

/**
 * 获取用户对工作流的最高权限级别
 */
export async function getWorkflowPermissionLevel(
  userId: string,
  workflowId: string
): Promise<PermissionLevel | null> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      organizationId: true,
      departmentId: true,
    },
  })

  if (!user) return null

  // 获取工作流信息
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: {
      id: true,
      organizationId: true,
      creatorId: true,
    },
  })

  if (!workflow) return null

  // 工作流必须属于同一组织
  if (workflow.organizationId !== user.organizationId) return null

  // OWNER、ADMIN 和创建者拥有 EDIT 权限
  if (user.role === 'OWNER' || user.role === 'ADMIN' || workflow.creatorId === userId) {
    return 'EDIT'
  }

  // 获取工作流的所有权限设置
  const permissions = await prisma.workflowPermission.findMany({
    where: { workflowId },
  })

  // 如果没有任何权限设置
  if (permissions.length === 0) {
    if (user.role === 'EDITOR') return 'EDIT'
    if (user.role === 'MEMBER') return 'USE'
    if (user.role === 'VIEWER') return 'VIEW'
    return null
  }

  // 收集用户的所有适用权限
  const applicablePermissions: PermissionLevel[] = []

  for (const perm of permissions) {
    let applies = false

    switch (perm.targetType) {
      case PermissionTargetType.ALL:
        applies = true
        break
      case PermissionTargetType.USER:
        applies = perm.targetId === userId
        break
      case PermissionTargetType.DEPARTMENT:
        applies = perm.targetId === user.departmentId
        break
    }

    if (applies) {
      applicablePermissions.push(perm.permission)
    }
  }

  if (applicablePermissions.length === 0) return null

  // 返回最高权限级别
  return applicablePermissions.reduce((max, current) =>
    PERMISSION_PRIORITY[current] > PERMISSION_PRIORITY[max] ? current : max
  )
}

/**
 * 获取用户可访问的所有工作流ID列表（用于列表查询优化）
 */
export async function getAccessibleWorkflowIds(
  userId: string,
  organizationId: string,
  requiredPermission: PermissionLevel = 'VIEW'
): Promise<string[] | 'all'> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      departmentId: true,
    },
  })

  if (!user) return []

  // OWNER 和 ADMIN 可以访问所有工作流
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return 'all'
  }

  // 获取用户创建的工作流
  const createdWorkflows = await prisma.workflow.findMany({
    where: {
      organizationId,
      creatorId: userId,
      deletedAt: null,
    },
    select: { id: true },
  })

  const createdIds = createdWorkflows.map((w) => w.id)

  // 获取有权限设置的工作流
  const workflowsWithPermissions = await prisma.workflow.findMany({
    where: {
      organizationId,
      deletedAt: null,
      permissions: { some: {} },
    },
    select: {
      id: true,
      permissions: true,
    },
  })

  // 筛选有权限的工作流
  const permittedIds: string[] = []
  for (const workflow of workflowsWithPermissions) {
    for (const perm of workflow.permissions) {
      let applies = false

      switch (perm.targetType) {
        case PermissionTargetType.ALL:
          applies = true
          break
        case PermissionTargetType.USER:
          applies = perm.targetId === userId
          break
        case PermissionTargetType.DEPARTMENT:
          applies = perm.targetId === user.departmentId
          break
      }

      if (applies && PERMISSION_PRIORITY[perm.permission] >= PERMISSION_PRIORITY[requiredPermission]) {
        permittedIds.push(workflow.id)
        break
      }
    }
  }

  // 获取没有任何权限设置的工作流（默认可访问）
  const workflowsWithoutPermissions = await prisma.workflow.findMany({
    where: {
      organizationId,
      deletedAt: null,
      permissions: { none: {} },
    },
    select: { id: true },
  })

  // 根据角色确定默认权限
  let defaultAccessIds: string[] = []
  const noPermIds = workflowsWithoutPermissions.map((w) => w.id)

  if (user.role === 'EDITOR') {
    // EDITOR 默认有 EDIT 权限
    defaultAccessIds = noPermIds
  } else if (user.role === 'MEMBER') {
    // MEMBER 默认有 USE 权限
    if (requiredPermission === 'VIEW' || requiredPermission === 'USE') {
      defaultAccessIds = noPermIds
    }
  } else if (user.role === 'VIEWER') {
    // VIEWER 默认有 VIEW 权限
    if (requiredPermission === 'VIEW') {
      defaultAccessIds = noPermIds
    }
  }

  // 合并所有可访问的工作流ID
  const allAccessibleIds = [...new Set([...createdIds, ...permittedIds, ...defaultAccessIds])]
  return allAccessibleIds
}
