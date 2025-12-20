import type { PlatformRole } from '@prisma/client'

// 权限定义
export const PERMISSIONS = {
  // 企业管理
  'organization:read': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'SUPPORT'],
  'organization:create': ['SUPER_ADMIN', 'ADMIN'],
  'organization:update': ['SUPER_ADMIN', 'ADMIN'],
  'organization:delete': ['SUPER_ADMIN'],
  'organization:status': ['SUPER_ADMIN', 'ADMIN'],

  // 用户管理
  'user:read': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'SUPPORT'],
  'user:update': ['SUPER_ADMIN', 'ADMIN'],
  'user:delete': ['SUPER_ADMIN'],
  'user:reset-password': ['SUPER_ADMIN', 'ADMIN'],

  // 管理员管理
  'admin:read': ['SUPER_ADMIN'],
  'admin:create': ['SUPER_ADMIN'],
  'admin:update': ['SUPER_ADMIN'],
  'admin:delete': ['SUPER_ADMIN'],

  // 统计数据
  'stats:read': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],

  // 审计日志
  'audit:read': ['SUPER_ADMIN', 'ADMIN'],

  // 系统设置
  'settings:read': ['SUPER_ADMIN'],
  'settings:update': ['SUPER_ADMIN'],

  // 公域模板管理
  'template:read': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'template:create': ['SUPER_ADMIN', 'ADMIN'],
  'template:update': ['SUPER_ADMIN', 'ADMIN'],
  'template:delete': ['SUPER_ADMIN'],
  'template:publish': ['SUPER_ADMIN', 'ADMIN'],
} as const

export type Permission = keyof typeof PERMISSIONS

/**
 * 检查角色是否有指定权限
 */
export function hasPermission(
  role: PlatformRole,
  permission: Permission
): boolean {
  const allowedRoles = PERMISSIONS[permission]
  return (allowedRoles as readonly string[]).includes(role)
}

/**
 * 检查角色是否有任意一个指定权限
 */
export function hasAnyPermission(
  role: PlatformRole,
  permissions: Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(role, permission))
}

/**
 * 检查角色是否有所有指定权限
 */
export function hasAllPermissions(
  role: PlatformRole,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(role, permission))
}

/**
 * 获取角色的所有权限
 */
export function getRolePermissions(role: PlatformRole): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) =>
    hasPermission(role, permission)
  )
}

/**
 * 角色等级（用于比较）
 */
const ROLE_LEVELS: Record<PlatformRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  OPERATOR: 60,
  SUPPORT: 40,
}

/**
 * 检查角色是否高于或等于指定角色
 */
export function isRoleAtLeast(
  role: PlatformRole,
  requiredRole: PlatformRole
): boolean {
  return ROLE_LEVELS[role] >= ROLE_LEVELS[requiredRole]
}
