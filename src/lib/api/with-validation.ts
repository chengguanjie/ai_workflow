/**
 * Validation wrapper for API route handlers
 * 
 * Provides a higher-order function that wraps API handlers with
 * Zod schema validation for request bodies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { ValidationError, ApiErrorResponse } from '@/lib/errors'
import { handleApiError } from './error-handler'

/**
 * Validation error detail for a single field
 */
export interface ValidationErrorDetail {
  field: string
  message: string
}

/**
 * Handler function type for validated routes
 */
export type ValidatedHandler<TSchema extends z.ZodType, TResponse = unknown> = (
  data: z.infer<TSchema>,
  request: NextRequest
) => Promise<NextResponse<TResponse>>

/**
 * Route handler type returned by withValidation
 */
export type ValidatedRouteHandler<TResponse = unknown> = (
  request: NextRequest
) => Promise<NextResponse<TResponse | ApiErrorResponse>>

/**
 * Options for withValidation
 */
export interface WithValidationOptions {
  /**
   * Source of data to validate
   * - 'body': Parse JSON body (default for POST, PUT, PATCH)
   * - 'query': Parse URL search params
   * - 'auto': Automatically choose based on HTTP method
   */
  source?: 'body' | 'query' | 'auto'
}

/**
 * Converts Zod error to validation error details
 */
function zodErrorToDetails(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }))
}

/**
 * Parses search params into a plain object
 */
function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    obj[key] = value
  })
  return obj
}

/**
 * Wraps an API route handler with Zod schema validation
 * 
 * This higher-order function:
 * 1. Extracts data from request body or query params
 * 2. Validates the data against the provided Zod schema
 * 3. Passes validated data to the handler
 * 4. Returns detailed validation errors if validation fails
 * 
 * @param schema - The Zod schema to validate against
 * @param handler - The handler function that receives validated data
 * @param options - Validation options
 * @returns A wrapped route handler with validation
 * 
 * @example
 * ```typescript
 * const createSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * })
 * 
 * export const POST = withValidation(
 *   createSchema,
 *   async (data, request) => {
 *     // data is typed and validated
 *     const user = await createUser(data)
 *     return ApiResponse.created(user)
 *   }
 * )
 * ```
 */
export function withValidation<TSchema extends z.ZodType, TResponse = unknown>(
  schema: TSchema,
  handler: ValidatedHandler<TSchema, TResponse>,
  options: WithValidationOptions = {}
): ValidatedRouteHandler<TResponse> {
  return async (request: NextRequest): Promise<NextResponse<TResponse | ApiErrorResponse>> => {
    try {
      const { source = 'auto' } = options
      
      // Determine data source based on option or HTTP method
      let rawData: unknown
      const method = request.method.toUpperCase()
      const shouldUseBody = source === 'body' || 
        (source === 'auto' && ['POST', 'PUT', 'PATCH'].includes(method))
      
      if (shouldUseBody) {
        // Parse JSON body
        try {
          rawData = await request.json()
        } catch {
          throw new ValidationError('请求体格式无效', [
            { field: 'body', message: '无法解析 JSON 请求体' }
          ])
        }
      } else {
        // Parse query params
        rawData = searchParamsToObject(request.nextUrl.searchParams)
      }

      // Validate data against schema
      const result = schema.safeParse(rawData)
      
      if (!result.success) {
        const details = zodErrorToDetails(result.error)
        throw new ValidationError('请求参数验证失败', details)
      }

      // Call handler with validated data
      return await handler(result.data, request)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

/**
 * Creates a validation wrapper that can be composed with other wrappers
 * 
 * @param schema - The Zod schema to validate against
 * @param options - Validation options
 * @returns A function that wraps handlers with validation
 */
export function createValidationWrapper<TSchema extends z.ZodType>(
  schema: TSchema,
  options: WithValidationOptions = {}
) {
  return <TResponse>(handler: ValidatedHandler<TSchema, TResponse>) => 
    withValidation(schema, handler, options)
}

/**
 * Validates request body against a schema and returns the result
 * Useful for manual validation in handlers
 * 
 * @param request - The NextRequest to validate
 * @param schema - The Zod schema to validate against
 * @returns Validated data or throws ValidationError
 */
export async function validateRequestBody<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  let rawData: unknown
  
  try {
    rawData = await request.json()
  } catch {
    throw new ValidationError('请求体格式无效', [
      { field: 'body', message: '无法解析 JSON 请求体' }
    ])
  }

  const result = schema.safeParse(rawData)
  
  if (!result.success) {
    const details = zodErrorToDetails(result.error)
    throw new ValidationError('请求参数验证失败', details)
  }

  return result.data
}

/**
 * Validates query params against a schema and returns the result
 * Useful for manual validation in handlers
 * 
 * @param request - The NextRequest to validate
 * @param schema - The Zod schema to validate against
 * @returns Validated data or throws ValidationError
 */
export function validateQueryParams<TSchema extends z.ZodType>(
  request: NextRequest,
  schema: TSchema
): z.infer<TSchema> {
  const rawData = searchParamsToObject(request.nextUrl.searchParams)
  const result = schema.safeParse(rawData)
  
  if (!result.success) {
    const details = zodErrorToDetails(result.error)
    throw new ValidationError('请求参数验证失败', details)
  }

  return result.data
}
