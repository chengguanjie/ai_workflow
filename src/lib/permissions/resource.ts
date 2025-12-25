import { prisma } from '@/lib/db'
import {
  ResourcePermission,
  PermissionTargetType,
  Role,
} from '@prisma/client'
import {
  isUpperDepartment,
  isDepartmentManager,
  isSupervisor,
} from './department'

/**
 * 统一资源权限检查服务
 * 支持工作流、知识库、模板三种资源类型
 */

export type ResourceType = 'WORKFLOW' | 'KNOWLEDGE_BASE' | 'TEMPLATE'

/**
 * 权限级别优先级（数字越大权限越高）
 */
export const PERMISSION_PRIORITY: Record<ResourcePermission, number> = {
  VIEWER: 1,
  EDITOR: 2,
  MANAGER: 3,
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean
  permission: ResourcePermission | null
  reason?: string
}

/**
 * 权限列表项（用于 UI 展示）
 */
export interface PermissionListItem {
  id: string
  targetType: PermissionTargetType
  targetId: string | null
  targetName: string
  permission: ResourcePermission
  createdAt: Date
  createdBy: {
    id: string
    name: string | null
  }
}

/**
 * 获取资源信息的通用接口
 */
interface ResourceInfo {
  id: string
  organizationId: string | null
  creatorId: string | null
  creatorDepartmentId?: string | null
}

/**
 * 获取资源信息
 */
async function getResourceInfo(
  resourceType: ResourceType,
  resourceId: string
): Promise<ResourceInfo | null> {
  switch (resourceType) {
    case 'WORKFLOW': {
      const workflow = await prisma.workflow.findUnique({
        where: { id: resourceId },
        select: {
          id: true,
          organizationId: true,
          creatorId: true,
          creator: {
            select: { departmentId: true },
          },
        },
      })
      if (!workflow) return null
      return {
        id: workflow.id,
        organizationId: workflow.organizationId,
        creatorId: workflow.creatorId,
        creatorDepartmentId: workflow.creator.departmentId,
      }
    }
    case 'KNOWLEDGE_BASE': {
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: resourceId },
        select: {
          id: true,
          organizationId: true,
          creatorId: true,
        },
      })
      if (!kb) return null
      // 获取创建者部门
      let creatorDepartmentId: string | null = null
      if (kb.creatorId) {
        const creator = await prisma.user.findUnique({
          where: { id: kb.creatorId },
          select: { departmentId: true },
        })
        creatorDepartmentId = creator?.departmentId || null
      }
      return {
        id: kb.id,
        organizationId: kb.organizationId,
        creatorId: kb.creatorId,
        creatorDepartmentId,
      }
    }
    case 'TEMPLATE': {
      const template = await prisma.workflowTemplate.findUnique({
        where: { id: resourceId },
        select: {
          id: true,
          organizationId: true,
          creatorId: true,
          creatorDepartmentId: true,
          isOfficial: true,
          templateType: true,
        },
      })
      if (!template) return null
      return {
        id: template.id,
        organizationId: template.organizationId,
        creatorId: template.creatorId,
        creatorDepartmentId: template.creatorDepartmentId,
      }
    }
  }
}

/**
 * 获取资源的权限设置
 */
async function getResourcePermissionSettings(
  resourceType: ResourceType,
  resourceId: string
): Promise<Array<{
  id: string
  permission: ResourcePermission
  targetType: PermissionTargetType
  targetId: string | null
  departmentId: string | null
  createdById: string
  createdAt: Date
}>> {
  switch (resourceType) {
    case 'WORKFLOW': {
      const permissions = await prisma.workflowPermission.findMany({
        where: { workflowId: resourceId },
      })
      // 兼容旧的 PermissionLevel 枚举，转换为新的 ResourcePermission
      return permissions.map((p) => ({
        id: p.id,
        permission: convertToResourcePermission(p.permission as unknown as string),
        targetType: p.targetType,
        targetId: p.targetId,
        departmentId: p.departmentId,
        createdById: p.createdById,
        createdAt: p.createdAt,
      }))
    }
    case 'KNOWLEDGE_BASE': {
      return await prisma.knowledgeBasePermission.findMany({
        where: { knowledgeBaseId: resourceId },
      })
    }
    case 'TEMPLATE': {
      const permissions = await prisma.templatePermission.findMany({
        where: { templateId: resourceId },
      })
      return permissions.map((p) => ({
        id: p.id,
        permission: p.permission,
        targetType: p.targetType,
        targetId: p.targetId,
        departmentId: p.targetType === 'DEPARTMENT' ? p.targetId : null,
        createdById: p.createdById,
        createdAt: p.createdAt,
      }))
    }
  }
}

/**
 * 兼容旧权限枚举的转换函数
 */
function convertToResourcePermission(permission: string): ResourcePermission {
  switch (permission) {
    case 'VIEW':
    case 'USE':
    case 'VIEWER':
      return 'VIEWER'
    case 'EDIT':
    case 'EDITOR':
      return 'EDITOR'
    case 'MANAGER':
      return 'MANAGER'
    default:
      return 'VIEWER'
  }
}

/**
 * 检查用户对资源的权限
 */
export async function checkResourcePermission(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  requiredPermission: ResourcePermission
): Promise<PermissionCheckResult> {
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

  if (!user) {
    return { allowed: false, permission: null, reason: '用户不存在' }
  }

  // 获取资源信息
  const resource = await getResourceInfo(resourceType, resourceId)
  if (!resource) {
    return { allowed: false, permission: null, reason: '资源不存在' }
  }

  // 1. 企业隔离检查（模板可能是公域的，organizationId 为 null）
  if (resource.organizationId && resource.organizationId !== user.organizationId) {
    return { allowed: false, permission: null, reason: '跨企业访问被拒绝' }
  }

  // 2. 超级权限检查：OWNER 和 ADMIN 拥有所有权限
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return { allowed: true, permission: 'MANAGER', reason: '企业管理员' }
  }

  // 3. 创建者检查：创建者拥有管理者权限
  if (resource.creatorId === userId) {
    return { allowed: true, permission: 'MANAGER', reason: '资源创建者' }
  }

  // 4. 直属/间接领导检查：对下属资源有管理权限
  if (resource.creatorId && await isSupervisor(userId, resource.creatorId)) {
    const hasPermission = PERMISSION_PRIORITY['MANAGER'] >= PERMISSION_PRIORITY[requiredPermission]
    return {
      allowed: hasPermission,
      permission: 'MANAGER',
      reason: '上级领导',
    }
  }

  // 5. 部门层级检查：上级部门负责人对下级部门资源有管理权限
  if (user.departmentId && resource.creatorDepartmentId) {
    if (await isUpperDepartment(user.departmentId, resource.creatorDepartmentId)) {
      if (await isDepartmentManager(userId, user.departmentId)) {
        const hasPermission = PERMISSION_PRIORITY['MANAGER'] >= PERMISSION_PRIORITY[requiredPermission]
        return {
          allowed: hasPermission,
          permission: 'MANAGER',
          reason: '上级部门负责人',
        }
      }
    }
  }

  // 6. 权限表检查
  const permissions = await getResourcePermissionSettings(resourceType, resourceId)
  const userPermission = await calculateUserPermission(user, permissions)

  if (userPermission) {
    const hasPermission = PERMISSION_PRIORITY[userPermission] >= PERMISSION_PRIORITY[requiredPermission]
    return {
      allowed: hasPermission,
      permission: userPermission,
      reason: '显式权限设置',
    }
  }

  // 7. 默认权限（无显式设置时）
  const defaultPermission = getDefaultPermission(user.role, resourceType)
  if (defaultPermission) {
    const hasPermission = PERMISSION_PRIORITY[defaultPermission] >= PERMISSION_PRIORITY[requiredPermission]
    return {
      allowed: hasPermission,
      permission: defaultPermission,
      reason: '默认角色权限',
    }
  }

  return { allowed: false, permission: null, reason: '无权限' }
}

/**
 * 计算用户在权限列表中的最高权限
 */
async function calculateUserPermission(
  user: { id: string; departmentId: string | null },
  permissions: Array<{
    permission: ResourcePermission
    targetType: PermissionTargetType
    targetId: string | null
    departmentId: string | null
  }>
): Promise<ResourcePermission | null> {
  if (permissions.length === 0) return null

  // 收集所有需要检查的部门 ID，用于批量查询子部门
  const departmentIdsToCheck = new Set<string>()
  for (const perm of permissions) {
    if (perm.targetType === 'DEPARTMENT' && perm.targetId && user.departmentId) {
      // 只有当用户部门不等于权限目标部门时才需要查询子部门
      if (user.departmentId !== perm.targetId) {
        departmentIdsToCheck.add(perm.targetId)
      }
    }
  }

  // 批量获取所有需要检查的部门的子部门，避免 N+1 查询
  const descendantMap = new Map<string, string[]>()
  if (departmentIdsToCheck.size > 0) {
    // 使用单次查询获取所有相关部门的子部门
    // 通过 path 字段进行前缀匹配可以高效获取子部门
    const parentDepts = await prisma.department.findMany({
      where: { id: { in: Array.from(departmentIdsToCheck) } },
      select: { id: true, path: true },
    })

    if (parentDepts.length > 0) {
      // 获取所有可能的子部门
      const pathPrefixes = parentDepts.map(d => d.path)
      const allDescendants = await prisma.department.findMany({
        where: {
          OR: pathPrefixes.map(prefix => ({
            path: { startsWith: prefix + '/' }
          }))
        },
        select: { id: true, path: true },
      })

      // 按父部门分组子部门
      for (const parent of parentDepts) {
        const descendants = allDescendants
          .filter(d => d.path.startsWith(parent.path + '/'))
          .map(d => d.id)
        descendantMap.set(parent.id, descendants)
      }
    }
  }

  const applicablePermissions: ResourcePermission[] = []

  for (const perm of permissions) {
    let applies = false

    switch (perm.targetType) {
      case 'ALL':
        applies = true
        break
      case 'USER':
        applies = perm.targetId === user.id
        break
      case 'DEPARTMENT':
        if (user.departmentId && perm.targetId) {
          // 检查用户是否在该部门或其子部门中
          if (user.departmentId === perm.targetId) {
            applies = true
          } else {
            // 使用预先批量查询的结果
            const descendants = descendantMap.get(perm.targetId) || []
            applies = descendants.includes(user.departmentId)
          }
        }
        break
    }

    if (applies) {
      applicablePermissions.push(perm.permission)
    }
  }

  if (applicablePermissions.length === 0) return null

  // 返回最高权限
  return applicablePermissions.reduce((max, current) =>
    PERMISSION_PRIORITY[current] > PERMISSION_PRIORITY[max] ? current : max
  )
}

/**
 * 获取角色的默认权限（无显式设置时）
 */
function getDefaultPermission(
  role: Role,
  _resourceType: ResourceType
): ResourcePermission | null {
  // 默认权限规则
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return 'MANAGER'
    case 'EDITOR':
      return 'EDITOR'
    case 'MEMBER':
      return 'VIEWER'
    case 'VIEWER':
      return 'VIEWER'
    default:
      return null
  }
}

/**
 * 获取用户对资源的最高权限级别
 */
export async function getResourcePermissionLevel(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<ResourcePermission | null> {
  const result = await checkResourcePermission(userId, resourceType, resourceId, 'VIEWER')
  return result.permission
}

/**
 * 获取用户可访问的资源 ID 列表
 */
export async function getAccessibleResourceIds(
  userId: string,
  organizationId: string,
  resourceType: ResourceType,
  requiredPermission: ResourcePermission = 'VIEWER'
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

  // OWNER 和 ADMIN 可以访问所有资源
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return 'all'
  }

  const accessibleIds: Set<string> = new Set()

  switch (resourceType) {
    case 'WORKFLOW': {
      // 获取用户创建的工作流
      const created = await prisma.workflow.findMany({
        where: { organizationId, creatorId: userId, deletedAt: null },
        select: { id: true },
      })
      created.forEach((w) => accessibleIds.add(w.id))

      // 获取有权限设置的工作流
      const withPermissions = await prisma.workflow.findMany({
        where: { organizationId, deletedAt: null, permissions: { some: {} } },
        select: { id: true, permissions: true },
      })
      for (const workflow of withPermissions) {
        const userPerm = await calculateUserPermission(
          user,
          workflow.permissions.map((p) => ({
            permission: convertToResourcePermission(p.permission as unknown as string),
            targetType: p.targetType,
            targetId: p.targetId,
            departmentId: p.departmentId,
          }))
        )
        if (userPerm && PERMISSION_PRIORITY[userPerm] >= PERMISSION_PRIORITY[requiredPermission]) {
          accessibleIds.add(workflow.id)
        }
      }

      // 获取没有权限设置的工作流（使用默认权限）
      const defaultPerm = getDefaultPermission(user.role, resourceType)
      if (defaultPerm && PERMISSION_PRIORITY[defaultPerm] >= PERMISSION_PRIORITY[requiredPermission]) {
        const noPermissions = await prisma.workflow.findMany({
          where: { organizationId, deletedAt: null, permissions: { none: {} } },
          select: { id: true },
        })
        noPermissions.forEach((w) => accessibleIds.add(w.id))
      }
      break
    }

    case 'KNOWLEDGE_BASE': {
      // 获取用户创建的知识库
      const created = await prisma.knowledgeBase.findMany({
        where: { organizationId, creatorId: userId },
        select: { id: true },
      })
      created.forEach((kb) => accessibleIds.add(kb.id))

      // 获取有权限设置的知识库
      const withPermissions = await prisma.knowledgeBase.findMany({
        where: { organizationId, permissions: { some: {} } },
        select: { id: true, permissions: true },
      })
      for (const kb of withPermissions) {
        const userPerm = await calculateUserPermission(user, kb.permissions)
        if (userPerm && PERMISSION_PRIORITY[userPerm] >= PERMISSION_PRIORITY[requiredPermission]) {
          accessibleIds.add(kb.id)
        }
      }

      // 获取没有权限设置的知识库（使用默认权限）
      const defaultPerm = getDefaultPermission(user.role, resourceType)
      if (defaultPerm && PERMISSION_PRIORITY[defaultPerm] >= PERMISSION_PRIORITY[requiredPermission]) {
        const noPermissions = await prisma.knowledgeBase.findMany({
          where: { organizationId, permissions: { none: {} } },
          select: { id: true },
        })
        noPermissions.forEach((kb) => accessibleIds.add(kb.id))
      }
      break
    }

    case 'TEMPLATE': {
      // 获取公域模板（所有人都可以查看）
      if (requiredPermission === 'VIEWER') {
        const publicTemplates = await prisma.workflowTemplate.findMany({
          where: { templateType: 'PUBLIC', isHidden: false },
          select: { id: true },
        })
        publicTemplates.forEach((t) => accessibleIds.add(t.id))
      }

      // 获取用户创建的模板
      const created = await prisma.workflowTemplate.findMany({
        where: { organizationId, creatorId: userId, isHidden: false },
        select: { id: true },
      })
      created.forEach((t) => accessibleIds.add(t.id))

      // 获取有权限设置的模板
      const withPermissions = await prisma.workflowTemplate.findMany({
        where: { organizationId, isHidden: false, permissions: { some: {} } },
        select: { id: true, permissions: true },
      })
      for (const template of withPermissions) {
        const userPerm = await calculateUserPermission(
          user,
          template.permissions.map((p) => ({
            permission: p.permission,
            targetType: p.targetType,
            targetId: p.targetId,
            departmentId: p.targetType === 'DEPARTMENT' ? p.targetId : null,
          }))
        )
        if (userPerm && PERMISSION_PRIORITY[userPerm] >= PERMISSION_PRIORITY[requiredPermission]) {
          accessibleIds.add(template.id)
        }
      }

      // 获取企业内可见但没有权限设置的模板
      const defaultPerm = getDefaultPermission(user.role, resourceType)
      if (defaultPerm && PERMISSION_PRIORITY[defaultPerm] >= PERMISSION_PRIORITY[requiredPermission]) {
        const noPermissions = await prisma.workflowTemplate.findMany({
          where: {
            organizationId,
            isHidden: false,
            visibility: 'ORGANIZATION',
            permissions: { none: {} },
          },
          select: { id: true },
        })
        noPermissions.forEach((t) => accessibleIds.add(t.id))
      }
      break
    }
  }

  return Array.from(accessibleIds)
}

/**
 * 获取资源的权限列表（用于权限管理 UI）
 * 
 * 优化说明：使用批量查询避免 N+1 查询问题
 * - 合并用户和创建者的查询，减少数据库往返次数
 * - 使用 Map 进行 O(1) 查找
 */
export async function getResourcePermissions(
  resourceType: ResourceType,
  resourceId: string
): Promise<PermissionListItem[]> {
  const permissions = await getResourcePermissionSettings(resourceType, resourceId)

  if (permissions.length === 0) return []

  // 收集所有需要查询的 ID，避免 N+1 查询
  const allUserIds = new Set<string>()
  const departmentIds = new Set<string>()

  for (const perm of permissions) {
    // 收集目标用户 ID
    if (perm.targetType === 'USER' && perm.targetId) {
      allUserIds.add(perm.targetId)
    }
    // 收集部门 ID
    if (perm.targetType === 'DEPARTMENT' && perm.targetId) {
      departmentIds.add(perm.targetId)
    }
    // 收集创建者 ID（与目标用户合并查询）
    allUserIds.add(perm.createdById)
  }

  // 批量查询所有用户（包括目标用户和创建者），减少数据库查询次数
  const allUsers = await prisma.user.findMany({
    where: { id: { in: Array.from(allUserIds) } },
    select: { id: true, name: true, email: true },
  })
  const userMap = new Map<string, { id: string; name: string | null; email: string }>(
    allUsers.map(u => [u.id, u])
  )

  // 批量查询部门
  const departments = departmentIds.size > 0
    ? await prisma.department.findMany({
        where: { id: { in: Array.from(departmentIds) } },
        select: { id: true, name: true },
      })
    : []
  const deptMap = new Map<string, { id: string; name: string }>(
    departments.map(d => [d.id, d])
  )

  // 组装结果
  const result: PermissionListItem[] = []

  for (const perm of permissions) {
    let targetName = ''

    switch (perm.targetType) {
      case 'ALL':
        targetName = '全企业'
        break
      case 'USER':
        if (perm.targetId) {
          const user = userMap.get(perm.targetId)
          targetName = user?.name || user?.email || '未知用户'
        }
        break
      case 'DEPARTMENT':
        if (perm.targetId) {
          const dept = deptMap.get(perm.targetId)
          targetName = dept?.name || '未知部门'
        }
        break
    }

    const creator = userMap.get(perm.createdById)

    result.push({
      id: perm.id,
      targetType: perm.targetType,
      targetId: perm.targetId,
      targetName,
      permission: perm.permission,
      createdAt: perm.createdAt,
      createdBy: {
        id: perm.createdById,
        name: creator?.name || null,
      },
    })
  }

  return result
}

/**
 * 设置资源权限
 */
export async function setResourcePermission(
  resourceType: ResourceType,
  resourceId: string,
  targetType: PermissionTargetType,
  targetId: string | null,
  permission: ResourcePermission,
  operatorId: string
): Promise<void> {
  const data = {
    permission,
    targetType,
    targetId,
    createdById: operatorId,
    departmentId: targetType === 'DEPARTMENT' ? targetId : null,
  }

  switch (resourceType) {
    case 'WORKFLOW':
      await prisma.workflowPermission.upsert({
        where: {
          workflowId_targetType_targetId: {
            workflowId: resourceId,
            targetType,
            targetId: targetId ?? '',
          },
        },
        create: {
          ...data,
          workflowId: resourceId,
          // 兼容旧字段
          permission: permission as unknown as 'VIEW' | 'USE' | 'EDIT',
        },
        update: {
          permission: permission as unknown as 'VIEW' | 'USE' | 'EDIT',
        },
      })
      break

    case 'KNOWLEDGE_BASE':
      await prisma.knowledgeBasePermission.upsert({
        where: {
          knowledgeBaseId_targetType_targetId: {
            knowledgeBaseId: resourceId,
            targetType,
            targetId: targetId ?? '',
          },
        },
        create: {
          ...data,
          knowledgeBaseId: resourceId,
        },
        update: { permission },
      })
      break

    case 'TEMPLATE':
      await prisma.templatePermission.upsert({
        where: {
          templateId_targetType_targetId: {
            templateId: resourceId,
            targetType,
            targetId: targetId ?? '',
          },
        },
        create: {
          ...data,
          templateId: resourceId,
        },
        update: { permission },
      })
      break
  }
}

/**
 * 删除资源权限
 */
export async function removeResourcePermission(
  resourceType: ResourceType,
  resourceId: string,
  targetType: PermissionTargetType,
  targetId: string | null
): Promise<void> {
  switch (resourceType) {
    case 'WORKFLOW':
      await prisma.workflowPermission.deleteMany({
        where: { workflowId: resourceId, targetType, targetId },
      })
      break

    case 'KNOWLEDGE_BASE':
      await prisma.knowledgeBasePermission.deleteMany({
        where: { knowledgeBaseId: resourceId, targetType, targetId },
      })
      break

    case 'TEMPLATE':
      await prisma.templatePermission.deleteMany({
        where: { templateId: resourceId, targetType, targetId },
      })
      break
  }
}

/**
 * 检查用户是否可以修改资源权限（需要 MANAGER 权限）
 */
export async function canManagePermission(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> {
  const result = await checkResourcePermission(userId, resourceType, resourceId, 'MANAGER')
  return result.allowed
}
