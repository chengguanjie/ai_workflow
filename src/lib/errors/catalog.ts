/**
 * Error Catalog Module
 * 
 * Provides a centralized catalog of error types with predefined causes and solutions.
 * This enables consistent error handling and user guidance across the application.
 * 
 * @module errors/catalog
 */

import {
  ErrorCatalogEntry,
  ErrorCategory,
  ErrorCause,
  ErrorSolution,
} from './types'

// ============================================================================
// Error Catalog Data
// ============================================================================

/**
 * Centralized error catalog containing predefined error types with their
 * causes, solutions, and metadata.
 */
export const ERROR_CATALOG: Record<string, ErrorCatalogEntry> = {
  // =========================================================================
  // Validation Errors
  // =========================================================================
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    category: 'validation',
    defaultMessage: '请求参数验证失败',
    causes: [
      { id: 'invalid_format', description: '输入格式不正确', likelihood: 'high' },
      { id: 'missing_required', description: '缺少必填字段', likelihood: 'high' },
      { id: 'value_out_of_range', description: '值超出允许范围', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'check_format', description: '检查输入格式是否符合要求', actionType: 'manual' },
      { id: 'fill_required', description: '填写所有必填字段', actionType: 'manual' },
      { id: 'view_docs', description: '查看 API 文档了解参数要求', actionType: 'link', actionUrl: '/docs/api' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Authentication Errors
  // =========================================================================
  AUTHENTICATION_ERROR: {
    code: 'AUTHENTICATION_ERROR',
    category: 'authentication',
    defaultMessage: '认证失败',
    causes: [
      { id: 'invalid_credentials', description: '用户名或密码错误', likelihood: 'high' },
      { id: 'session_expired', description: '登录会话已过期', likelihood: 'high' },
      { id: 'token_invalid', description: '访问令牌无效', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'relogin', description: '重新登录', actionType: 'link', actionUrl: '/login', actionLabel: '去登录' },
      { id: 'check_credentials', description: '检查用户名和密码是否正确', actionType: 'manual' },
      { id: 'reset_password', description: '如果忘记密码，可以重置', actionType: 'link', actionUrl: '/reset-password' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Authorization Errors
  // =========================================================================
  AUTHORIZATION_ERROR: {
    code: 'AUTHORIZATION_ERROR',
    category: 'authorization',
    defaultMessage: '没有权限执行此操作',
    causes: [
      { id: 'insufficient_permission', description: '当前用户权限不足', likelihood: 'high' },
      { id: 'resource_restricted', description: '资源访问受限', likelihood: 'medium' },
      { id: 'role_mismatch', description: '用户角色不匹配', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'request_permission', description: '联系管理员申请权限', actionType: 'manual' },
      { id: 'switch_account', description: '切换到有权限的账户', actionType: 'manual' },
      { id: 'view_permissions', description: '查看当前权限', actionType: 'link', actionUrl: '/settings/permissions' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Not Found Errors
  // =========================================================================
  NOT_FOUND: {
    code: 'NOT_FOUND',
    category: 'internal',
    defaultMessage: '资源不存在',
    causes: [
      { id: 'resource_deleted', description: '资源可能已被删除', likelihood: 'high' },
      { id: 'wrong_id', description: '资源 ID 不正确', likelihood: 'medium' },
      { id: 'wrong_url', description: 'URL 路径不正确', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'check_id', description: '检查资源 ID 是否正确', actionType: 'manual' },
      { id: 'go_back', description: '返回上一页', actionType: 'link', actionUrl: 'javascript:history.back()' },
      { id: 'go_home', description: '返回首页', actionType: 'link', actionUrl: '/' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Database Errors
  // =========================================================================
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    category: 'database',
    defaultMessage: '数据库操作失败',
    causes: [
      { id: 'db_down', description: '数据库服务不可用', likelihood: 'medium' },
      { id: 'query_error', description: '查询执行错误', likelihood: 'medium' },
      { id: 'data_integrity', description: '数据完整性问题', likelihood: 'low' },
    ],
    solutions: [
      { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
      { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
    ],
    severity: 'error',
  },

  DATABASE_CONNECTION_ERROR: {
    code: 'DATABASE_CONNECTION_ERROR',
    category: 'database',
    defaultMessage: '数据库连接失败',
    causes: [
      { id: 'db_down', description: '数据库服务不可用', likelihood: 'high' },
      { id: 'network_issue', description: '网络连接问题', likelihood: 'medium' },
      { id: 'config_error', description: '数据库配置错误', likelihood: 'low' },
    ],
    solutions: [
      { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
      { id: 'check_status', description: '检查系统状态页面', actionType: 'link', actionUrl: '/status' },
      { id: 'contact_support', description: '如果问题持续，请联系技术支持', actionType: 'link', actionUrl: '/support' },
    ],
    severity: 'critical',
  },

  // =========================================================================
  // External Service Errors
  // =========================================================================
  EXTERNAL_SERVICE_ERROR: {
    code: 'EXTERNAL_SERVICE_ERROR',
    category: 'external_service',
    defaultMessage: '外部服务调用失败',
    causes: [
      { id: 'service_unavailable', description: '外部服务暂时不可用', likelihood: 'high' },
      { id: 'api_error', description: 'API 返回错误', likelihood: 'medium' },
      { id: 'timeout', description: '请求超时', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
      { id: 'check_service', description: '检查外部服务状态', actionType: 'manual' },
      { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
    ],
    severity: 'error',
  },

  // =========================================================================
  // File System Errors
  // =========================================================================
  FILE_OPERATION_ERROR: {
    code: 'FILE_OPERATION_ERROR',
    category: 'file_system',
    defaultMessage: '文件操作失败',
    causes: [
      { id: 'file_too_large', description: '文件大小超过限制', likelihood: 'high' },
      { id: 'invalid_type', description: '文件类型不支持', likelihood: 'high' },
      { id: 'permission_denied', description: '没有文件访问权限', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'check_size', description: '检查文件大小是否符合要求', actionType: 'manual' },
      { id: 'check_type', description: '确认文件类型是否支持', actionType: 'manual' },
      { id: 'view_docs', description: '查看文件上传要求', actionType: 'link', actionUrl: '/docs/upload' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Workflow Errors
  // =========================================================================
  WORKFLOW_EXECUTION_ERROR: {
    code: 'WORKFLOW_EXECUTION_ERROR',
    category: 'workflow',
    defaultMessage: '工作流执行失败',
    causes: [
      { id: 'node_error', description: '节点执行错误', likelihood: 'high' },
      { id: 'config_error', description: '节点配置错误', likelihood: 'medium' },
      { id: 'input_error', description: '输入数据错误', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'check_node', description: '检查失败节点的配置', actionType: 'manual' },
      { id: 'check_input', description: '检查输入数据格式', actionType: 'manual' },
      { id: 'view_logs', description: '查看执行日志', actionType: 'link', actionUrl: '/executions' },
    ],
    severity: 'error',
  },

  // =========================================================================
  // Internal Errors
  // =========================================================================
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    category: 'internal',
    defaultMessage: '服务器内部错误',
    causes: [
      { id: 'unexpected_error', description: '发生意外错误', likelihood: 'high' },
      { id: 'system_overload', description: '系统负载过高', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
      { id: 'contact_support', description: '如果问题持续，请联系技术支持', actionType: 'link', actionUrl: '/support' },
    ],
    severity: 'error',
  },

  // =========================================================================
  // Rate Limit Errors
  // =========================================================================
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    category: 'internal',
    defaultMessage: '请求过于频繁',
    causes: [
      { id: 'too_many_requests', description: '短时间内请求次数过多', likelihood: 'high' },
    ],
    solutions: [
      { id: 'wait', description: '等待一段时间后重试', actionType: 'manual' },
      { id: 'reduce_frequency', description: '降低请求频率', actionType: 'manual' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Conflict Errors
  // =========================================================================
  CONFLICT: {
    code: 'CONFLICT',
    category: 'validation',
    defaultMessage: '资源冲突',
    causes: [
      { id: 'duplicate_resource', description: '资源已存在', likelihood: 'high' },
      { id: 'concurrent_modification', description: '资源被其他操作修改', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'use_different_value', description: '使用不同的值', actionType: 'manual' },
      { id: 'refresh_and_retry', description: '刷新页面后重试', actionType: 'automatic', actionLabel: '刷新' },
    ],
    severity: 'warning',
  },

  // =========================================================================
  // Timeout Errors
  // =========================================================================
  EXECUTION_TIMEOUT: {
    code: 'EXECUTION_TIMEOUT',
    category: 'internal',
    defaultMessage: '操作超时',
    causes: [
      { id: 'slow_operation', description: '操作执行时间过长', likelihood: 'high' },
      { id: 'network_latency', description: '网络延迟', likelihood: 'medium' },
      { id: 'system_overload', description: '系统负载过高', likelihood: 'medium' },
    ],
    solutions: [
      { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
      { id: 'simplify_operation', description: '尝试简化操作', actionType: 'manual' },
    ],
    severity: 'warning',
  },
}

// ============================================================================
// Catalog Lookup Functions
// ============================================================================

/**
 * Gets a catalog entry by error code.
 * 
 * @param code - The error code to look up
 * @returns The catalog entry if found, undefined otherwise
 */
export function getCatalogEntry(code: string): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG[code]
}

/**
 * Gets the causes for an error code.
 * 
 * @param code - The error code to look up
 * @returns Array of causes, empty array if not found
 */
export function getCausesForError(code: string): ErrorCause[] {
  const entry = getCatalogEntry(code)
  return entry?.causes ?? []
}

/**
 * Gets the solutions for an error code.
 * 
 * @param code - The error code to look up
 * @returns Array of solutions, empty array if not found
 */
export function getSolutionsForError(code: string): ErrorSolution[] {
  const entry = getCatalogEntry(code)
  return entry?.solutions ?? []
}

/**
 * Gets all error codes in the catalog.
 * 
 * @returns Array of all error codes
 */
export function getAllErrorCodes(): string[] {
  return Object.keys(ERROR_CATALOG)
}

/**
 * Gets all error codes for a specific category.
 * 
 * @param category - The error category to filter by
 * @returns Array of error codes in the category
 */
export function getErrorCodesByCategory(category: ErrorCategory): string[] {
  return Object.entries(ERROR_CATALOG)
    .filter(([, entry]) => entry.category === category)
    .map(([code]) => code)
}

/**
 * Checks if an error code exists in the catalog.
 * 
 * @param code - The error code to check
 * @returns true if the code exists in the catalog
 */
export function hasErrorCode(code: string): boolean {
  return code in ERROR_CATALOG
}
