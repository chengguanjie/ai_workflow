import { prisma } from '@/lib/db'
import { getRedisConnection } from '@/lib/redis'
import { ResourcePermission, PermissionTargetType, Role } from '@prisma/client'

const PERMISSION_PRIORITY: Record<ResourcePermission, number> = {
  VIEWER: 1,
  EDITOR: 2,
  MANAGER: 3,
}

// 缓存配置
// Requirements 2.5: 设置权限缓存的TTL为5分钟
const KB_PERMISSION_CACHE_TTL = 300 // 5 分钟

/**
 * 生成缓存键
 * 格式: kb:permission:{knowledgeBaseId}:{userId}
 * 这种格式便于按知识库ID批量删除缓存
 */
function getCacheKey(knowledgeBaseId: string, userId: string): string {
  return `kb:permission:${knowledgeBaseId}:${userId}`
}

/**
 * 生成缓存模式（用于批量删除）
 * 格式: kb:permission:{knowledgeBaseId}:*
 */
function getCachePatternByKB(knowledgeBaseId: string): string {
  return `kb:permission:${knowledgeBaseId}:*`
}

/**
 * 从缓存获取权限
 * Requirements 2.1: 首先检查Redis缓存
 * Requirements 2.2: 缓存命中时直接返回缓存的权限结果
 */
async function getPermissionFromCache(
  userId: string,
  knowledgeBaseId: string
): Promise<ResourcePermission | null | undefined> {
  const redis = getRedisConnection()
  if (!redis) return undefined

  try {
    const cached = await redis.get(getCacheKey(knowledgeBaseId, userId))
    if (cached === null) return undefined // 缓存未命中
    if (cached === 'null') return null // 缓存了"无权限"的结果
    return cached as ResourcePermission
  } catch (error) {
    console.error('[知识库权限] Redis 读取失败:', error)
    return undefined // 缓存失败时降级到数据库查询
  }
}

/**
 * 设置权限缓存
 * Requirements 2.3: 缓存未命中时查询数据库并将结果存入缓存
 * Requirements 2.5: 设置权限缓存的TTL为5分钟
 */
async function setPermissionToCache(
  userId: string,
  knowledgeBaseId: string,
  permission: ResourcePermission | null
): Promise<void> {
  const redis = getRedisConnection()
  if (!redis) return

  try {
    const value = permission === null ? 'null' : permission
    await redis.setex(getCacheKey(knowledgeBaseId, userId), KB_PERMISSION_CACHE_TTL, value)
  } catch (error) {
    console.error('[知识库权限] Redis 写入失败:', error)
    // 缓存写入失败不影响业务
  }
}

/**
 * 清除知识库权限缓存
 * Requirements 2.4: 当知识库权限被修改时清除该知识库相关的所有权限缓存
 * 
 * 使用 SCAN 命令替代 KEYS，避免阻塞 Redis
 * @param knowledgeBaseId 知识库ID
 */
export async function invalidateKnowledgeBasePermissionCache(
  knowledgeBaseId: string
): Promise<void> {
  const redis = getRedisConnection()
  if (!redis) return

  try {
    const pattern = getCachePatternByKB(knowledgeBaseId)
    let cursor = '0'
    let deletedCount = 0

    // 使用 SCAN 迭代删除，避免 KEYS 命令阻塞
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor

      if (keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== '0')

    if (deletedCount > 0) {
      console.log(`[知识库权限] 已清除 ${deletedCount} 条缓存 (knowledgeBaseId: ${knowledgeBaseId})`)
    }
  } catch (error) {
    console.error('[知识库权限] Redis 清除缓存失败:', error)
    // 缓存清除失败不影响业务，但可能导致短暂的权限不一致
  }
}

/**
 * 清除权限缓存 (别名，保持向后兼容)
 * @deprecated 请使用 invalidateKnowledgeBasePermissionCache
 */
export async function clearKnowledgeBasePermissionCache(
  knowledgeBaseId: string
): Promise<void> {
  return invalidateKnowledgeBasePermissionCache(knowledgeBaseId)
}

/**
 * 检查用户对知识库的权限（带缓存）
 * 
 * Requirements 2.1, 2.2, 2.3: 实现带缓存的权限检查
 * 
 * @param userId 用户ID
 * @param knowledgeBaseId 知识库ID
 * @param requiredPermission 所需的最低权限级别
 * @returns 是否具有所需权限
 */
export async function checkKnowledgeBasePermission(
  userId: string,
  knowledgeBaseId: string,
  requiredPermission: ResourcePermission
): Promise<boolean> {
  const userLevel = await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)

  if (!userLevel) return false

  return PERMISSION_PRIORITY[userLevel] >= PERMISSION_PRIORITY[requiredPermission]
}

/**
 * 获取用户对知识库的权限级别（带缓存）
 * 
 * Requirements 2.1: 首先检查Redis缓存
 * Requirements 2.2: 缓存命中时直接返回缓存的权限结果，不查询数据库
 * Requirements 2.3: 缓存未命中时查询数据库并将结果存入缓存
 * 
 * @param userId 用户ID
 * @param knowledgeBaseId 知识库ID
 * @returns 用户的权限级别，无权限时返回null
 */
export async function getKnowledgeBasePermissionLevel(
  userId: string,
  knowledgeBaseId: string
): Promise<ResourcePermission | null> {
  // Requirements 2.1: 首先检查Redis缓存
  const cached = await getPermissionFromCache(userId, knowledgeBaseId)
  if (cached !== undefined) {
    // Requirements 2.2: 缓存命中时直接返回
    return cached
  }

  // Requirements 2.3: 缓存未命中，从数据库查询
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      organizationId: true,
      departmentId: true,
    },
  })

  if (!user) {
    await setPermissionToCache(userId, knowledgeBaseId, null)
    return null
  }

  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: {
      id: true,
      organizationId: true,
      creatorId: true,
    },
  })

  if (!knowledgeBase) {
    await setPermissionToCache(userId, knowledgeBaseId, null)
    return null
  }

  if (knowledgeBase.organizationId !== user.organizationId) {
    await setPermissionToCache(userId, knowledgeBaseId, null)
    return null
  }

  if (user.role === Role.OWNER || user.role === Role.ADMIN) {
    await setPermissionToCache(userId, knowledgeBaseId, 'MANAGER')
    return 'MANAGER'
  }

  if (knowledgeBase.creatorId === userId) {
    await setPermissionToCache(userId, knowledgeBaseId, 'MANAGER')
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

  // 缓存结果
  await setPermissionToCache(userId, knowledgeBaseId, highestPermission)

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
