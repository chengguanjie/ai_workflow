/**
 * Prisma JSON Field Type Definitions
 * 
 * Provides typed interfaces for JSON fields in Prisma models,
 * replacing generic Record<string, unknown> with specific types.
 * 
 * Requirements: 9.1
 */

/**
 * Organization security settings stored in JSON field
 * Used in Organization.securitySettings
 */
export interface OrganizationSecuritySettings {
  /** Minimum password length (default: 8) */
  passwordMinLength: number
  /** Require uppercase letters in password (default: false) */
  passwordRequireUppercase: boolean
  /** Require numbers in password (default: false) */
  passwordRequireNumber: boolean
  /** Require symbols in password (default: false) */
  passwordRequireSymbol: boolean
  /** Session timeout in minutes (default: 10080 = 7 days) */
  sessionTimeout: number
  /** Maximum login attempts before lockout (default: 5) */
  maxLoginAttempts: number
  /** IP whitelist - empty array means no restriction */
  ipWhitelist: string[]
  /** Require two-factor authentication (default: false) */
  twoFactorRequired: boolean
}

/**
 * Default security settings for new organizations
 */
export const DEFAULT_SECURITY_SETTINGS: OrganizationSecuritySettings = {
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireNumber: false,
  passwordRequireSymbol: false,
  sessionTimeout: 10080, // 7 days in minutes
  maxLoginAttempts: 5,
  ipWhitelist: [],
  twoFactorRequired: false,
}

/**
 * API Token permission scopes
 */
export type ApiTokenScope = 
  | 'workflow:execute'
  | 'workflow:read'
  | 'workflow:write'
  | 'execution:read'
  | 'execution:write'

/**
 * API Token scopes stored in JSON field
 * Used in ApiToken.scopes
 */
export interface ApiTokenScopes {
  scopes: ApiTokenScope[]
}

/**
 * Workflow tags stored in JSON field
 * Used in Workflow.tags
 */
export type WorkflowTags = string[]

/**
 * API Key available models stored in JSON field
 * Used in ApiKey.models
 */
export type ApiKeyModels = string[]

/**
 * Execution input stored in JSON field
 * Used in Execution.input
 */
export interface ExecutionInput {
  [key: string]: unknown
}

/**
 * Execution output stored in JSON field
 * Used in Execution.output
 */
export interface ExecutionOutput {
  [key: string]: unknown
}

/**
 * Execution error detail stored in JSON field
 * Used in Execution.errorDetail
 */
export interface ExecutionErrorDetail {
  nodeId?: string
  nodeName?: string
  nodeType?: string
  errorCode?: string
  errorMessage?: string
  stackTrace?: string
  timestamp?: string
}

/**
 * Execution log input/output stored in JSON field
 * Used in ExecutionLog.input and ExecutionLog.output
 */
export interface ExecutionLogData {
  [key: string]: unknown
}

/**
 * Output file metadata stored in JSON field
 * Used in OutputFile.metadata
 */
export interface OutputFileMetadata {
  /** Image width in pixels */
  width?: number
  /** Image height in pixels */
  height?: number
  /** Video/audio duration in seconds */
  duration?: number
  /** Video/audio bitrate */
  bitrate?: number
  /** Number of pages (for documents) */
  pageCount?: number
  /** Word count (for text documents) */
  wordCount?: number
  /** Original file name before processing */
  originalFileName?: string
  /** Processing timestamp */
  processedAt?: string
  /** Additional custom metadata */
  [key: string]: unknown
}

/**
 * Audit log detail stored in JSON field
 * Used in AuditLog.detail and PlatformAuditLog.detail
 */
export interface AuditLogDetail {
  /** Previous value before change */
  previousValue?: unknown
  /** New value after change */
  newValue?: unknown
  /** Changed fields */
  changedFields?: string[]
  /** Additional context */
  context?: Record<string, unknown>
}

/**
 * Type guard to check if value is OrganizationSecuritySettings
 */
export function isOrganizationSecuritySettings(
  value: unknown
): value is OrganizationSecuritySettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as Record<string, unknown>
  return (
    typeof settings.passwordMinLength === 'number' &&
    typeof settings.passwordRequireUppercase === 'boolean' &&
    typeof settings.passwordRequireNumber === 'boolean' &&
    typeof settings.passwordRequireSymbol === 'boolean' &&
    typeof settings.sessionTimeout === 'number' &&
    typeof settings.maxLoginAttempts === 'number' &&
    Array.isArray(settings.ipWhitelist) &&
    typeof settings.twoFactorRequired === 'boolean'
  )
}

/**
 * Parse and validate security settings from JSON
 */
export function parseSecuritySettings(
  json: unknown
): OrganizationSecuritySettings {
  if (isOrganizationSecuritySettings(json)) {
    return json
  }
  return { ...DEFAULT_SECURITY_SETTINGS }
}

/**
 * Type guard to check if value is valid ApiTokenScopes
 */
export function isApiTokenScopes(value: unknown): value is ApiTokenScopes {
  if (typeof value !== 'object' || value === null) return false
  const scopes = value as Record<string, unknown>
  if (!Array.isArray(scopes.scopes)) return false
  const validScopes: ApiTokenScope[] = [
    'workflow:execute',
    'workflow:read',
    'workflow:write',
    'execution:read',
    'execution:write',
  ]
  return scopes.scopes.every(
    (scope) => typeof scope === 'string' && validScopes.includes(scope as ApiTokenScope)
  )
}
