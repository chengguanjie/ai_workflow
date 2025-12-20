import { prisma } from '@/lib/db'

/**
 * 部门层级工具函数
 * 用于处理部门层级关系和权限继承
 */

/**
 * 获取部门的所有上级部门 ID 列表（从直接父级到根部门）
 */
export async function getAncestorDepartmentIds(departmentId: string): Promise<string[]> {
  const ancestors: string[] = []
  let currentId: string | null = departmentId

  while (currentId) {
    const dept: { parentId: string | null } | null = await prisma.department.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    })

    if (dept?.parentId) {
      ancestors.push(dept.parentId)
      currentId = dept.parentId
    } else {
      break
    }
  }

  return ancestors
}

/**
 * 获取部门的所有下级部门 ID 列表（递归获取所有子孙部门）
 */
export async function getDescendantDepartmentIds(departmentId: string): Promise<string[]> {
  const descendants: string[] = []
  const queue: string[] = [departmentId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const children = await prisma.department.findMany({
      where: { parentId: currentId },
      select: { id: true },
    })

    for (const child of children) {
      descendants.push(child.id)
      queue.push(child.id)
    }
  }

  return descendants
}

/**
 * 检查 upperDeptId 是否是 lowerDeptId 的上级部门
 */
export async function isUpperDepartment(
  upperDeptId: string | null,
  lowerDeptId: string | null
): Promise<boolean> {
  if (!upperDeptId || !lowerDeptId) return false
  if (upperDeptId === lowerDeptId) return false

  const ancestors = await getAncestorDepartmentIds(lowerDeptId)
  return ancestors.includes(upperDeptId)
}

/**
 * 获取部门的所有成员 ID 列表
 * @param departmentId 部门 ID
 * @param includeChildren 是否包含子部门成员
 */
export async function getDepartmentMemberIds(
  departmentId: string,
  includeChildren: boolean = false
): Promise<string[]> {
  const departmentIds = [departmentId]

  if (includeChildren) {
    const descendants = await getDescendantDepartmentIds(departmentId)
    departmentIds.push(...descendants)
  }

  const users = await prisma.user.findMany({
    where: {
      departmentId: { in: departmentIds },
      isActive: true,
    },
    select: { id: true },
  })

  return users.map((u) => u.id)
}

/**
 * 检查用户是否是部门负责人
 */
export async function isDepartmentManager(
  userId: string,
  departmentId: string
): Promise<boolean> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { managerId: true },
  })

  return dept?.managerId === userId
}

/**
 * 检查用户是否是目标用户的直属领导
 * 直属领导 = 目标用户所在部门的负责人
 */
export async function isDirectSupervisor(
  supervisorId: string,
  subordinateId: string
): Promise<boolean> {
  if (supervisorId === subordinateId) return false

  // 获取下属所在部门
  const subordinate = await prisma.user.findUnique({
    where: { id: subordinateId },
    select: { departmentId: true },
  })

  if (!subordinate?.departmentId) return false

  // 检查是否是下属所在部门的负责人
  return isDepartmentManager(supervisorId, subordinate.departmentId)
}

/**
 * 检查用户是否是目标用户的上级领导（包括间接上级）
 * 上级领导 = 目标用户所在部门或其上级部门的负责人
 */
export async function isSupervisor(
  supervisorId: string,
  subordinateId: string
): Promise<boolean> {
  if (supervisorId === subordinateId) return false

  // 获取下属所在部门
  const subordinate = await prisma.user.findUnique({
    where: { id: subordinateId },
    select: { departmentId: true },
  })

  if (!subordinate?.departmentId) return false

  // 获取下属部门及所有上级部门
  const departmentIds = [subordinate.departmentId]
  const ancestors = await getAncestorDepartmentIds(subordinate.departmentId)
  departmentIds.push(...ancestors)

  // 检查是否是这些部门的负责人
  const managedDepts = await prisma.department.findMany({
    where: {
      id: { in: departmentIds },
      managerId: supervisorId,
    },
    select: { id: true },
  })

  return managedDepts.length > 0
}

/**
 * 检查用户是否对目标部门有管理权限
 * 有管理权限的条件：
 * 1. 是该部门的负责人
 * 2. 是该部门上级部门的负责人
 */
export async function hasDepartmentManagePermission(
  userId: string,
  departmentId: string
): Promise<boolean> {
  // 检查是否是当前部门的负责人
  if (await isDepartmentManager(userId, departmentId)) {
    return true
  }

  // 检查是否是上级部门的负责人
  const ancestors = await getAncestorDepartmentIds(departmentId)
  for (const ancestorId of ancestors) {
    if (await isDepartmentManager(userId, ancestorId)) {
      return true
    }
  }

  return false
}

/**
 * 更新部门路径（当部门层级变化时调用）
 * 路径格式：/rootId/parentId/currentId
 */
export async function updateDepartmentPath(departmentId: string): Promise<void> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, parentId: true },
  })

  if (!dept) return

  // 构建路径
  const ancestors = await getAncestorDepartmentIds(departmentId)
  const path = '/' + [...ancestors.reverse(), departmentId].join('/')
  const level = ancestors.length

  // 更新当前部门
  await prisma.department.update({
    where: { id: departmentId },
    data: { path, level },
  })

  // 递归更新所有子部门
  const children = await prisma.department.findMany({
    where: { parentId: departmentId },
    select: { id: true },
  })

  for (const child of children) {
    await updateDepartmentPath(child.id)
  }
}

/**
 * 批量更新组织下所有部门的路径
 */
export async function updateAllDepartmentPaths(organizationId: string): Promise<void> {
  // 获取所有顶级部门
  const rootDepts = await prisma.department.findMany({
    where: {
      organizationId,
      parentId: null,
    },
    select: { id: true },
  })

  // 从顶级部门开始递归更新
  for (const dept of rootDepts) {
    await updateDepartmentPath(dept.id)
  }
}

/**
 * 获取用户可管理的所有部门 ID（作为负责人的部门及其子部门）
 */
export async function getManageableDepartmentIds(
  userId: string,
  organizationId: string
): Promise<string[]> {
  // 获取用户作为负责人的所有部门
  const managedDepts = await prisma.department.findMany({
    where: {
      organizationId,
      managerId: userId,
    },
    select: { id: true },
  })

  const result: string[] = []

  for (const dept of managedDepts) {
    result.push(dept.id)
    const descendants = await getDescendantDepartmentIds(dept.id)
    result.push(...descendants)
  }

  return [...new Set(result)]
}

/**
 * 获取部门树形结构
 */
export interface DepartmentTreeNode {
  id: string
  name: string
  level: number
  path: string
  managerId: string | null
  managerName?: string
  children: DepartmentTreeNode[]
}

export async function getDepartmentTree(organizationId: string): Promise<DepartmentTreeNode[]> {
  const departments = await prisma.department.findMany({
    where: { organizationId },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    include: {
      users: {
        where: { isActive: true },
        select: { id: true, name: true },
      },
    },
  })

  // 构建树形结构
  const map = new Map<string, DepartmentTreeNode>()
  const roots: DepartmentTreeNode[] = []

  // 先创建所有节点
  for (const dept of departments) {
    const manager = dept.managerId
      ? dept.users.find((u) => u.id === dept.managerId)
      : null

    map.set(dept.id, {
      id: dept.id,
      name: dept.name,
      level: dept.level,
      path: dept.path,
      managerId: dept.managerId,
      managerName: manager?.name || undefined,
      children: [],
    })
  }

  // 建立父子关系
  for (const dept of departments) {
    const node = map.get(dept.id)!
    if (dept.parentId && map.has(dept.parentId)) {
      map.get(dept.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}
