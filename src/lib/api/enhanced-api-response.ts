/**
 * Enhanced API Response Module
 * 
 * Extends the base ApiResponse class with enhanced error handling capabilities,
 * including error causes, solutions, context, and sensitive data sanitization.
 * 
 * @module api/enhanced-api-response
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ApiResponse } from './api-response'
import {
  EnhancedErrorResponse,
  EnhancedErrorDetails,
  ErrorContext,
  ErrorSeverity,
  FieldError,
  ErrorCause,
  ErrorSolution,
} from '@/lib/errors/types'
import {
  EnhancedAppError,

} from '@/lib/errors/enhanced-errors'
import {
  getCatalogEntry,
  getCausesForError,
  getSolutionsForError,
} from '@/lib/errors/catalog'
import {
  sanitizeErrorMessage,
  sanitizeErrorContext,
} from '@/lib/errors/sanitizer'
import { AppError } from '@/lib/errors'

// ============================================================================
// Request ID Generation
// ============================================================================

/**
 * Generates a unique request ID for tracking purposes.
 * Uses a combination of timestamp and random characters for uniqueness.
 * 
 * @returns A unique request ID string
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart1 = Math.random().toString(36).substring(2, 8)
  const randomPart2 = Math.random().toString(36).substring(2, 6)
  return `req_${timestamp}_${randomPart1}${randomPart2}`
}

// ============================================================================
// Severity Determination
// ============================================================================

/**
 * Determines the severity level based on HTTP status code.
 * 
 * @param statusCode - The HTTP status code
 * @returns The appropriate severity level
 */
export function getSeverityFromStatusCode(statusCode: number): ErrorSeverity {
  if (statusCode >= 500) {
    return statusCode === 503 ? 'critical' : 'error'
  }
  if (statusCode >= 400) {
    return statusCode === 401 || statusCode === 403 ? 'warning' : 'warning'
  }
  return 'info'
}

/**
 * Determines the severity level based on error code.
 * 
 * @param code - The error code
 * @returns The appropriate severity level
 */
export function getSeverityFromErrorCode(code: string): ErrorSeverity {
  const catalogEntry = getCatalogEntry(code)
  if (catalogEntry) {
    return catalogEntry.severity
  }

  // Default severity based on error code patterns
  if (code.includes('CRITICAL') || code.includes('CONNECTION')) {
    return 'critical'
  }
  if (code.includes('INTERNAL') || code.includes('DATABASE')) {
    return 'error'
  }
  if (code.includes('VALIDATION') || code.includes('AUTH')) {
    return 'warning'
  }
  return 'error'
}

// ============================================================================
// Enhanced API Response Class
// ============================================================================

/**
 * Enhanced API Response class that extends the base ApiResponse
 * with additional error handling capabilities.
 */
export class EnhancedApiResponse extends ApiResponse {
  /**
   * Creates an enhanced error response from an EnhancedAppError.
   * 
   * @param error - The enhanced error to convert
   * @param requestId - Optional request ID (will be generated if not provided)
   * @returns NextResponse with enhanced error format
   */
  static enhancedError(
    error: EnhancedAppError,
    requestId?: string
  ): NextResponse<EnhancedErrorResponse> {
    const reqId = requestId || generateRequestId()

    // Get causes and solutions from catalog if not provided
    let causes = error.causes
    let solutions = error.solutions

    if (causes.length === 0) {
      causes = getCausesForError(error.code)
    }
    if (solutions.length === 0) {
      solutions = getSolutionsForError(error.code)
    }

    // Sanitize the error message and context
    const sanitizedMessage = sanitizeErrorMessage(error.message)
    const sanitizedContext = error.context
      ? sanitizeErrorContext(error.context)
      : undefined

    const errorDetails: EnhancedErrorDetails = {
      code: error.code,
      message: sanitizedMessage,
      causes,
      solutions,
      requestId: reqId,
      timestamp: new Date().toISOString(),
      severity: error.severity,
    }

    if (sanitizedContext) {
      errorDetails.context = sanitizedContext
    }

    if (error.documentationUrl) {
      errorDetails.documentationUrl = error.documentationUrl
    }

    return NextResponse.json(
      {
        success: false as const,
        error: errorDetails,
      },
      { status: error.statusCode }
    )
  }

  /**
   * Creates an enhanced error response from any error type.
   * Automatically converts various error types to the enhanced format.
   * 
   * @param error - Any error to convert
   * @param requestId - Optional request ID (will be generated if not provided)
   * @returns NextResponse with enhanced error format
   */
  static fromError(
    error: unknown,
    requestId?: string
  ): NextResponse<EnhancedErrorResponse> {
    const reqId = requestId || generateRequestId()

    // Handle EnhancedAppError
    if (error instanceof EnhancedAppError) {
      return EnhancedApiResponse.enhancedError(error, reqId)
    }

    // Handle ZodError (validation errors)
    if (error instanceof ZodError) {
      return EnhancedApiResponse.fromZodError(error, reqId)
    }

    // Handle AppError (legacy errors)
    if (error instanceof AppError) {
      return EnhancedApiResponse.fromAppError(error, reqId)
    }

    // Handle standard Error
    if (error instanceof Error) {
      return EnhancedApiResponse.fromStandardError(error, reqId)
    }

    // Handle unknown error types
    return EnhancedApiResponse.fromUnknownError(error, reqId)
  }

  /**
   * Creates an enhanced error response from a Zod validation error.
   * 
   * @param error - The Zod error to convert
   * @param requestId - The request ID
   * @returns NextResponse with enhanced error format
   */
  private static fromZodError(
    error: ZodError,
    requestId: string
  ): NextResponse<EnhancedErrorResponse> {
    const fieldErrors: FieldError[] = error.issues.map(issue => ({
      field: issue.path.join('.'),
      constraint: issue.code,
      message: issue.message,
    }))

    const catalogEntry = getCatalogEntry('VALIDATION_ERROR')

    const errorDetails: EnhancedErrorDetails = {
      code: 'VALIDATION_ERROR',
      message: sanitizeErrorMessage('请求参数验证失败'),
      causes: catalogEntry?.causes ?? [
        { id: 'invalid_input', description: '输入数据不符合要求', likelihood: 'high' },
      ],
      solutions: catalogEntry?.solutions ?? [
        { id: 'check_input', description: '检查输入数据格式', actionType: 'manual' },
      ],
      context: {
        fieldErrors,
      },
      requestId,
      timestamp: new Date().toISOString(),
      severity: 'warning',
    }

    return NextResponse.json(
      {
        success: false as const,
        error: errorDetails,
      },
      { status: 400 }
    )
  }

  /**
   * Creates an enhanced error response from a legacy AppError.
   * 
   * @param error - The AppError to convert
   * @param requestId - The request ID
   * @returns NextResponse with enhanced error format
   */
  private static fromAppError(
    error: AppError,
    requestId: string
  ): NextResponse<EnhancedErrorResponse> {
    const catalogEntry = getCatalogEntry(error.code)
    const severity = catalogEntry?.severity ?? getSeverityFromStatusCode(error.statusCode)

    const errorDetails: EnhancedErrorDetails = {
      code: error.code,
      message: sanitizeErrorMessage(error.message),
      causes: catalogEntry?.causes ?? [],
      solutions: catalogEntry?.solutions ?? [],
      requestId,
      timestamp: new Date().toISOString(),
      severity,
    }

    // Include details as context if available
    if (error.details) {
      const context: ErrorContext = {}

      // Handle field errors in details
      if (Array.isArray(error.details)) {
        const fieldErrors = error.details
          .filter((d): d is { field: string; message: string } =>
            typeof d === 'object' && d !== null && 'field' in d && 'message' in d
          )
          .map(d => ({
            field: d.field,
            constraint: 'validation',
            message: d.message,
          }))

        if (fieldErrors.length > 0) {
          context.fieldErrors = fieldErrors
        }
      }

      if (Object.keys(context).length > 0) {
        errorDetails.context = sanitizeErrorContext(context)
      }
    }

    return NextResponse.json(
      {
        success: false as const,
        error: errorDetails,
      },
      { status: error.statusCode }
    )
  }

  /**
   * Creates an enhanced error response from a standard Error.
   * 
   * @param error - The standard Error to convert
   * @param requestId - The request ID
   * @returns NextResponse with enhanced error format
   */
  private static fromStandardError(
    error: Error,
    requestId: string
  ): NextResponse<EnhancedErrorResponse> {
    const isDev = process.env.NODE_ENV === 'development'
    const catalogEntry = getCatalogEntry('INTERNAL_ERROR')

    const errorDetails: EnhancedErrorDetails = {
      code: 'INTERNAL_ERROR',
      message: sanitizeErrorMessage(isDev ? error.message : '服务器内部错误'),
      causes: catalogEntry?.causes ?? [
        { id: 'unexpected_error', description: '发生意外错误', likelihood: 'high' },
      ],
      solutions: catalogEntry?.solutions ?? [
        { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
        { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
      ],
      requestId,
      timestamp: new Date().toISOString(),
      severity: 'error',
    }

    return NextResponse.json(
      {
        success: false as const,
        error: errorDetails,
      },
      { status: 500 }
    )
  }

  /**
   * Creates an enhanced error response from an unknown error type.
   * 
   * @param _error - The unknown error
   * @param requestId - The request ID
   * @returns NextResponse with enhanced error format
   */
  private static fromUnknownError(
    _error: unknown,
    requestId: string
  ): NextResponse<EnhancedErrorResponse> {
    const catalogEntry = getCatalogEntry('INTERNAL_ERROR')

    const errorDetails: EnhancedErrorDetails = {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
      causes: catalogEntry?.causes ?? [
        { id: 'unexpected_error', description: '发生意外错误', likelihood: 'high' },
      ],
      solutions: catalogEntry?.solutions ?? [
        { id: 'retry', description: '稍后重试', actionType: 'automatic', actionLabel: '重试' },
        { id: 'contact_support', description: '联系技术支持', actionType: 'link', actionUrl: '/support' },
      ],
      requestId,
      timestamp: new Date().toISOString(),
      severity: 'error',
    }

    return NextResponse.json(
      {
        success: false as const,
        error: errorDetails,
      },
      { status: 500 }
    )
  }

  /**
   * Creates a validation error response with field-specific details.
   * 
   * @param fieldErrors - Array of field errors
   * @param message - Optional custom message
   * @param requestId - Optional request ID
   * @returns NextResponse with enhanced error format
   */
  static validationError(
    fieldErrors: FieldError[],
    message: string = '请求参数验证失败',
    requestId?: string
  ): NextResponse<EnhancedErrorResponse> {
    const reqId = requestId || generateRequestId()
    const catalogEntry = getCatalogEntry('VALIDATION_ERROR')

    const errorDetails: EnhancedErrorDetails = {
      code: 'VALIDATION_ERROR',
      message: sanitizeErrorMessage(message),
      causes: catalogEntry?.causes ?? [],
      solutions: catalogEntry?.solutions ?? [],
      context: {
        fieldErrors: fieldErrors.map(fe => ({
          ...fe,
          message: sanitizeErrorMessage(fe.message),
        })),
      },
      requestId: reqId,
      timestamp: new Date().toISOString(),
      severity: 'warning',
    }

    return NextResponse.json(
      {
        success: false as const,
        error: errorDetails,
      },
      { status: 400 }
    )
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates an enhanced error response with custom causes and solutions.
 * 
 * @param options - Error response options
 * @returns NextResponse with enhanced error format
 */
export function createEnhancedErrorResponse(options: {
  code: string
  message: string
  statusCode: number
  causes?: ErrorCause[]
  solutions?: ErrorSolution[]
  context?: ErrorContext
  severity?: ErrorSeverity
  documentationUrl?: string
  requestId?: string
}): NextResponse<EnhancedErrorResponse> {
  const reqId = options.requestId || generateRequestId()
  const catalogEntry = getCatalogEntry(options.code)

  const errorDetails: EnhancedErrorDetails = {
    code: options.code,
    message: sanitizeErrorMessage(options.message),
    causes: options.causes ?? catalogEntry?.causes ?? [],
    solutions: options.solutions ?? catalogEntry?.solutions ?? [],
    requestId: reqId,
    timestamp: new Date().toISOString(),
    severity: options.severity ?? catalogEntry?.severity ?? getSeverityFromStatusCode(options.statusCode),
  }

  if (options.context) {
    errorDetails.context = sanitizeErrorContext(options.context)
  }

  if (options.documentationUrl) {
    errorDetails.documentationUrl = options.documentationUrl
  }

  return NextResponse.json(
    {
      success: false as const,
      error: errorDetails,
    },
    { status: options.statusCode }
  )
}
