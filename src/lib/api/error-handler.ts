/**
 * Global API Error Handler
 * 
 * Provides centralized error handling for all API routes.
 * Converts various error types to standardized API responses.
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import {
  AppError,
  ApiErrorResponse,
  ValidationError,
  InternalError,
} from '@/lib/errors'

/**
 * Handles API errors and returns standardized error responses
 * 
 * @param error - The error to handle
 * @returns NextResponse with appropriate status code and error body
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  // Log error for debugging (in production, use proper logging service)
  console.error('[API Error]', error)

  // Handle AppError instances (our custom error types)
  if (error instanceof AppError) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode })
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    // Zod v4 uses 'issues' instead of 'errors'
    const issues = error.issues || []
    const validationError = new ValidationError(
      '请求参数验证失败',
      issues.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }))
    )
    return NextResponse.json(validationError.toJSON(), { status: 400 })
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    // In development, include the error message
    // In production, use a generic message to avoid leaking internal details
    const isDev = process.env.NODE_ENV === 'development'
    const internalError = new InternalError(
      isDev ? error.message : '服务器内部错误'
    )
    return NextResponse.json(internalError.toJSON(), { status: 500 })
  }

  // Handle unknown error types
  const unknownError = new InternalError('服务器内部错误')
  return NextResponse.json(unknownError.toJSON(), { status: 500 })
}

/**
 * Wraps an async API handler with error handling
 * 
 * @param handler - The async handler function to wrap
 * @returns A wrapped handler that catches and handles errors
 */
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | ApiErrorResponse>> {
  return handler().catch((error: unknown) => handleApiError(error))
}

/**
 * Type-safe wrapper for API route handlers with automatic error handling
 * 
 * @param handler - The route handler function
 * @returns A wrapped handler with error handling
 */
export function createApiHandler<TRequest, TResponse>(
  handler: (request: TRequest) => Promise<NextResponse<TResponse>>
): (request: TRequest) => Promise<NextResponse<TResponse | ApiErrorResponse>> {
  return async (request: TRequest) => {
    try {
      return await handler(request)
    } catch (error) {
      return handleApiError(error)
    }
  }
}
