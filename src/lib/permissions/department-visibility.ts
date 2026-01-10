import { prisma } from '@/lib/db'
import { Role } from '@prisma/client'
import { getDescendantDepartmentIds, getManageableDepartmentIds } from './department'

/**
 * 部门可见性服务
 * 根据用户角色和部门关系控制部门的可见性
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

/**
 * 获取用户可见的部门ID列表
 * 
 * 规则：
 * - OWNER/ADMIN: 可以看到组织内所有部门
 * - 部门负责人: 可以看到其管理的部门及所有子部门
 * - 普通成员: 只能看到自己所在部门及其子部门
 * 
 * @param userId 用户ID
 * @param organizationId 组织ID
 * @returns 可见的部门ID列表
 */
export async function getVisibleDepartmentIds(
  userId: string,
  organizationId: string
): Promise<string[]> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      departmentId: true,
      organizationId: true,
    },
  })

  if (!user || user.organizationId !== organizationId) {
    return []
  }

  // OWNER 和 ADMIN 可以看到所有部门
  if (user.role === Role.OWNER || user.role === Role.ADMIN) {
    const allDepartments = await prisma.department.findMany({
      where: { organizationId },
      select: { id: true },
    })
    return allDepartments.map(d => d.id)
  }

  // 获取用户作为负责人管理的部门
  const manageableDeptIds = await getManageableDepartmentIds(userId, organizationId)
  
  // 获取用户所在部门及其子部门
  const ownDeptIds: string[] = []
  if (user.departmentId) {
    ownDeptIds.push(user.departmentId)
    const descendants = await getDescendantDepartmentIds(user.departmentId)
    ownDeptIds.push(...descendants)
  }

  // 合并去重
  const visibleIds = [...new Set([...manageableDeptIds, ...ownDeptIds])]
  
  return visibleIds
}

/**
 * 检查用户是否可以查看指定部门
 * 
 * @param userId 用户ID
 * @param departmentId 部门ID
 * @returns 是否可以查看
 */
export async function canViewDepartment(
  userId: string,
  departmentId: string
): Promise<boolean> {
  // 获取部门信息
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { organizationId: true },
  })

  if (!department) {
    return false
  }

  // 获取用户可见的部门列表
  const visibleDeptIds = await getVisibleDepartmentIds(userId, department.organizationId)
  
  return visibleDeptIds.includes(departmentId)
}

/**
 * 过滤部门列表，只返回用户可见的部门
 * 
 * @param userId 用户ID
 * @param organizationId 组织ID
 * @param departments 部门列表
 * @returns 过滤后的部门列表
 */
export async function filterVisibleDepartments<T extends { id: string }>(
  userId: string,
  organizationId: string,
  departments: T[]
): Promise<T[]> {
  const visibleDeptIds = await getVisibleDepartmentIds(userId, organizationId)
  const visibleSet = new Set(visibleDeptIds)
  
  return departments.filter(d => visibleSet.has(d.id))
}

/**
 * 检查用户是否有权限管理指定部门
 * 
 * 规则：
 * - OWNER/ADMIN: 可以管理所有部门
 * - 部门负责人: 可以管理其负责的部门及子部门
 * - 普通成员: 无管理权限
 * 
 * @param userId 用户ID
 * @param departmentId 部门ID
 * @returns 是否有管理权限
 */
export async function canManageDepartment(
  userId: string,
  departmentId: string
): Promise<boolean> {
  // 获取部门信息
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { organizationId: true },
  })

  if (!department) {
    return false
  }

  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
    },
  })

  if (!user || user.organizationId !== department.organizationId) {
    return false
  }

  // OWNER 和 ADMIN 可以管理所有部门
  if (user.role === Role.OWNER || user.role === Role.ADMIN) {
    return true
  }

  // 检查是否是该部门或其上级部门的负责人
  const manageableDeptIds = await getManageableDepartmentIds(userId, department.organizationId)
  
  return manageableDeptIds.includes(departmentId)
}
