import { prisma } from '@/lib/db'
import { ResourcePermission, PermissionTargetType, Role } from '@prisma/client'

const PERMISSION_PRIORITY: Record<ResourcePermission, number> = {
  VIEWER: 1,
  EDITOR: 2,
  MANAGER: 3,
}

export async function checkKnowledgeBasePermission(
  userId: string,
  knowledgeBaseId: string,
  requiredPermission: ResourcePermission
): Promise<boolean> {
  const userLevel = await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)

  if (!userLevel) return false

  return PERMISSION_PRIORITY[userLevel] >= PERMISSION_PRIORITY[requiredPermission]
}

export async function getKnowledgeBasePermissionLevel(
  userId: string,
  knowledgeBaseId: string
): Promise<ResourcePermission | null> {
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

  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: {
      id: true,
      organizationId: true,
      creatorId: true,
    },
  })

  if (!knowledgeBase) return null
  if (knowledgeBase.organizationId !== user.organizationId) return null

  if (user.role === Role.OWNER || user.role === Role.ADMIN) {
    return 'MANAGER'
  }

  if (knowledgeBase.creatorId === userId) {
    return 'MANAGER'
  }

  const permissions = await prisma.knowledgeBasePermission.findMany({
    where: { knowledgeBaseId },
    select: {
      permission: true,
      targetType: true,
      targetId: true,
      departmentId: true,
    },
  })

  let highestPermission: ResourcePermission | null = null

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
        applies = user.departmentId !== null && perm.departmentId === user.departmentId
        break
    }

    if (applies) {
      if (!highestPermission || PERMISSION_PRIORITY[perm.permission] > PERMISSION_PRIORITY[highestPermission]) {
        highestPermission = perm.permission
      }
    }
  }

  return highestPermission
}

export async function getAccessibleKnowledgeBaseIds(
  userId: string,
  organizationId: string,
  requiredPermission: ResourcePermission = 'VIEWER'
): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      departmentId: true,
    },
  })

  if (!user) return []

  if (user.role === Role.OWNER || user.role === Role.ADMIN) {
    const kbs = await prisma.knowledgeBase.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    })
    return kbs.map(kb => kb.id)
  }

  const ownedKbs = await prisma.knowledgeBase.findMany({
    where: {
      organizationId,
      creatorId: userId,
      isActive: true,
    },
    select: { id: true },
  })

  const permissionWhere: Array<Record<string, unknown>> = [
    { targetType: PermissionTargetType.ALL },
    { targetType: PermissionTargetType.USER, targetId: userId },
  ]

  if (user.departmentId) {
    permissionWhere.push({
      targetType: PermissionTargetType.DEPARTMENT,
      departmentId: user.departmentId,
    })
  }

  const permissions = await prisma.knowledgeBasePermission.findMany({
    where: {
      knowledgeBase: {
        organizationId,
        isActive: true,
      },
      OR: permissionWhere,
    },
    select: {
      knowledgeBaseId: true,
      permission: true,
    },
  })

  const permittedIds = permissions
    .filter(p => PERMISSION_PRIORITY[p.permission] >= PERMISSION_PRIORITY[requiredPermission])
    .map(p => p.knowledgeBaseId)

  const allIds = new Set([
    ...ownedKbs.map(kb => kb.id),
    ...permittedIds,
  ])

  return Array.from(allIds)
}
