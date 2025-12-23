/**
 * Error handling infrastructure for AI Workflow
 * 
 * Provides a hierarchy of typed error classes for consistent error handling
 * across the application.
 */

// Re-export enhanced error types
export * from './types'

// Re-export enhanced error classes
export * from './enhanced-errors'

// Re-export error catalog
export * from './catalog'

// Re-export sanitizer
export * from './sanitizer'

// Re-export error logger
export * from './logger'

// Re-export alert service
export * from './alert-service'

// Import types for use in this file
import type { ErrorCategory, ErrorSeverity, ErrorCause, ErrorSolution, ErrorContext, EnhancedErrorResponse, EnhancedErrorDetails } from './types'

/**
 * API Error Response interface
 */
export interface ApiErrorResponse {
  success: false
  error: {
    message: string
    code?: string
    details?: unknown
    traceId?: string
  }
}

/**
 * Options for creating an AppError with enhanced features
 */
export interface AppErrorOptions {
  /** Additional error details */
  details?: unknown
  /** Error severity level */
  severity?: ErrorSeverity
  /** Possible causes for the error */
  causes?: ErrorCause[]
  /** Suggested solutions for the error */
  solutions?: ErrorSolution[]
  /** Context information about the error */
  context?: ErrorContext
  /** URL to relevant documentation */
  documentationUrl?: string
}

/**
 * Base application error class
 * All custom errors should extend this class
 * 
 * Enhanced with category and severity properties for better error classification
 * while maintaining backward compatibility with existing code.
 */
export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
  /** Error category for classification */
  abstract readonly category: ErrorCategory
  
  readonly details?: unknown
  /** Error severity level (defaults to 'error') */
  readonly severity: ErrorSeverity
  /** Possible causes for the error */
  readonly causes: ErrorCause[]
  /** Suggested solutions for the error */
  readonly solutions: ErrorSolution[]
  /** Context information about the error */
  readonly context?: ErrorContext
  /** URL to relevant documentation */
  readonly documentationUrl?: string

  /**
   * Creates a new AppError
   * @param message - Error message
   * @param detailsOrOptions - Either details (for backward compatibility) or options object
   */
  constructor(message: string, detailsOrOptions?: unknown | AppErrorOptions) {
    super(message)
    this.name = this.constructor.name
    
    // Handle both old-style (details only) and new-style (options object) constructors
    if (detailsOrOptions && typeof detailsOrOptions === 'object' && 'severity' in detailsOrOptions) {
      const options = detailsOrOptions as AppErrorOptions
      this.details = options.details
      this.severity = options.severity ?? 'error'
      this.causes = options.causes ?? []
      this.solutions = options.solutions ?? []
      this.context = options.context
      this.documentationUrl = options.documentationUrl
    } else {
      // Backward compatibility: treat as details
      this.details = detailsOrOptions
      this.severity = 'error'
      this.causes = []
      this.solutions = []
    }
    
    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Converts the error to a standardized API response format
   * (Backward compatible)
   */
  toJSON(): ApiErrorResponse {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        details: this.details,
      },
    }
  }

  /**
   * Converts the error to an enhanced JSON response format
   * with causes, solutions, and context
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

/**
 * Validation error - 400 Bad Request
 * Used when request data fails validation
 */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400
  readonly category: ErrorCategory = 'validation'

  constructor(message: string = '请求参数验证失败', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for validation errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'warning'
    }
  }
}

/**
 * Authentication error - 401 Unauthorized
 * Used when user is not authenticated
 */
export class AuthenticationError extends AppError {
  readonly code = 'AUTHENTICATION_ERROR'
  readonly statusCode = 401
  readonly category: ErrorCategory = 'authentication'

  constructor(message: string = '未登录', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for authentication errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'warning'
    }
  }
}

/**
 * Authorization error - 403 Forbidden
 * Used when user lacks permission for an action
 */
export class AuthorizationError extends AppError {
  readonly code = 'AUTHORIZATION_ERROR'
  readonly statusCode = 403
  readonly category: ErrorCategory = 'authorization'

  constructor(message: string = '没有权限执行此操作', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for authorization errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'warning'
    }
  }
}

/**
 * Not found error - 404 Not Found
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404
  readonly category: ErrorCategory = 'validation'

  constructor(message: string = '资源不存在', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for not found errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'warning'
    }
  }
}

/**
 * Conflict error - 409 Conflict
 * Used when there's a conflict with current state
 */
export class ConflictError extends AppError {
  readonly code = 'CONFLICT'
  readonly statusCode = 409
  readonly category: ErrorCategory = 'validation'

  constructor(message: string = '资源冲突', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for conflict errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'warning'
    }
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 * Used when client exceeds rate limits
 */
export class RateLimitError extends AppError {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  readonly statusCode = 429
  readonly category: ErrorCategory = 'validation'

  constructor(message: string = '请求过于频繁', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for rate limit errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'warning'
    }
  }
}

/**
 * Timeout error - 408 Request Timeout
 * Used when an operation times out
 */
export class TimeoutError extends AppError {
  readonly code = 'EXECUTION_TIMEOUT'
  readonly statusCode = 408
  readonly category: ErrorCategory = 'network'

  constructor(message: string = '操作超时', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
  }
}

/**
 * Internal error - 500 Internal Server Error
 * Used for unexpected server errors
 */
export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR'
  readonly statusCode = 500
  readonly category: ErrorCategory = 'internal'

  constructor(message: string = '服务器内部错误', detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
    // Set default severity for internal errors
    if (!this.severity || this.severity === 'error') {
      (this as { severity: ErrorSeverity }).severity = 'critical'
    }
  }
}

/**
 * Business logic error - 422 Unprocessable Entity
 * Used when business rules prevent an operation
 */
export class BusinessError extends AppError {
  readonly code = 'BUSINESS_ERROR'
  readonly statusCode = 422
  readonly category: ErrorCategory = 'validation'

  constructor(message: string, detailsOrOptions?: unknown | AppErrorOptions) {
    super(message, detailsOrOptions)
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Helper to create a validation error with field details
 */
export function createValidationError(
  fields: Array<{ field: string; message: string }>
): ValidationError {
  return new ValidationError('请求参数验证失败', fields)
}

/**
 * Helper to create a validation error with enhanced options
 */
export function createEnhancedValidationError(
  message: string,
  options: AppErrorOptions
): ValidationError {
  return new ValidationError(message, options)
}

/**
 * Helper to create an authentication error with enhanced options
 */
export function createEnhancedAuthenticationError(
  message: string,
  options: AppErrorOptions
): AuthenticationError {
  return new AuthenticationError(message, options)
}

/**
 * Helper to create an authorization error with enhanced options
 */
export function createEnhancedAuthorizationError(
  message: string,
  options: AppErrorOptions
): AuthorizationError {
  return new AuthorizationError(message, options)
}

/**
 * Helper to create an internal error with enhanced options
 */
export function createEnhancedInternalError(
  message: string,
  options: AppErrorOptions
): InternalError {
  return new InternalError(message, options)
}

/**
 * Converts any error to an AppError
 * Useful for normalizing errors from external sources
 */
export function normalizeToAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }
  
  if (error instanceof Error) {
    return new InternalError(error.message, { details: { originalError: error.name } })
  }
  
  return new InternalError(String(error))
}

// ============================================================================
// Re-export EnhancedAppError for convenience
// ============================================================================

// Import EnhancedAppError for type checking
import { EnhancedAppError } from './enhanced-errors'

/**
 * Type guard to check if an error is an EnhancedAppError
 */
export function isEnhancedAppError(error: unknown): error is EnhancedAppError {
  return error instanceof EnhancedAppError
}

/**
 * Converts any error to an EnhancedAppError or AppError
 * Prefers EnhancedAppError if the error is already enhanced
 */
export function normalizeError(error: unknown): AppError | EnhancedAppError {
  if (isEnhancedAppError(error)) {
    return error
  }
  
  if (isAppError(error)) {
    return error
  }
  
  if (error instanceof Error) {
    return new InternalError(error.message, { 
      details: { originalError: error.name },
      severity: 'error'
    })
  }
  
  return new InternalError(String(error))
}

/**
 * Gets the HTTP status code for an error
 */
export function getErrorStatusCode(error: unknown): number {
  if (isEnhancedAppError(error) || isAppError(error)) {
    return (error as AppError).statusCode
  }
  return 500
}

/**
 * Gets the error code for an error
 */
export function getErrorCode(error: unknown): string {
  if (isEnhancedAppError(error) || isAppError(error)) {
    return (error as AppError).code
  }
  if (error instanceof Error) {
    return 'INTERNAL_ERROR'
  }
  return 'UNKNOWN_ERROR'
}

/**
 * Gets the error category for an error
 */
export function getErrorCategory(error: unknown): ErrorCategory {
  if (isEnhancedAppError(error) || isAppError(error)) {
    return (error as AppError).category
  }
  return 'internal'
}

/**
 * Gets the error severity for an error
 */
export function getErrorSeverity(error: unknown): ErrorSeverity {
  if (isEnhancedAppError(error) || isAppError(error)) {
    return (error as AppError).severity
  }
  return 'error'
}
