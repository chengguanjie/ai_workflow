/**
 * 审计日志模块导出
 */

export {
  AuditService,
  getAuditService,
  logPermissionChange,
  logDepartmentChange,
  logApiTokenChange,
  logOrganizationStatusChange,
  type AuditEventType,
  type AuditLogEntry,
  type PermissionChangeDetails,
  type DepartmentChangeDetails,
  type ApiTokenChangeDetails,
  type OrganizationStatusChangeDetails,
} from './audit-service'
