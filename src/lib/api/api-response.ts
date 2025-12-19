/**
 * API Response Utilities
 * 
 * Provides standardized response formatting for all API routes.
 * Ensures consistent response structure across the application.
 */

import { NextResponse } from 'next/server'
import { ApiErrorResponse } from '@/lib/errors'

/**
 * API Success Response interface
 */
export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

/**
 * Pagination metadata interface
 */
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * Paginated response interface
 */
export interface PaginatedResponse<T> extends ApiSuccessResponse<T[]> {
  pagination: PaginationMeta
}

/**
 * ApiResponse class provides static methods for creating standardized API responses
 */
export class ApiResponse {
  /**
   * Creates a successful response with data
   * 
   * @param data - The response data
   * @param status - HTTP status code (default: 200)
   * @returns NextResponse with success format
   */
  static success<T>(data: T, status: number = 200): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json(
      {
        success: true as const,
        data,
      },
      { status }
    )
  }

  /**
   * Creates an error response
   * 
   * @param message - Error message
   * @param status - HTTP status code (default: 500)
   * @param details - Additional error details
   * @returns NextResponse with error format
   */
  static error(
    message: string,
    status: number = 500,
    details?: unknown
  ): NextResponse<ApiErrorResponse> {
    return NextResponse.json(
      {
        success: false as const,
        error: {
          message,
          ...(details !== undefined && { details }),
        },
      },
      { status }
    )
  }

  /**
   * Creates a paginated response with data and pagination metadata
   * 
   * @param data - Array of items for current page
   * @param pagination - Pagination parameters
   * @returns NextResponse with paginated format
   */
  static paginated<T>(
    data: T[],
    pagination: {
      page: number
      pageSize: number
      total: number
    }
  ): NextResponse<PaginatedResponse<T>> {
    const { page, pageSize, total } = pagination
    const totalPages = Math.ceil(total / pageSize)

    return NextResponse.json(
      {
        success: true as const,
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      },
      { status: 200 }
    )
  }

  /**
   * Creates a 201 Created response
   * 
   * @param data - The created resource data
   * @returns NextResponse with success format and 201 status
   */
  static created<T>(data: T): NextResponse<ApiSuccessResponse<T>> {
    return ApiResponse.success(data, 201)
  }

  /**
   * Creates a 204 No Content response
   * 
   * @returns NextResponse with no body and 204 status
   */
  static noContent(): NextResponse {
    return new NextResponse(null, { status: 204 })
  }
}
