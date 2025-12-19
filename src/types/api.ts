/**
 * API Response Type Definitions
 * 
 * Provides explicit type interfaces for all API responses,
 * ensuring type safety across the application.
 * 
 * Requirements: 9.3
 */

/**
 * Base API response interface
 */
export interface ApiBaseResponse {
  success: boolean
}

/**
 * Successful API response with typed data
 */
export interface ApiSuccessResponse<T> extends ApiBaseResponse {
  success: true
  data: T
}

/**
 * Error details for validation failures
 */
export interface ValidationErrorDetail {
  field: string
  message: string
}

/**
 * Error object structure
 */
export interface ApiError {
  message: string
  code?: string
  details?: unknown
}

/**
 * Error API response
 */
export interface ApiErrorResponse extends ApiBaseResponse {
  success: false
  error: ApiError
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * Paginated API response with typed data array
 */
export interface PaginatedResponse<T> extends ApiSuccessResponse<T[]> {
  pagination: PaginationMeta
}

/**
 * Generic API response union type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Paginated API response union type
 */
export type PaginatedApiResponse<T> = PaginatedResponse<T> | ApiErrorResponse

/**
 * Rate limit headers interface
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': number
  'X-RateLimit-Remaining': number
  'X-RateLimit-Reset': number
}

/**
 * List query parameters interface
 */
export interface ListQueryParams {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Workflow list query parameters
 */
export interface WorkflowListQueryParams extends ListQueryParams {
  category?: string
  isActive?: boolean
}

/**
 * Execution list query parameters
 */
export interface ExecutionListQueryParams extends ListQueryParams {
  status?: string
  workflowId?: string
  startDate?: string
  endDate?: string
}

/**
 * Created resource response (201)
 */
export interface CreatedResponse<T> extends ApiSuccessResponse<T> {
  // Inherits success: true and data: T
}

/**
 * Deleted resource response
 */
export interface DeletedResponse {
  success: true
  data: {
    deleted: true
    id: string
  }
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  success: true
  data: {
    succeeded: number
    failed: number
    errors?: Array<{
      id: string
      error: string
    }>
  }
}
