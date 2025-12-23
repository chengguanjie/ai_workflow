/**
 * Enhanced Error Classes
 * 
 * Provides enhanced error classes with causes, solutions, and context
 * for better error diagnosis and user guidance.
 */

import {
  ErrorCategory,
  ErrorSeverity,
  ErrorCause,
  ErrorSolution,
  ErrorContext,
  EnhancedErrorResponse,
  EnhancedErrorDetails,
} from './types'

// ============================================================================
// Enhanced App Error Base Class
// ============================================================================

/**
 * Options for creating an EnhancedAppError
 */
export interface EnhancedAppErrorOptions {
  /** Context information about the error */
  context?: ErrorContext
  /** Possible causes for the error */
  causes?: ErrorCause[]
  /** Suggested solutions for the error */
  solutions?: ErrorSolution[]
  /** Error severity level */
  severity?: ErrorSeverity
  /** URL to relevant documentation */
  documentationUrl?: string
}

/**
 * Abstract base class for enhanced application errors.
 * Extends the standard Error class with additional diagnostic information
 * including causes, solutions, and context.
 */
export abstract class EnhancedAppError extends Error {
  /** Unique error code for identification */
  abstract readonly code: string
  /** HTTP status code for API responses */
  abstract readonly statusCode: number
  /** Error category for classification */
  abstract readonly category: ErrorCategory
  
  /** Error severity level */
  readonly severity: ErrorSeverity
  /** Context information about the error */
  readonly context?: ErrorContext
  /** Possible causes for the error */
  readonly causes: ErrorCause[]
  /** Suggested solutions for the error */
  readonly solutions: ErrorSolution[]
  /** URL to relevant documentation */
  readonly documentationUrl?: string

  constructor(message: string, options?: EnhancedAppErrorOptions) {
    super(message)
    this.name = this.constructor.name
    this.severity = options?.severity ?? 'error'
    this.context = options?.context
    this.causes = options?.causes ?? []
    this.solutions = options?.solutions ?? []
    this.documentationUrl = options?.documentationUrl

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Converts the error to an enhanced JSON response format
   */
  toEnhancedJSON(requestId: string = 'unknown'): EnhancedErrorResponse {
    const errorDetails: EnhancedErrorDetails = {
      code: this.code,
      message: this.message,
      causes: this.causes,
      solutions: this.solutions,
      requestId,
      timestamp: new Date().toISOString(),
      severity: this.severity,
    }

    if (this.context) {
      errorDetails.context = this.context
    }

    if (this.documentationUrl) {
      errorDetails.documentationUrl = this.documentationUrl
    }

    return {
      success: false,
      error: errorDetails,
    }
  }
}

// ============================================================================
// Database Error
// ============================================================================

/** Type of database error */
export type DbErrorType = 'connection' | 'constraint' | 'timeout' | 'query'

/** Type of constraint violation */
export type ConstraintType = 'unique' | 'foreign_key' | 'check' | 'not_null'

/**
 * Options for creating a DatabaseError
 */
export interface DatabaseErrorOptions extends EnhancedAppErrorOptions {
  /** Type of database error */
  dbErrorType: DbErrorType
  /** Type of constraint violation (for constraint errors) */
  constraintType?: ConstraintType
  /** Field affected by the constraint */
  affectedField?: string
}

/**
 * Error class for database operation failures.
 * Supports connection, constraint, timeout, and query errors.
 */
export class DatabaseError extends EnhancedAppError {
  readonly code = 'DATABASE_ERROR'
  readonly statusCode = 500
  readonly category: ErrorCategory = 'database'
  
  /** Type of database error */
  readonly dbErrorType: DbErrorType
  /** Type of constraint violation */
  readonly constraintType?: ConstraintType
  /** Field affected by the constraint */
  readonly affectedField?: string

  constructor(message: string, options: DatabaseErrorOptions) {
    // Set severity based on error type
    const severity = options.dbErrorType === 'connection' ? 'critical' : 'error'
    
    super(message, { ...options, severity: options.severity ?? severity })
    
    this.dbErrorType = options.dbErrorType
    this.constraintType = options.constraintType
    this.affectedField = options.affectedField

    // Add database-specific context
    if (!this.context) {
      (this as { context: ErrorContext }).context = {}
    }
    if (this.context) {
      this.context.dbErrorType = this.dbErrorType
      this.context.constraintType = this.constraintType
      this.context.affectedField = this.affectedField
    }
  }

  /**
   * Creates a connection error
   */
  static connection(message: string = '数据库连接失败'): DatabaseError {
    return new DatabaseError(message, {
      dbErrorType: 'connection',
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
    })
  }

  /**
   * Creates a unique constraint violation error
   */
  static uniqueConstraint(field: string, message?: string): DatabaseError {
    return new DatabaseError(message ?? `字段 ${field} 的值已存在`, {
      dbErrorType: 'constraint',
      constraintType: 'unique',
      affectedField: field,
      causes: [
        { id: 'duplicate_value', description: `${field} 字段的值已被使用`, likelihood: 'high' },
      ],
      solutions: [
        { id: 'use_different_value', description: `请使用不同的 ${field} 值`, actionType: 'manual' },
        { id: 'check_existing', description: '检查是否已存在相同记录', actionType: 'manual' },
      ],
    })
  }

  /**
   * Creates a foreign key constraint violation error
   */
  static foreignKeyConstraint(field: string, message?: string): DatabaseError {
    return new DatabaseError(message ?? `关联的 ${field} 不存在`, {
      dbErrorType: 'constraint',
      constraintType: 'foreign_key',
      affectedField: field,
      causes: [
        { id: 'missing_reference', description: `引用的 ${field} 记录不存在`, likelihood: 'high' },
        { id: 'deleted_reference', description: '引用的记录可能已被删除', likelihood: 'medium' },
      ],
      solutions: [
        { id: 'verify_reference', description: '确认引用的记录存在', actionType: 'manual' },
        { id: 'create_reference', description: '先创建被引用的记录', actionType: 'manual' },
      ],
    })
  }

  /**
   * Creates a timeout error
   */
  static timeout(message: string = '数据库操作超时'): DatabaseError {
    return new DatabaseError(message, {
      dbErrorType: 'timeout',
      causes: [
        { id: 'slow_query', description: '查询执行时间过长', likelihood: 'high' },
        { id: 'db_overload', description: '数据库负载过高', likelihood: 'medium' },
        { id: 'network_latency', description: '网络延迟', likelihood: 'low' },
      ],
      solutions: [
        { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
        { id: 'simplify_query', description: '尝试简化查询条件', actionType: 'manual' },
      ],
    })
  }

  /**
   * Creates a query error
   */
  static query(message: string = '数据库查询失败'): DatabaseError {
    return new DatabaseError(message, {
      dbErrorType: 'query',
      causes: [
        { id: 'invalid_query', description: '查询语法错误', likelihood: 'medium' },
        { id: 'data_type_mismatch', description: '数据类型不匹配', likelihood: 'medium' },
      ],
      solutions: [
        { id: 'check_input', description: '检查输入数据格式', actionType: 'manual' },
        { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
      ],
    })
  }
}


// ============================================================================
// External Service Error
// ============================================================================

/**
 * Options for creating an ExternalServiceError
 */
export interface ExternalServiceErrorOptions extends EnhancedAppErrorOptions {
  /** Name of the external service */
  serviceName: string
  /** Whether the error is temporary */
  isTemporary?: boolean
  /** Suggested retry time in seconds */
  retryAfter?: number
}

/**
 * Error class for external service failures.
 * Includes service name, temporary status, and retry suggestions.
 */
export class ExternalServiceError extends EnhancedAppError {
  readonly code = 'EXTERNAL_SERVICE_ERROR'
  readonly statusCode = 502
  readonly category: ErrorCategory = 'external_service'
  
  /** Name of the external service */
  readonly serviceName: string
  /** Whether the error is temporary */
  readonly isTemporary: boolean
  /** Suggested retry time in seconds */
  readonly retryAfter?: number

  constructor(message: string, options: ExternalServiceErrorOptions) {
    super(message, options)
    
    this.serviceName = options.serviceName
    this.isTemporary = options.isTemporary ?? false
    this.retryAfter = options.retryAfter

    // Add service-specific context
    if (!this.context) {
      (this as { context: ErrorContext }).context = {}
    }
    if (this.context) {
      this.context.serviceName = this.serviceName
      this.context.isTemporary = this.isTemporary
      this.context.retryAfter = this.retryAfter
    }
  }

  /**
   * Creates a temporary service error with retry suggestion
   */
  static temporary(
    serviceName: string,
    retryAfter: number = 30,
    message?: string
  ): ExternalServiceError {
    return new ExternalServiceError(
      message ?? `${serviceName} 服务暂时不可用，请稍后重试`,
      {
        serviceName,
        isTemporary: true,
        retryAfter,
        causes: [
          { id: 'service_overload', description: `${serviceName} 服务负载过高`, likelihood: 'high' },
          { id: 'service_maintenance', description: `${serviceName} 正在维护中`, likelihood: 'medium' },
          { id: 'network_issue', description: '网络连接问题', likelihood: 'medium' },
        ],
        solutions: [
          { 
            id: 'retry_later', 
            description: `${retryAfter} 秒后重试`, 
            actionType: 'automatic', 
            actionLabel: '重试' 
          },
          { id: 'check_status', description: `检查 ${serviceName} 服务状态`, actionType: 'manual' },
        ],
      }
    )
  }

  /**
   * Creates a permanent service error
   */
  static permanent(serviceName: string, message?: string): ExternalServiceError {
    return new ExternalServiceError(
      message ?? `${serviceName} 服务不可用`,
      {
        serviceName,
        isTemporary: false,
        severity: 'critical',
        causes: [
          { id: 'service_down', description: `${serviceName} 服务已停止`, likelihood: 'high' },
          { id: 'api_deprecated', description: 'API 已废弃或不再支持', likelihood: 'medium' },
          { id: 'auth_failure', description: '服务认证失败', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
          { id: 'check_config', description: '检查服务配置', actionType: 'manual' },
        ],
      }
    )
  }

  /**
   * Creates an API error from external service
   */
  static apiError(
    serviceName: string,
    statusCode: number,
    message?: string
  ): ExternalServiceError {
    const isTemporary = statusCode >= 500 || statusCode === 429
    return new ExternalServiceError(
      message ?? `${serviceName} 返回错误 (${statusCode})`,
      {
        serviceName,
        isTemporary,
        retryAfter: isTemporary ? 30 : undefined,
        causes: [
          { id: 'api_error', description: `${serviceName} API 返回错误`, likelihood: 'high' },
          { id: 'invalid_request', description: '请求参数可能不正确', likelihood: 'medium' },
        ],
        solutions: isTemporary
          ? [
              { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
            ]
          : [
              { id: 'check_params', description: '检查请求参数', actionType: 'manual' },
              { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
            ],
      }
    )
  }
}

// ============================================================================
// File Operation Error
// ============================================================================

/** Type of file operation error */
export type FileErrorType = 'size' | 'type' | 'permission' | 'not_found' | 'corrupted'

/**
 * Options for creating a FileOperationError
 */
export interface FileOperationErrorOptions extends EnhancedAppErrorOptions {
  /** Type of file error */
  fileErrorType: FileErrorType
  /** Maximum allowed file size in bytes */
  maxSize?: number
  /** List of allowed file types */
  allowedTypes?: string[]
  /** Actual file size that was rejected */
  actualSize?: number
  /** Actual file type that was rejected */
  actualType?: string
}

/**
 * Error class for file operation failures.
 * Supports size, type, permission, not_found, and corrupted errors.
 */
export class FileOperationError extends EnhancedAppError {
  readonly code = 'FILE_OPERATION_ERROR'
  readonly statusCode = 400
  readonly category: ErrorCategory = 'file_system'
  
  /** Type of file error */
  readonly fileErrorType: FileErrorType
  /** Maximum allowed file size in bytes */
  readonly maxSize?: number
  /** List of allowed file types */
  readonly allowedTypes?: string[]
  /** Actual file size that was rejected */
  readonly actualSize?: number
  /** Actual file type that was rejected */
  readonly actualType?: string

  constructor(message: string, options: FileOperationErrorOptions) {
    super(message, options)
    
    this.fileErrorType = options.fileErrorType
    this.maxSize = options.maxSize
    this.allowedTypes = options.allowedTypes
    this.actualSize = options.actualSize
    this.actualType = options.actualType

    // Add file-specific context
    if (!this.context) {
      (this as { context: ErrorContext }).context = {}
    }
    if (this.context) {
      this.context.fileErrorType = this.fileErrorType
      this.context.maxSize = this.maxSize
      this.context.allowedTypes = this.allowedTypes
      this.context.actualSize = this.actualSize
      this.context.actualType = this.actualType
    }
  }

  /**
   * Creates a file size error
   */
  static sizeExceeded(maxSize: number, actualSize?: number): FileOperationError {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2)
    const actualSizeMB = actualSize ? (actualSize / (1024 * 1024)).toFixed(2) : undefined
    
    return new FileOperationError(
      actualSizeMB 
        ? `文件大小 (${actualSizeMB}MB) 超过限制 (${maxSizeMB}MB)`
        : `文件大小超过限制 (最大 ${maxSizeMB}MB)`,
      {
        fileErrorType: 'size',
        maxSize,
        actualSize,
        causes: [
          { id: 'file_too_large', description: `文件超过 ${maxSizeMB}MB 的大小限制`, likelihood: 'high' },
        ],
        solutions: [
          { id: 'compress_file', description: '压缩文件后重新上传', actionType: 'manual' },
          { id: 'split_file', description: '将文件拆分为多个小文件', actionType: 'manual' },
        ],
      }
    )
  }

  /**
   * Creates a file type error
   */
  static invalidType(allowedTypes: string[], actualType?: string): FileOperationError {
    const typesStr = allowedTypes.join(', ')
    
    return new FileOperationError(
      actualType
        ? `不支持的文件类型 (${actualType})，允许的类型: ${typesStr}`
        : `不支持的文件类型，允许的类型: ${typesStr}`,
      {
        fileErrorType: 'type',
        allowedTypes,
        actualType,
        causes: [
          { id: 'wrong_type', description: '文件类型不在允许列表中', likelihood: 'high' },
          { id: 'wrong_extension', description: '文件扩展名可能不正确', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'convert_file', description: `将文件转换为支持的格式: ${typesStr}`, actionType: 'manual' },
          { id: 'check_extension', description: '确认文件扩展名正确', actionType: 'manual' },
        ],
      }
    )
  }

  /**
   * Creates a file not found error
   */
  static notFound(filename?: string): FileOperationError {
    return new FileOperationError(
      filename ? `文件 "${filename}" 不存在` : '文件不存在',
      {
        fileErrorType: 'not_found',
        statusCode: 404,
        causes: [
          { id: 'file_deleted', description: '文件可能已被删除', likelihood: 'high' },
          { id: 'wrong_path', description: '文件路径不正确', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'reupload', description: '重新上传文件', actionType: 'manual' },
          { id: 'check_path', description: '检查文件路径是否正确', actionType: 'manual' },
        ],
      } as FileOperationErrorOptions
    )
  }

  /**
   * Creates a file permission error
   */
  static permissionDenied(filename?: string): FileOperationError {
    return new FileOperationError(
      filename ? `没有权限访问文件 "${filename}"` : '没有权限访问文件',
      {
        fileErrorType: 'permission',
        statusCode: 403,
        causes: [
          { id: 'no_permission', description: '当前用户没有文件访问权限', likelihood: 'high' },
          { id: 'file_locked', description: '文件被其他进程锁定', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'request_access', description: '请求文件访问权限', actionType: 'manual' },
          { id: 'contact_owner', description: '联系文件所有者', actionType: 'manual' },
        ],
      } as FileOperationErrorOptions
    )
  }

  /**
   * Creates a corrupted file error
   */
  static corrupted(filename?: string): FileOperationError {
    return new FileOperationError(
      filename ? `文件 "${filename}" 已损坏` : '文件已损坏',
      {
        fileErrorType: 'corrupted',
        causes: [
          { id: 'upload_interrupted', description: '上传过程中断导致文件不完整', likelihood: 'high' },
          { id: 'file_corrupted', description: '文件本身已损坏', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'reupload', description: '重新上传文件', actionType: 'manual' },
          { id: 'check_original', description: '检查原始文件是否完整', actionType: 'manual' },
        ],
      }
    )
  }
}


// ============================================================================
// Workflow Execution Error
// ============================================================================

/**
 * Options for creating a WorkflowExecutionError
 */
export interface WorkflowExecutionErrorOptions extends EnhancedAppErrorOptions {
  /** ID of the node that caused the error */
  nodeId: string
  /** Type of the node that caused the error */
  nodeType: string
  /** ID of the execution instance */
  executionId: string
  /** ID of the workflow */
  workflowId?: string
  /** Input field that caused the error */
  inputField?: string
}

/**
 * Error class for workflow execution failures.
 * Includes node information and execution context.
 */
export class WorkflowExecutionError extends EnhancedAppError {
  readonly code = 'WORKFLOW_EXECUTION_ERROR'
  readonly statusCode = 500
  readonly category: ErrorCategory = 'workflow'
  
  /** ID of the node that caused the error */
  readonly nodeId: string
  /** Type of the node that caused the error */
  readonly nodeType: string
  /** ID of the execution instance */
  readonly executionId: string
  /** ID of the workflow */
  readonly workflowId?: string
  /** Input field that caused the error */
  readonly inputField?: string

  constructor(message: string, options: WorkflowExecutionErrorOptions) {
    super(message, options)
    
    this.nodeId = options.nodeId
    this.nodeType = options.nodeType
    this.executionId = options.executionId
    this.workflowId = options.workflowId
    this.inputField = options.inputField

    // Add workflow-specific context
    if (!this.context) {
      (this as { context: ErrorContext }).context = {}
    }
    if (this.context) {
      this.context.nodeId = this.nodeId
      this.context.nodeType = this.nodeType
      this.context.executionId = this.executionId
      this.context.workflowId = this.workflowId
    }
  }

  /**
   * Creates a node configuration error
   */
  static configurationError(
    nodeId: string,
    nodeType: string,
    executionId: string,
    message?: string,
    workflowId?: string
  ): WorkflowExecutionError {
    return new WorkflowExecutionError(
      message ?? `节点 "${nodeType}" 配置错误`,
      {
        nodeId,
        nodeType,
        executionId,
        workflowId,
        causes: [
          { id: 'missing_config', description: '节点缺少必要的配置', likelihood: 'high' },
          { id: 'invalid_config', description: '节点配置值无效', likelihood: 'high' },
          { id: 'incompatible_config', description: '配置与节点类型不兼容', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'check_config', description: '检查节点配置是否完整', actionType: 'manual' },
          { id: 'view_docs', description: '查看节点文档了解配置要求', actionType: 'link', actionUrl: '/docs/nodes' },
          { id: 'reset_config', description: '重置节点配置为默认值', actionType: 'manual' },
        ],
        documentationUrl: `/docs/nodes/${nodeType}`,
      }
    )
  }

  /**
   * Creates an input data error
   */
  static inputError(
    nodeId: string,
    nodeType: string,
    executionId: string,
    inputField: string,
    message?: string,
    workflowId?: string
  ): WorkflowExecutionError {
    return new WorkflowExecutionError(
      message ?? `节点 "${nodeType}" 输入字段 "${inputField}" 错误`,
      {
        nodeId,
        nodeType,
        executionId,
        workflowId,
        inputField,
        causes: [
          { id: 'missing_input', description: `输入字段 "${inputField}" 缺失`, likelihood: 'high' },
          { id: 'invalid_input', description: `输入字段 "${inputField}" 格式不正确`, likelihood: 'high' },
          { id: 'type_mismatch', description: `输入字段 "${inputField}" 类型不匹配`, likelihood: 'medium' },
        ],
        solutions: [
          { id: 'check_input', description: `检查 "${inputField}" 字段的值`, actionType: 'manual' },
          { id: 'check_upstream', description: '检查上游节点的输出', actionType: 'manual' },
          { id: 'add_transform', description: '添加数据转换节点', actionType: 'manual' },
        ],
      }
    )
  }

  /**
   * Creates a node execution timeout error
   */
  static timeout(
    nodeId: string,
    nodeType: string,
    executionId: string,
    message?: string,
    workflowId?: string
  ): WorkflowExecutionError {
    return new WorkflowExecutionError(
      message ?? `节点 "${nodeType}" 执行超时`,
      {
        nodeId,
        nodeType,
        executionId,
        workflowId,
        severity: 'warning',
        causes: [
          { id: 'slow_operation', description: '节点操作耗时过长', likelihood: 'high' },
          { id: 'external_delay', description: '外部服务响应缓慢', likelihood: 'medium' },
          { id: 'large_data', description: '处理的数据量过大', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'retry', description: '重新执行工作流', actionType: 'automatic', actionLabel: '重试' },
          { id: 'increase_timeout', description: '增加节点超时时间', actionType: 'manual' },
          { id: 'optimize_data', description: '减少处理的数据量', actionType: 'manual' },
        ],
      }
    )
  }

  /**
   * Creates a generic node execution error
   */
  static executionFailed(
    nodeId: string,
    nodeType: string,
    executionId: string,
    message?: string,
    workflowId?: string
  ): WorkflowExecutionError {
    return new WorkflowExecutionError(
      message ?? `节点 "${nodeType}" 执行失败`,
      {
        nodeId,
        nodeType,
        executionId,
        workflowId,
        causes: [
          { id: 'runtime_error', description: '节点运行时错误', likelihood: 'high' },
          { id: 'dependency_error', description: '依赖的服务或资源不可用', likelihood: 'medium' },
        ],
        solutions: [
          { id: 'check_logs', description: '查看执行日志了解详情', actionType: 'manual' },
          { id: 'retry', description: '重新执行工作流', actionType: 'automatic', actionLabel: '重试' },
          { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
        ],
      }
    )
  }
}

// ============================================================================
// HTTP Status Code Mapping
// ============================================================================

/**
 * Maps error categories to their default HTTP status codes
 */
export const CATEGORY_STATUS_MAP: Record<ErrorCategory, number> = {
  validation: 400,
  authentication: 401,
  authorization: 403,
  network: 503,
  database: 500,
  file_system: 400,
  external_service: 502,
  workflow: 500,
  internal: 500,
}

/**
 * Gets the appropriate HTTP status code for an error category
 */
export function getStatusCodeForCategory(category: ErrorCategory): number {
  return CATEGORY_STATUS_MAP[category]
}
