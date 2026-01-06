/**
 * Property-Based Tests for Execution Type Filtering
 *
 * Feature: workflow-test-mode
 * Property 3: 执行类型区分
 *
 * Validates: Requirements 4.4
 *
 * Property 3: For any execution history query, filtering by executionType SHALL only
 * return records of the corresponding type. NORMAL type SHALL NOT include TEST type
 * records, and vice versa.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/executions/route'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    execution: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

// ============================================
// Arbitraries (Generators)
// ============================================

// Execution type generator
const EXECUTION_TYPES = ['NORMAL', 'TEST'] as const
type ExecutionType = (typeof EXECUTION_TYPES)[number]
const executionTypeArb: fc.Arbitrary<ExecutionType> = fc.constantFrom(...EXECUTION_TYPES)

// Execution status generator
const EXECUTION_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const
type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]
const executionStatusArb: fc.Arbitrary<ExecutionStatus> = fc.constantFrom(...EXECUTION_STATUSES)

// Single execution record generator
const executionRecordArb: fc.Arbitrary<{
  id: string
  status: ExecutionStatus
  executionType: ExecutionType
  isAIGeneratedInput: boolean
  workflowId: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  startedAt: Date | null
  completedAt: Date | null
  duration: number | null
  totalTokens: number
  error: string | null
  createdAt: Date
}> = fc.record({
  id: fc.uuid(),
  status: executionStatusArb,
  executionType: executionTypeArb,
  isAIGeneratedInput: fc.boolean(),
  workflowId: fc.uuid(),
  input: fc.constant({}),
  output: fc.option(fc.constant({ result: 'success' }), { nil: null }),
  startedAt: fc.option(fc.date(), { nil: null }),
  completedAt: fc.option(fc.date(), { nil: null }),
  duration: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
  totalTokens: fc.integer({ min: 0, max: 10000 }),
  error: fc.option(fc.string(), { nil: null }),
  createdAt: fc.date(),
})

// Array of execution records with mixed types
const mixedExecutionsArb: fc.Arbitrary<Array<{
  id: string
  status: ExecutionStatus
  executionType: ExecutionType
  isAIGeneratedInput: boolean
  workflowId: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  startedAt: Date | null
  completedAt: Date | null
  duration: number | null
  totalTokens: number
  error: string | null
  createdAt: Date
}>> = fc.array(executionRecordArb, { minLength: 1, maxLength: 20 })

// ============================================
// Test Setup
// ============================================

describe('Execution Type Filter API - Property Tests', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'ADMIN',
      organizationId: 'org-1',
      organizationName: 'Test Org',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default successful auth
    vi.mocked(auth).mockResolvedValue(mockSession as never)
  })

  /**
   * Property 3a: NORMAL type filter returns only NORMAL executions
   *
   * Feature: workflow-test-mode, Property 3: 执行类型区分
   * Validates: Requirements 4.4
   */
  it('Property 3a: filtering by NORMAL returns only NORMAL type executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        mixedExecutionsArb,
        async (allExecutions) => {
          // Filter to get only NORMAL executions (simulating what the DB would return)
          const normalExecutions = allExecutions.filter(e => e.executionType === 'NORMAL')

          // Transform to match API response format
          const mockDbResponse = normalExecutions.map(e => ({
            ...e,
            workflow: { name: 'Test Workflow' },
            _count: { outputFiles: 0 },
          }))

          vi.mocked(prisma.execution.findMany).mockResolvedValue(mockDbResponse as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(normalExecutions.length)

          // Make GET request with executionType=NORMAL filter
          const request = new NextRequest(
            'http://localhost/api/executions?executionType=NORMAL',
            { method: 'GET' }
          )

          const response = await GET(request)
          const data = await response.json()

          // Property 3a: All returned executions must be NORMAL type
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify all returned executions are NORMAL type
          for (const execution of data.data.executions) {
            expect(execution.executionType).toBe('NORMAL')
          }

          // Verify count matches
          expect(data.data.executions.length).toBe(normalExecutions.length)

          // Verify the prisma query was called with correct filter
          expect(prisma.execution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                executionType: 'NORMAL',
              }),
            })
          )

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3b: TEST type filter returns only TEST executions
   *
   * Feature: workflow-test-mode, Property 3: 执行类型区分
   * Validates: Requirements 4.4
   */
  it('Property 3b: filtering by TEST returns only TEST type executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        mixedExecutionsArb,
        async (allExecutions) => {
          // Filter to get only TEST executions (simulating what the DB would return)
          const testExecutions = allExecutions.filter(e => e.executionType === 'TEST')

          // Transform to match API response format
          const mockDbResponse = testExecutions.map(e => ({
            ...e,
            workflow: { name: 'Test Workflow' },
            _count: { outputFiles: 0 },
          }))

          vi.mocked(prisma.execution.findMany).mockResolvedValue(mockDbResponse as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(testExecutions.length)

          // Make GET request with executionType=TEST filter
          const request = new NextRequest(
            'http://localhost/api/executions?executionType=TEST',
            { method: 'GET' }
          )

          const response = await GET(request)
          const data = await response.json()

          // Property 3b: All returned executions must be TEST type
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify all returned executions are TEST type
          for (const execution of data.data.executions) {
            expect(execution.executionType).toBe('TEST')
          }

          // Verify count matches
          expect(data.data.executions.length).toBe(testExecutions.length)

          // Verify the prisma query was called with correct filter
          expect(prisma.execution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                executionType: 'TEST',
              }),
            })
          )

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3c: NORMAL filter excludes all TEST executions
   *
   * Feature: workflow-test-mode, Property 3: 执行类型区分
   * Validates: Requirements 4.4
   */
  it('Property 3c: NORMAL filter excludes all TEST type executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        mixedExecutionsArb.filter(execs => execs.some(e => e.executionType === 'TEST')),
        async (allExecutions) => {
          // Filter to get only NORMAL executions (simulating what the DB would return)
          const normalExecutions = allExecutions.filter(e => e.executionType === 'NORMAL')
          const testExecutions = allExecutions.filter(e => e.executionType === 'TEST')

          // Transform to match API response format
          const mockDbResponse = normalExecutions.map(e => ({
            ...e,
            workflow: { name: 'Test Workflow' },
            _count: { outputFiles: 0 },
          }))

          vi.mocked(prisma.execution.findMany).mockResolvedValue(mockDbResponse as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(normalExecutions.length)

          // Make GET request with executionType=NORMAL filter
          const request = new NextRequest(
            'http://localhost/api/executions?executionType=NORMAL',
            { method: 'GET' }
          )

          const response = await GET(request)
          const data = await response.json()

          // Property 3c: No TEST executions should be in the result
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify no TEST executions are returned
          const returnedTestExecutions = data.data.executions.filter(
            (e: { executionType: string }) => e.executionType === 'TEST'
          )
          expect(returnedTestExecutions.length).toBe(0)

          // Verify TEST executions exist in original data but not in result
          if (testExecutions.length > 0) {
            const returnedIds = new Set(data.data.executions.map((e: { id: string }) => e.id))
            for (const testExec of testExecutions) {
              expect(returnedIds.has(testExec.id)).toBe(false)
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3d: TEST filter excludes all NORMAL executions
   *
   * Feature: workflow-test-mode, Property 3: 执行类型区分
   * Validates: Requirements 4.4
   */
  it('Property 3d: TEST filter excludes all NORMAL type executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        mixedExecutionsArb.filter(execs => execs.some(e => e.executionType === 'NORMAL')),
        async (allExecutions) => {
          // Filter to get only TEST executions (simulating what the DB would return)
          const testExecutions = allExecutions.filter(e => e.executionType === 'TEST')
          const normalExecutions = allExecutions.filter(e => e.executionType === 'NORMAL')

          // Transform to match API response format
          const mockDbResponse = testExecutions.map(e => ({
            ...e,
            workflow: { name: 'Test Workflow' },
            _count: { outputFiles: 0 },
          }))

          vi.mocked(prisma.execution.findMany).mockResolvedValue(mockDbResponse as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(testExecutions.length)

          // Make GET request with executionType=TEST filter
          const request = new NextRequest(
            'http://localhost/api/executions?executionType=TEST',
            { method: 'GET' }
          )

          const response = await GET(request)
          const data = await response.json()

          // Property 3d: No NORMAL executions should be in the result
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify no NORMAL executions are returned
          const returnedNormalExecutions = data.data.executions.filter(
            (e: { executionType: string }) => e.executionType === 'NORMAL'
          )
          expect(returnedNormalExecutions.length).toBe(0)

          // Verify NORMAL executions exist in original data but not in result
          if (normalExecutions.length > 0) {
            const returnedIds = new Set(data.data.executions.map((e: { id: string }) => e.id))
            for (const normalExec of normalExecutions) {
              expect(returnedIds.has(normalExec.id)).toBe(false)
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3e: No filter returns both NORMAL and TEST executions
   *
   * Feature: workflow-test-mode, Property 3: 执行类型区分
   * Validates: Requirements 4.4
   */
  it('Property 3e: no executionType filter returns all execution types', async () => {
    await fc.assert(
      fc.asyncProperty(
        mixedExecutionsArb.filter(execs => 
          execs.some(e => e.executionType === 'NORMAL') && 
          execs.some(e => e.executionType === 'TEST')
        ),
        async (allExecutions) => {
          // Transform to match API response format (return all executions)
          const mockDbResponse = allExecutions.map(e => ({
            ...e,
            workflow: { name: 'Test Workflow' },
            _count: { outputFiles: 0 },
          }))

          vi.mocked(prisma.execution.findMany).mockResolvedValue(mockDbResponse as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(allExecutions.length)

          // Make GET request without executionType filter
          const request = new NextRequest(
            'http://localhost/api/executions',
            { method: 'GET' }
          )

          const response = await GET(request)
          const data = await response.json()

          // Property 3e: Both types should be present
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify both types are returned
          const normalCount = data.data.executions.filter(
            (e: { executionType: string }) => e.executionType === 'NORMAL'
          ).length
          const testCount = data.data.executions.filter(
            (e: { executionType: string }) => e.executionType === 'TEST'
          ).length

          const expectedNormalCount = allExecutions.filter(e => e.executionType === 'NORMAL').length
          const expectedTestCount = allExecutions.filter(e => e.executionType === 'TEST').length

          expect(normalCount).toBe(expectedNormalCount)
          expect(testCount).toBe(expectedTestCount)

          // Verify the prisma query was called without executionType filter
          expect(prisma.execution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.not.objectContaining({
                executionType: expect.anything(),
              }),
            })
          )

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3f: Invalid executionType filter is ignored
   *
   * Feature: workflow-test-mode, Property 3: 执行类型区分
   * Validates: Requirements 4.4
   */
  it('Property 3f: invalid executionType filter is ignored and returns all types', async () => {
    await fc.assert(
      fc.asyncProperty(
        mixedExecutionsArb,
        fc.string().filter(s => s !== 'NORMAL' && s !== 'TEST'),
        async (allExecutions, invalidType) => {
          // Transform to match API response format (return all executions)
          const mockDbResponse = allExecutions.map(e => ({
            ...e,
            workflow: { name: 'Test Workflow' },
            _count: { outputFiles: 0 },
          }))

          vi.mocked(prisma.execution.findMany).mockResolvedValue(mockDbResponse as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(allExecutions.length)

          // Make GET request with invalid executionType filter
          const request = new NextRequest(
            `http://localhost/api/executions?executionType=${encodeURIComponent(invalidType)}`,
            { method: 'GET' }
          )

          const response = await GET(request)
          const data = await response.json()

          // Property 3f: Invalid filter should be ignored, return all
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(data.data.executions.length).toBe(allExecutions.length)

          // Verify the prisma query was called without executionType filter
          expect(prisma.execution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.not.objectContaining({
                executionType: expect.anything(),
              }),
            })
          )

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
