/**
 * Error Handling Middleware
 * 
 * Provides unified error handling for API routes with enhanced error responses,
 * automatic request ID generation, timestamps, and error logging.
 * 
 * @module api/error-middleware
 * 
 * Requirements: 3.1, 3.4, 10.1, 10.2
 */

import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import {
  EnhancedErrorResponse,
  EnhancedErrorDetails,
  ErrorContext,
  ErrorSeverity,
} from '@/lib/errors/types'
import {
  EnhancedAppError,
  DatabaseError,
  ExternalServiceError,
  FileOperationError,
  WorkflowExecutionError,
} from '@/lib/errors/enhanced-errors'
import { AppError } from '@/lib/errors'
import { getCatalogEntry } from '@/lib/errors/catalog'
import {
  sanitizeErrorMessage,
  sanitizeErrorContext,
} from '@/lib/errors/sanitizer'
import {
  logError as logErrorToService,
  ErrorLogEntry,
  RequestDetails,
} from '@/lib/errors/logger'
import { generateRequestId, getSeverityFromStatusCode } from './enhanced-api-response'

// ============================================================================
// Types
// ============================================================================

/**
 * API route handler type
 */
export type ApiRouteHandler<T = unknown> = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse<T>>

// Re-export ErrorLogEntry for backward compatibility
export type { ErrorLogEntry }

// ============================================================================
// Error Logger Integration
// ============================================================================

/**
 * Logs an error using the centralized error logger service.
 * 
 * @param entry - The error log entry
 */
async function logError(entry: ErrorLogEntry): Promise<void> {
  await logErrorToService(entry)
}

// ============================================================================
// Error Normalization
// ============================================================================

/**
 * Normalizes any error to an EnhancedAppError or creates appropriate response.
 */
function normalizeError(
  error: unknown,
  requestId: string
): { response: EnhancedErrorResponse; statusCode: number; severity: ErrorSeverity } {
  // Handle EnhancedAppError
  if (error instanceof EnhancedAppError) {
    return normalizeEnhancedAppError(error, requestId)
  }
  
  // Handle ZodError (validation errors)
  if (error instanceof ZodError) {
    return normalizeZodError(error, requestId)
  }
  
  // Handle legacy AppError
  if (error instanceof AppError) {
    return normalizeAppError(error, requestId)
  }
  
  // Handle standard Error
  if (error instanceof Error) {
    return normalizeStandardError(error, requestId)
  }
  
  // Handle unknown error types
  return normalizeUnknownError(requestId)
}

/**
 * Normalizes an EnhancedAppError.
 */
function normalizeEnhancedAppError(
  error: EnhancedAppError,
  requestId: string
): { response: EnhancedErrorResponse; statusCode: number; severity: ErrorSeverity } {
  const catalogEntry = getCatalogEntry(error.code)
  
  const causes = error.causes.length > 0 
    ? error.causes 
    : (catalogEntry?.causes ?? [])
  
  const solutions = error.solutions.length > 0 
    ? error.solutions 
    : (catalogEntry?.solutions ?? [])
  
  const sanitizedMessage = sanitizeErrorMessage(error.message)
  const sanitizedContext = error.context 
    ? sanitizeErrorContext(error.context) 
    : undefined
  
  const errorDetails: EnhancedErrorDetails = {
    code: error.code,
    message: sanitizedMessage,
    causes,
    solutions,
    requestId,
    timestamp: new Date().toISOString(),
    severity: error.severity,
  }
  
  if (sanitizedContext) {
    errorDetails.context = sanitizedContext
  }
  
  if (error.documentationUrl) {
    errorDetails.documentationUrl = error.documentationUrl
  }
  
  return {
    response: { success: false, error: errorDetails },
    statusCode: error.statusCode,
    severity: error.severity,
  }
}

/**
 * Normalizes a ZodError to enhanced format.
 */
function normalizeZodError(
  error: ZodError,
  requestId: string
): { response: EnhancedErrorResponse; statusCode: number; severity: ErrorSeverity } {
  const fieldErrors = error.issues.map(issue => ({
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
    context: { fieldErrors },
    requestId,
    timestamp: new Date().toISOString(),
    severity: 'warning',
  }
  
  return {
    response: { success: false, error: errorDetails },
    statusCode: 400,
    severity: 'warning',
  }
}

/**
 * Normalizes a legacy AppError to enhanced format.
 */
function normalizeAppError(
  error: AppError,
  requestId: string
): { response: EnhancedErrorResponse; statusCode: number; severity: ErrorSeverity } {
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
  
  return {
    response: { success: false, error: errorDetails },
    statusCode: error.statusCode,
    severity,
  }
}

/**
 * Normalizes a standard Error to enhanced format.
 */
function normalizeStandardError(
  error: Error,
  requestId: string
): { response: EnhancedErrorResponse; statusCode: number; severity: ErrorSeverity } {
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
  
  return {
    response: { success: false, error: errorDetails },
    statusCode: 500,
    severity: 'error',
  }
}

/**
 * Normalizes an unknown error to enhanced format.
 */
function normalizeUnknownError(
  requestId: string
): { response: EnhancedErrorResponse; statusCode: number; severity: ErrorSeverity } {
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
  
  return {
    response: { success: false, error: errorDetails },
    statusCode: 500,
    severity: 'error',
  }
}

// ============================================================================
// Request Context Extraction
// ============================================================================

/**
 * Extracts request context for logging.
 */
function extractRequestContext(request: NextRequest): RequestDetails {
  return {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      ?? request.headers.get('x-real-ip') 
      ?? undefined,
  }
}

// ============================================================================
// Main Middleware
// ============================================================================

/**
 * Wraps an API route handler with enhanced error handling.
 * 
 * Features:
 * - Automatic request ID generation
 * - Unified error response format
 * - Error logging with full context
 * - Sensitive data sanitization
 * - Critical error alerting
 * 
 * @param handler - The API route handler to wrap
 * @returns Wrapped handler with error handling
 * 
 * @example
 * ```typescript
 * export const GET = withErrorHandler(async (request) => {
 *   // Your route logic here
 *   return ApiResponse.success(data)
 * })
 * ```
 */
export function withErrorHandler<T>(
  handler: ApiRouteHandler<T>
): ApiRouteHandler<T | EnhancedErrorResponse> {
  return async (
    request: NextRequest,
    context?: { params?: Record<string, string> }
  ): Promise<NextResponse<T | EnhancedErrorResponse>> => {
    const requestId = generateRequestId()
    const timestamp = new Date().toISOString()
    
    try {
      // Execute the handler
      const response = await handler(request, context)
      
      // Add request ID to successful responses via header
      response.headers.set('X-Request-ID', requestId)
      
      return response
    } catch (error) {
      // Normalize the error
      const { response, statusCode, severity } = normalizeError(error, requestId)
      
      // Create log entry
      const logEntry: ErrorLogEntry = {
        requestId,
        timestamp,
        severity,
        code: response.error.code,
        message: response.error.message,
        stack: error instanceof Error ? error.stack : undefined,
        context: response.error.context,
        request: extractRequestContext(request),
      }
      
      // Log the error
      logError(logEntry)
      
      // Return the error response
      const nextResponse = NextResponse.json(response, { status: statusCode })
      nextResponse.headers.set('X-Request-ID', requestId)
      
      return nextResponse
    }
  }
}

/**
 * Creates an error handler with custom user context extraction.
 * 
 * @param getUserContext - Function to extract user context from request
 * @returns Error handler wrapper function
 * 
 * @example
 * ```typescript
 * const withAuthErrorHandler = createErrorHandler(async (request) => {
 *   const session = await auth()
 *   return {
 *     userId: session?.user?.id,
 *     organizationId: session?.user?.organizationId,
 *   }
 * })
 * 
 * export const GET = withAuthErrorHandler(async (request) => {
 *   // Your route logic here
 * })
 * ```
 */
export function createErrorHandler(
  getUserContext?: (request: NextRequest) => Promise<{ userId?: string; organizationId?: string }>
) {
  return function withCustomErrorHandler<T>(
    handler: ApiRouteHandler<T>
  ): ApiRouteHandler<T | EnhancedErrorResponse> {
    return async (
      request: NextRequest,
      context?: { params?: Record<string, string> }
    ): Promise<NextResponse<T | EnhancedErrorResponse>> => {
      const requestId = generateRequestId()
      const timestamp = new Date().toISOString()
      
      // Extract user context if available
      let userContext: { userId?: string; organizationId?: string } = {}
      if (getUserContext) {
        try {
          userContext = await getUserContext(request)
        } catch {
          // Ignore errors in user context extraction
        }
      }
      
      try {
        const response = await handler(request, context)
        response.headers.set('X-Request-ID', requestId)
        return response
      } catch (error) {
        const { response, statusCode, severity } = normalizeError(error, requestId)
        
        // Enhance context with user info
        if (response.error.context) {
          response.error.context.userId = userContext.userId
          response.error.context.organizationId = userContext.organizationId
        } else if (userContext.userId || userContext.organizationId) {
          response.error.context = {
            userId: userContext.userId,
            organizationId: userContext.organizationId,
          }
        }
        
        const logEntry: ErrorLogEntry = {
          requestId,
          timestamp,
          severity,
          code: response.error.code,
          message: response.error.message,
          stack: error instanceof Error ? error.stack : undefined,
          context: response.error.context,
          request: extractRequestContext(request),
          userId: userContext.userId,
          organizationId: userContext.organizationId,
        }
        
        logError(logEntry)
        
        const nextResponse = NextResponse.json(response, { status: statusCode })
        nextResponse.headers.set('X-Request-ID', requestId)
        
        return nextResponse
      }
    }
  }
}

/**
 * Handles an error and returns an enhanced error response.
 * Useful for manual error handling within route handlers.
 * 
 * @param error - The error to handle
 * @param request - The request object for context
 * @returns NextResponse with enhanced error format
 * 
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   try {
 *     // Your logic here
 *   } catch (error) {
 *     return handleError(error, request)
 *   }
 * }
 * ```
 */
export function handleError(
  error: unknown,
  request: NextRequest
): NextResponse<EnhancedErrorResponse> {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()
  
  const { response, statusCode, severity } = normalizeError(error, requestId)
  
  const logEntry: ErrorLogEntry = {
    requestId,
    timestamp,
    severity,
    code: response.error.code,
    message: response.error.message,
    stack: error instanceof Error ? error.stack : undefined,
    context: response.error.context,
    request: extractRequestContext(request),
  }
  
  logError(logEntry)
  
  const nextResponse = NextResponse.json(response, { status: statusCode })
  nextResponse.headers.set('X-Request-ID', requestId)
  
  return nextResponse
}

// ============================================================================
// Exports
// ============================================================================

export {
  DatabaseError,
  ExternalServiceError,
  FileOperationError,
  WorkflowExecutionError,
}
