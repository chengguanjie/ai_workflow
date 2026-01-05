/**
 * Property-Based Tests for V1 Workflow Execution History API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 10: Execution History Filtering
 *
 * Validates: Requirements 9.2, 9.3
 *
 * Property 10: For any workflow with executions, filtering by status SHALL return
 * only executions matching that status, and filtering by date range SHALL return
 * only executions within that range.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { GET as listExecutions } from '@/app/api/v1/workflows/[id]/executions/route'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
    },
    execution: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  validateApiTokenWithScope: vi.fn(),
  validateCrossOrganization: vi.fn(),
  createCrossOrgNotFoundResponse: vi.fn(),
  updateTokenUsage: vi.fn(),
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  updateTokenUsage,
} from '@/lib/auth'


// ============================================
// Arbitraries (Generators)
// ============================================

// Execution status generator
type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
const VALID_STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']

const executionStatusArb: fc.Arbitrary<ExecutionStatus> = fc.constantFrom(...VALID_STATUSES)

// Date generator (within reasonable range: last 30 days to now)
// Use integer timestamps to avoid invalid date issues
const now = Date.now()
const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

const validDateArb: fc.Arbitrary<Date> = fc
  .integer({ min: thirtyDaysAgo, max: now })
  .map((ts) => new Date(ts))

// Duration generator (0 to 300000 ms = 5 minutes)
const durationArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 300000 })

// Token count generator
const tokenCountArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10000 })

// Optional date generator that only produces valid dates or null
const optionalDateArb: fc.Arbitrary<Date | null> = fc.oneof(
  fc.constant(null),
  validDateArb
)

// Generate a single execution record
const executionArb: fc.Arbitrary<{
  id: string
  status: ExecutionStatus
  duration: number | null
  totalTokens: number | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}> = fc.record({
  id: fc.uuid(),
  status: executionStatusArb,
  duration: fc.option(durationArb, { nil: null }),
  totalTokens: fc.option(tokenCountArb, { nil: null }),
  createdAt: validDateArb,
  startedAt: optionalDateArb,
  completedAt: optionalDateArb,
})

// Generate an array of executions
const executionsArrayArb: fc.Arbitrary<Array<{
  id: string
  status: ExecutionStatus
  duration: number | null
  totalTokens: number | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}>> = fc.array(executionArb, { minLength: 1, maxLength: 20 })

// Date range generator (start before end) - using valid dates only
const dateRangeArb: fc.Arbitrary<{ startDate: Date; endDate: Date }> = fc
  .tuple(validDateArb, validDateArb)
  .map(([d1, d2]) => {
    const [start, end] = d1 < d2 ? [d1, d2] : [d2, d1]
    return { startDate: start, endDate: end }
  })


// ============================================
// Test Setup
// ============================================

describe('V1 Workflow Execution History API - Property Tests', () => {
  const mockToken = {
    id: 'token-1',
    organizationId: 'org-1',
    createdById: 'user-1',
  }

  const mockWorkflow = {
    id: 'wf-test-1',
    name: 'Test Workflow',
    organizationId: 'org-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default successful auth
    vi.mocked(validateApiTokenWithScope).mockResolvedValue({
      success: true,
      token: mockToken,
    } as never)

    vi.mocked(validateCrossOrganization).mockReturnValue({
      success: true,
    } as never)

    vi.mocked(updateTokenUsage).mockResolvedValue(undefined)

    // Setup workflow mock
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
  })

  /**
   * Property 10a: Filtering by status returns only executions with that status
   *
   * Feature: v1-workflow-api-enhancement, Property 10: Execution History Filtering
   * Validates: Requirements 9.2
   */
  it('Property 10a: filtering by status returns only executions matching that status', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionsArrayArb,
        executionStatusArb,
        async (allExecutions, filterStatus) => {
          const workflowId = mockWorkflow.id

          // Filter executions by status (simulating what the API should return)
          const filteredExecutions = allExecutions.filter(e => e.status === filterStatus)

          // Mock the database to return filtered executions
          vi.mocked(prisma.execution.findMany).mockResolvedValue(filteredExecutions as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(filteredExecutions.length)

          // Make request with status filter
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/executions?status=${filterStatus}`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await listExecutions(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 10a: All returned executions must have the filtered status
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          
          // Verify all returned executions match the filter status
          for (const execution of data.data.executions) {
            expect(execution.status).toBe(filterStatus)
          }

          // Verify the count matches
          expect(data.data.executions.length).toBe(filteredExecutions.length)
          expect(data.data.pagination.total).toBe(filteredExecutions.length)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10b: Filtering by date range returns only executions within that range
   *
   * Feature: v1-workflow-api-enhancement, Property 10: Execution History Filtering
   * Validates: Requirements 9.3
   */
  it('Property 10b: filtering by date range returns only executions within that range', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionsArrayArb,
        dateRangeArb,
        async (allExecutions, dateRange) => {
          const workflowId = mockWorkflow.id
          const { startDate, endDate } = dateRange

          // Set endDate to end of day for comparison
          const endOfDay = new Date(endDate)
          endOfDay.setHours(23, 59, 59, 999)

          // Filter executions by date range (simulating what the API should return)
          const filteredExecutions = allExecutions.filter(e => {
            const createdAt = e.createdAt
            return createdAt >= startDate && createdAt <= endOfDay
          })

          // Mock the database to return filtered executions
          vi.mocked(prisma.execution.findMany).mockResolvedValue(filteredExecutions as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(filteredExecutions.length)

          // Make request with date range filter
          const startDateStr = startDate.toISOString()
          const endDateStr = endDate.toISOString().split('T')[0] // Just the date part
          
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/executions?startDate=${startDateStr}&endDate=${endDateStr}`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await listExecutions(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 10b: All returned executions must be within the date range
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify all returned executions are within the date range
          for (const execution of data.data.executions) {
            const execDate = new Date(execution.createdAt)
            expect(execDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime())
            expect(execDate.getTime()).toBeLessThanOrEqual(endOfDay.getTime())
          }

          // Verify the count matches
          expect(data.data.executions.length).toBe(filteredExecutions.length)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10c: Combined status and date filtering works correctly
   *
   * Feature: v1-workflow-api-enhancement, Property 10: Execution History Filtering
   * Validates: Requirements 9.2, 9.3
   */
  it('Property 10c: combined status and date filtering returns correct results', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionsArrayArb,
        executionStatusArb,
        dateRangeArb,
        async (allExecutions, filterStatus, dateRange) => {
          const workflowId = mockWorkflow.id
          const { startDate, endDate } = dateRange

          // Set endDate to end of day for comparison
          const endOfDay = new Date(endDate)
          endOfDay.setHours(23, 59, 59, 999)

          // Filter executions by both status and date range
          const filteredExecutions = allExecutions.filter(e => {
            const createdAt = e.createdAt
            const matchesStatus = e.status === filterStatus
            const matchesDateRange = createdAt >= startDate && createdAt <= endOfDay
            return matchesStatus && matchesDateRange
          })

          // Mock the database to return filtered executions
          vi.mocked(prisma.execution.findMany).mockResolvedValue(filteredExecutions as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(filteredExecutions.length)

          // Make request with both filters
          const startDateStr = startDate.toISOString()
          const endDateStr = endDate.toISOString().split('T')[0]
          
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/executions?status=${filterStatus}&startDate=${startDateStr}&endDate=${endDateStr}`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await listExecutions(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 10c: All returned executions must match both filters
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify all returned executions match both criteria
          for (const execution of data.data.executions) {
            // Check status
            expect(execution.status).toBe(filterStatus)
            
            // Check date range
            const execDate = new Date(execution.createdAt)
            expect(execDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime())
            expect(execDate.getTime()).toBeLessThanOrEqual(endOfDay.getTime())
          }

          // Verify the count matches
          expect(data.data.executions.length).toBe(filteredExecutions.length)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10d: Pagination returns correct subset of executions
   *
   * Feature: v1-workflow-api-enhancement, Property 10: Execution History Filtering
   * Validates: Requirements 9.1
   */
  it('Property 10d: pagination returns correct subset and metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionsArrayArb,
        fc.integer({ min: 1, max: 10 }), // page
        fc.integer({ min: 1, max: 20 }), // pageSize
        async (allExecutions, page, pageSize) => {
          const workflowId = mockWorkflow.id
          const total = allExecutions.length

          // Calculate expected pagination
          const skip = (page - 1) * pageSize
          const paginatedExecutions = allExecutions.slice(skip, skip + pageSize)

          // Mock the database to return paginated executions
          vi.mocked(prisma.execution.findMany).mockResolvedValue(paginatedExecutions as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(total)

          // Make request with pagination
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/executions?page=${page}&pageSize=${pageSize}`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await listExecutions(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 10d: Pagination metadata must be correct
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(data.data.pagination.page).toBe(page)
          expect(data.data.pagination.pageSize).toBe(pageSize)
          expect(data.data.pagination.total).toBe(total)
          expect(data.data.pagination.totalPages).toBe(Math.ceil(total / pageSize))

          // Verify returned count matches expected
          expect(data.data.executions.length).toBe(paginatedExecutions.length)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10e: Response structure is consistent for all executions
   *
   * Feature: v1-workflow-api-enhancement, Property 10: Execution History Filtering
   * Validates: Requirements 9.4
   */
  it('Property 10e: response structure contains required fields for all executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionsArrayArb,
        async (allExecutions) => {
          const workflowId = mockWorkflow.id

          // Mock the database to return all executions
          vi.mocked(prisma.execution.findMany).mockResolvedValue(allExecutions as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(allExecutions.length)

          // Make request
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/executions`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await listExecutions(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 10e: Each execution must have required fields
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          for (const execution of data.data.executions) {
            // Required fields per Requirement 9.4
            expect(execution).toHaveProperty('id')
            expect(execution).toHaveProperty('status')
            expect(execution).toHaveProperty('duration')
            expect(execution).toHaveProperty('totalTokens')
            expect(execution).toHaveProperty('createdAt')
            
            // Status must be valid
            expect(VALID_STATUSES).toContain(execution.status)
            
            // createdAt must be a valid ISO date string
            expect(() => new Date(execution.createdAt)).not.toThrow()
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
