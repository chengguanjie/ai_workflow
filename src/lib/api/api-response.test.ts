import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { ApiResponse, PaginationMeta, PaginatedResponse, ApiSuccessResponse } from './api-response'
import { ApiErrorResponse } from '@/lib/errors'

/**
 * **Feature: project-optimization, Property 7: Pagination Metadata Consistency**
 * **Validates: Requirements 4.1, 4.2**
 * 
 * For any paginated API response, the pagination metadata SHALL satisfy:
 * `totalPages = ceil(total / pageSize)` and `page <= totalPages` 
 * (or data is empty when page > totalPages).
 */
describe('Property 7: Pagination Metadata Consistency', () => {
  // Arbitrary for generating valid pagination parameters
  const paginationParamsArb = fc.record({
    page: fc.integer({ min: 1, max: 1000 }),
    pageSize: fc.integer({ min: 1, max: 100 }),
    total: fc.integer({ min: 0, max: 100000 }),
  })

  // Arbitrary for generating sample data items
  const dataItemArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
  })

  it('totalPages should equal ceil(total / pageSize)', async () => {
    await fc.assert(
      fc.asyncProperty(
        paginationParamsArb,
        fc.array(dataItemArb, { minLength: 0, maxLength: 20 }),
        async (pagination, data) => {
          const response = ApiResponse.paginated(data, pagination)
          const json = await response.json() as PaginatedResponse<typeof data[0]>

          const expectedTotalPages = Math.ceil(pagination.total / pagination.pageSize)
          expect(json.pagination.totalPages).toBe(expectedTotalPages)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('pagination metadata should include all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        paginationParamsArb,
        fc.array(dataItemArb, { minLength: 0, maxLength: 20 }),
        async (pagination, data) => {
          const response = ApiResponse.paginated(data, pagination)
          const json = await response.json() as PaginatedResponse<typeof data[0]>

          // Verify all required pagination fields are present
          expect(json.pagination).toBeDefined()
          expect(typeof json.pagination.page).toBe('number')
          expect(typeof json.pagination.pageSize).toBe('number')
          expect(typeof json.pagination.total).toBe('number')
          expect(typeof json.pagination.totalPages).toBe('number')

          // Verify values match input
          expect(json.pagination.page).toBe(pagination.page)
          expect(json.pagination.pageSize).toBe(pagination.pageSize)
          expect(json.pagination.total).toBe(pagination.total)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('totalPages should be 0 when total is 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        async (page, pageSize) => {
          const response = ApiResponse.paginated([], { page, pageSize, total: 0 })
          const json = await response.json() as PaginatedResponse<unknown>

          expect(json.pagination.totalPages).toBe(0)
          expect(json.pagination.total).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('response should always have success: true for paginated responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        paginationParamsArb,
        fc.array(dataItemArb, { minLength: 0, maxLength: 20 }),
        async (pagination, data) => {
          const response = ApiResponse.paginated(data, pagination)
          const json = await response.json() as PaginatedResponse<typeof data[0]>

          expect(json.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('data array should be preserved in response', async () => {
    await fc.assert(
      fc.asyncProperty(
        paginationParamsArb,
        fc.array(dataItemArb, { minLength: 0, maxLength: 20 }),
        async (pagination, data) => {
          const response = ApiResponse.paginated(data, pagination)
          const json = await response.json() as PaginatedResponse<typeof data[0]>

          expect(json.data).toEqual(data)
          expect(Array.isArray(json.data)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('totalPages calculation should handle edge cases correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (pageSize) => {
          // Test exact division
          const exactTotal = pageSize * 5
          const exactResponse = ApiResponse.paginated([], { page: 1, pageSize, total: exactTotal })
          const exactJson = await exactResponse.json() as PaginatedResponse<unknown>
          expect(exactJson.pagination.totalPages).toBe(5)

          // Test with remainder
          const remainderTotal = pageSize * 5 + 1
          const remainderResponse = ApiResponse.paginated([], { page: 1, pageSize, total: remainderTotal })
          const remainderJson = await remainderResponse.json() as PaginatedResponse<unknown>
          expect(remainderJson.pagination.totalPages).toBe(6)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Helper function to normalize -0 to 0 for JSON comparison
// JSON.stringify converts -0 to "0", so we need to handle this edge case
function normalizeNegativeZero(value: unknown): unknown {
  if (typeof value === 'number' && Object.is(value, -0)) {
    return 0
  }
  if (Array.isArray(value)) {
    return value.map(normalizeNegativeZero)
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = normalizeNegativeZero(v)
    }
    return result
  }
  return value
}

// Helper function to remove dangerous properties that shouldn't be in JSON
function sanitizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue)
  }
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    // Skip dangerous properties
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      continue
    }
    result[k] = sanitizeJsonValue(v)
  }
  return result
}

describe('ApiResponse.success', () => {
  it('should return success: true with data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue(),
        async (rawData) => {
          // Sanitize the data to remove dangerous properties
          const data = sanitizeJsonValue(rawData)
          const response = ApiResponse.success(data)
          const json = await response.json() as ApiSuccessResponse<typeof data>

          expect(json.success).toBe(true)
          // Normalize -0 to 0 since JSON.stringify converts -0 to "0"
          expect(json.data).toEqual(normalizeNegativeZero(data))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should use default status 200', () => {
    const response = ApiResponse.success({ test: true })
    expect(response.status).toBe(200)
  })

  it('should allow custom status codes', () => {
    // Exclude 204 as it cannot have a body with NextResponse.json
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 203 }),
        (status) => {
          const response = ApiResponse.success({ test: true }, status)
          expect(response.status).toBe(status)
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('ApiResponse.error', () => {
  it('should return success: false with error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (message) => {
          const response = ApiResponse.error(message)
          const json = await response.json() as ApiErrorResponse

          expect(json.success).toBe(false)
          expect(json.error.message).toBe(message)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should use default status 500', () => {
    const response = ApiResponse.error('Test error')
    expect(response.status).toBe(500)
  })

  it('should allow custom status codes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        (status) => {
          const response = ApiResponse.error('Test error', status)
          expect(response.status).toBe(status)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should include details when provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
        async (message, details) => {
          const response = ApiResponse.error(message, 400, details)
          const json = await response.json() as ApiErrorResponse

          expect(json.error.details).toEqual(details)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not include details field when undefined', async () => {
    const response = ApiResponse.error('Test error', 400)
    const json = await response.json() as ApiErrorResponse

    expect('details' in json.error).toBe(false)
  })
})

describe('ApiResponse.created', () => {
  it('should return status 201 with data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1 }),
        }),
        async (data) => {
          const response = ApiResponse.created(data)
          const json = await response.json() as ApiSuccessResponse<typeof data>

          expect(response.status).toBe(201)
          expect(json.success).toBe(true)
          expect(json.data).toEqual(data)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('ApiResponse.noContent', () => {
  it('should return status 204 with no body', () => {
    const response = ApiResponse.noContent()

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })
})
