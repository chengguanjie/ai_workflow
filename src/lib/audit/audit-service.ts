/**
 * 权限系统审计日志服务
 * 记录权限变更、部门操作、API Token操作、组织状态变更等事件
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { prisma } from '@/lib/db'

/**
 * 审计事件类型
 */
export type AuditEventType =
  | 'permission.added'
  | 'permission.updated'
  | 'permission.removed'
  | 'department.created'
  | 'department.updated'
  | 'department.deleted'
  | 'api_token.created'
  | 'api_token.revoked'
  | 'organization.status_changed'

/**
 * 审计日志条目接口
 */
export interface AuditLogEntry {
  eventType: AuditEventType
  operatorId: string
  operatorName?: string
  targetResource: string
  targetResourceId: string
  changes: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
  organizationId: string
  ipAddress?: string
  userAgent?: string
}

/**
 * 权限变更详情
 */
export interface PermissionChangeDetails {
  resourceType: 'WORKFLOW' | 'KNOWLEDGE_BASE' | 'TEMPLATE'
  resourceId: string
  resourceName?: string
  targetType: 'USER' | 'DEPARTMENT' | 'ALL'
  targetId: string | null
  targetName?: string
  oldPermission?: string | null
  newPermission?: string | null
}

/**
 * 部门变更详情
 */
export interface DepartmentChangeDetails {
  departmentId: string
  departmentName: string
  parentId?: string | null
  parentName?: string | null
  changes?: Record<string, { old: unknown; new: unknown }>
}

/**
 * API Token变更详情
 */
export interface ApiTokenChangeDetails {
  tokenId: string
  tokenName: string
  tokenPrefix: string
  scopes?: string[]
  expiresAt?: Date | null
}

/**
 * 组织状态变更详情
 */
export interface OrganizationStatusChangeDetails {
  organizationId: string
  organizationName: string
  oldStatus: string
  newStatus: string
  reason?: string
}

/**
 * 审计日志服务类
 */
export class AuditService {
  /**
   * 将审计日志条目转换为数据库格式
   */
  private toDbFormat(entry: AuditLogEntry) {
    return {
      action: entry.eventType,
      resource: entry.targetResource,
      resourceId: entry.targetResourceId,
      detail: JSON.parse(JSON.stringify({
        operatorName: entry.operatorName,
        changes: entry.changes,
        metadata: entry.metadata,
      })),
      userId: entry.operatorId,
      organizationId: entry.organizationId,
      ip: entry.ipAddress,
      userAgent: entry.userAgent,
    }
  }

  /**
   * 记录审计日志
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: this.toDbFormat(entry),
      })
    } catch (error) {
      // 审计日志失败不应影响主流程
      console.error('[AuditService] Failed to save audit log:', error)
    }
  }

  /**
   * 批量记录审计日志
   */
  async logBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return

    try {
      await prisma.auditLog.createMany({
        data: entries.map(entry => this.toDbFormat(entry)),
      })
    } catch (error) {
      console.error('[AuditService] Failed to save batch audit logs:', error)
    }
  }

  /**
   * 记录权限变更
   * Requirements: 7.1
   */
  async logPermissionChange(
    operatorId: string,
    organizationId: string,
    action: 'added' | 'updated' | 'removed',
    details: PermissionChangeDetails,
    options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const eventType: AuditEventType = `permission.${action}`
    
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    
    if (action === 'added') {
      changes.permission = { old: null, new: details.newPermission }
    } else if (action === 'updated') {
      changes.permission = { old: details.oldPermission, new: details.newPermission }
    } else if (action === 'removed') {
      changes.permission = { old: details.oldPermission, new: null }
    }

    await this.log({
      eventType,
      operatorId,
      operatorName: options?.operatorName,
      targetResource: details.resourceType,
      targetResourceId: details.resourceId,
      changes,
      metadata: {
        resourceName: details.resourceName,
        targetType: details.targetType,
        targetId: details.targetId,
        targetName: details.targetName,
      },
      organizationId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })
  }

  /**
   * 记录部门变更
   * Requirements: 7.2
   */
  async logDepartmentChange(
    operatorId: string,
    organizationId: string,
    action: 'created' | 'updated' | 'deleted',
    details: DepartmentChangeDetails,
    options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const eventType: AuditEventType = `department.${action}`
    
    let changes: Record<string, { old: unknown; new: unknown }> = {}
    
    if (action === 'created') {
      changes = {
        name: { old: null, new: details.departmentName },
        parentId: { old: null, new: details.parentId },
      }
    } else if (action === 'updated' && details.changes) {
      changes = details.changes
    } else if (action === 'deleted') {
      changes = {
        name: { old: details.departmentName, new: null },
        parentId: { old: details.parentId, new: null },
      }
    }

    await this.log({
      eventType,
      operatorId,
      operatorName: options?.operatorName,
      targetResource: 'DEPARTMENT',
      targetResourceId: details.departmentId,
      changes,
      metadata: {
        departmentName: details.departmentName,
        parentName: details.parentName,
      },
      organizationId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })
  }

  /**
   * 记录API Token变更
   * Requirements: 7.3
   */
  async logApiTokenChange(
    operatorId: string,
    organizationId: string,
    action: 'created' | 'revoked',
    details: ApiTokenChangeDetails,
    options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const eventType: AuditEventType = action === 'created' 
      ? 'api_token.created' 
      : 'api_token.revoked'
    
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    
    if (action === 'created') {
      changes.token = { old: null, new: details.tokenPrefix + '...' }
      changes.scopes = { old: null, new: details.scopes }
      changes.expiresAt = { old: null, new: details.expiresAt }
    } else {
      changes.token = { old: details.tokenPrefix + '...', new: null }
      changes.isActive = { old: true, new: false }
    }

    await this.log({
      eventType,
      operatorId,
      operatorName: options?.operatorName,
      targetResource: 'API_TOKEN',
      targetResourceId: details.tokenId,
      changes,
      metadata: {
        tokenName: details.tokenName,
        tokenPrefix: details.tokenPrefix,
        scopes: details.scopes,
      },
      organizationId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })
  }

  /**
   * 记录组织状态变更
   * Requirements: 7.4
   */
  async logOrganizationStatusChange(
    operatorId: string,
    details: OrganizationStatusChangeDetails,
    options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.log({
      eventType: 'organization.status_changed',
      operatorId,
      operatorName: options?.operatorName,
      targetResource: 'ORGANIZATION',
      targetResourceId: details.organizationId,
      changes: {
        status: { old: details.oldStatus, new: details.newStatus },
      },
      metadata: {
        organizationName: details.organizationName,
        reason: details.reason,
      },
      organizationId: details.organizationId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })
  }
}

// 全局审计服务实例
let auditServiceInstance: AuditService | null = null

/**
 * 获取审计服务实例
 */
export function getAuditService(): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new AuditService()
  }
  return auditServiceInstance
}

/**
 * 便捷函数：记录权限变更
 */
export async function logPermissionChange(
  operatorId: string,
  organizationId: string,
  action: 'added' | 'updated' | 'removed',
  details: PermissionChangeDetails,
  options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
): Promise<void> {
  return getAuditService().logPermissionChange(operatorId, organizationId, action, details, options)
}

/**
 * 便捷函数：记录部门变更
 */
export async function logDepartmentChange(
  operatorId: string,
  organizationId: string,
  action: 'created' | 'updated' | 'deleted',
  details: DepartmentChangeDetails,
  options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
): Promise<void> {
  return getAuditService().logDepartmentChange(operatorId, organizationId, action, details, options)
}

/**
 * 便捷函数：记录API Token变更
 */
export async function logApiTokenChange(
  operatorId: string,
  organizationId: string,
  action: 'created' | 'revoked',
  details: ApiTokenChangeDetails,
  options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
): Promise<void> {
  return getAuditService().logApiTokenChange(operatorId, organizationId, action, details, options)
}

/**
 * 便捷函数：记录组织状态变更
 */
export async function logOrganizationStatusChange(
  operatorId: string,
  details: OrganizationStatusChangeDetails,
  options?: { operatorName?: string; ipAddress?: string; userAgent?: string }
): Promise<void> {
  return getAuditService().logOrganizationStatusChange(operatorId, details, options)
}
