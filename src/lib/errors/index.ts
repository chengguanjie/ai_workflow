/**
 * Error handling infrastructure for AI Workflow
 * 
 * Provides a hierarchy of typed error classes for consistent error handling
 * across the application.
 */

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
 * Base application error class
 * All custom errors should extend this class
 */
export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.details = details
    
    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Converts the error to a standardized API response format
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
}

/**
 * Validation error - 400 Bad Request
 * Used when request data fails validation
 */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400

  constructor(message: string = '请求参数验证失败', details?: unknown) {
    super(message, details)
  }
}

/**
 * Authentication error - 401 Unauthorized
 * Used when user is not authenticated
 */
export class AuthenticationError extends AppError {
  readonly code = 'AUTHENTICATION_ERROR'
  readonly statusCode = 401

  constructor(message: string = '未登录', details?: unknown) {
    super(message, details)
  }
}

/**
 * Authorization error - 403 Forbidden
 * Used when user lacks permission for an action
 */
export class AuthorizationError extends AppError {
  readonly code = 'AUTHORIZATION_ERROR'
  readonly statusCode = 403

  constructor(message: string = '没有权限执行此操作', details?: unknown) {
    super(message, details)
  }
}

/**
 * Not found error - 404 Not Found
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404

  constructor(message: string = '资源不存在', details?: unknown) {
    super(message, details)
  }
}

/**
 * Conflict error - 409 Conflict
 * Used when there's a conflict with current state
 */
export class ConflictError extends AppError {
  readonly code = 'CONFLICT'
  readonly statusCode = 409

  constructor(message: string = '资源冲突', details?: unknown) {
    super(message, details)
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 * Used when client exceeds rate limits
 */
export class RateLimitError extends AppError {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  readonly statusCode = 429

  constructor(message: string = '请求过于频繁', details?: unknown) {
    super(message, details)
  }
}

/**
 * Timeout error - 408 Request Timeout
 * Used when an operation times out
 */
export class TimeoutError extends AppError {
  readonly code = 'EXECUTION_TIMEOUT'
  readonly statusCode = 408

  constructor(message: string = '操作超时', details?: unknown) {
    super(message, details)
  }
}

/**
 * Internal error - 500 Internal Server Error
 * Used for unexpected server errors
 */
export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR'
  readonly statusCode = 500

  constructor(message: string = '服务器内部错误', details?: unknown) {
    super(message, details)
  }
}

/**
 * Business logic error - 422 Unprocessable Entity
 * Used when business rules prevent an operation
 */
export class BusinessError extends AppError {
  readonly code = 'BUSINESS_ERROR'
  readonly statusCode = 422

  constructor(message: string, details?: unknown) {
    super(message, details)
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
