/**
 * Property-Based Tests for Execution History Status Filtering
 *
 * Feature: execution-history-integration
 * Property 2: 状态筛选正确性
 *
 * Validates: Requirements 1.4
 *
 * Property 2: For any execution record list and status filter condition,
 * the filtered result should only contain records matching that status.
 * When filter is "all", all records should be returned.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  filterExecutionsByStatus,
  filterExecutionsByTimeRange,
  getStartDateFromPeriod,
  type Execution,
  type StatusFilter,
} from './execution-history-list'

// ============================================
// Arbitraries (Generators)
// ============================================

// Execution status generator
const EXECUTION_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const
type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]
const executionStatusArb: fc.Arbitrary<ExecutionStatus> = fc.constantFrom(...EXECUTION_STATUSES)

// Status filter generator (includes 'all')
const STATUS_FILTERS = ['all', 'COMPLETED', 'FAILED', 'RUNNING', 'PENDING'] as const
const statusFilterArb: fc.Arbitrary<StatusFilter> = fc.constantFrom(...STATUS_FILTERS)

// Valid ISO date string generator (using integer timestamps)
const validISODateStringArb: fc.Arbitrary<string> = fc
  .integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2030-12-31
  .map(ts => new Date(ts).toISOString())

// Single execution record generator
const executionRecordArb: fc.Arbitrary<Execution> = fc.record({
  id: fc.uuid(),
  status: executionStatusArb,
  duration: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: null }),
  totalTokens: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  createdAt: validISODateStringArb,
  completedAt: fc.option(validISODateStringArb, { nil: null }),
})

// Array of execution records with mixed statuses
const mixedExecutionsArb: fc.Arbitrary<Execution[]> = fc.array(executionRecordArb, {
  minLength: 0,
  maxLength: 50,
})

// Array of execution records guaranteed to have at least one of each status
const executionsWithAllStatusesArb: fc.Arbitrary<Execution[]> = fc
  .tuple(
    // One of each status
    executionRecordArb.map(e => ({ ...e, status: 'COMPLETED' as const })),
    executionRecordArb.map(e => ({ ...e, status: 'FAILED' as const })),
    executionRecordArb.map(e => ({ ...e, status: 'RUNNING' as const })),
    executionRecordArb.map(e => ({ ...e, status: 'PENDING' as const })),
    // Plus some random ones
    fc.array(executionRecordArb, { minLength: 0, maxLength: 20 })
  )
  .map(([completed, failed, running, pending, random]) => [
    completed,
    failed,
    running,
    pending,
    ...random,
  ])

// ============================================
// Property Tests
// ============================================

describe('Execution History Status Filter - Property Tests', () => {
  /**
   * Property 2a: "all" filter returns all executions unchanged
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2a: "all" filter returns all executions unchanged', () => {
    fc.assert(
      fc.property(mixedExecutionsArb, (executions) => {
        const result = filterExecutionsByStatus(executions, 'all')

        // Property: All executions should be returned
        expect(result.length).toBe(executions.length)

        // Property: The result should contain exactly the same executions
        const resultIds = new Set(result.map(e => e.id))
        const inputIds = new Set(executions.map(e => e.id))
        expect(resultIds).toEqual(inputIds)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2b: Status filter returns only matching status
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2b: filtering by specific status returns only executions with that status', () => {
    fc.assert(
      fc.property(
        mixedExecutionsArb,
        statusFilterArb.filter(s => s !== 'all'),
        (executions, statusFilter) => {
          const result = filterExecutionsByStatus(executions, statusFilter)

          // Property: All returned executions must have the filtered status
          for (const execution of result) {
            expect(execution.status).toBe(statusFilter)
          }

          // Property: Count should match expected
          const expectedCount = executions.filter(e => e.status === statusFilter).length
          expect(result.length).toBe(expectedCount)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2c: COMPLETED filter excludes all non-COMPLETED executions
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2c: COMPLETED filter excludes all non-COMPLETED executions', () => {
    fc.assert(
      fc.property(executionsWithAllStatusesArb, (executions) => {
        const result = filterExecutionsByStatus(executions, 'COMPLETED')

        // Property: No non-COMPLETED executions should be in the result
        const nonCompletedInResult = result.filter(e => e.status !== 'COMPLETED')
        expect(nonCompletedInResult.length).toBe(0)

        // Property: All COMPLETED executions from input should be in result
        const completedInInput = executions.filter(e => e.status === 'COMPLETED')
        expect(result.length).toBe(completedInInput.length)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2d: FAILED filter excludes all non-FAILED executions
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2d: FAILED filter excludes all non-FAILED executions', () => {
    fc.assert(
      fc.property(executionsWithAllStatusesArb, (executions) => {
        const result = filterExecutionsByStatus(executions, 'FAILED')

        // Property: No non-FAILED executions should be in the result
        const nonFailedInResult = result.filter(e => e.status !== 'FAILED')
        expect(nonFailedInResult.length).toBe(0)

        // Property: All FAILED executions from input should be in result
        const failedInInput = executions.filter(e => e.status === 'FAILED')
        expect(result.length).toBe(failedInInput.length)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2e: RUNNING filter excludes all non-RUNNING executions
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2e: RUNNING filter excludes all non-RUNNING executions', () => {
    fc.assert(
      fc.property(executionsWithAllStatusesArb, (executions) => {
        const result = filterExecutionsByStatus(executions, 'RUNNING')

        // Property: No non-RUNNING executions should be in the result
        const nonRunningInResult = result.filter(e => e.status !== 'RUNNING')
        expect(nonRunningInResult.length).toBe(0)

        // Property: All RUNNING executions from input should be in result
        const runningInInput = executions.filter(e => e.status === 'RUNNING')
        expect(result.length).toBe(runningInInput.length)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2f: PENDING filter excludes all non-PENDING executions
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2f: PENDING filter excludes all non-PENDING executions', () => {
    fc.assert(
      fc.property(executionsWithAllStatusesArb, (executions) => {
        const result = filterExecutionsByStatus(executions, 'PENDING')

        // Property: No non-PENDING executions should be in the result
        const nonPendingInResult = result.filter(e => e.status !== 'PENDING')
        expect(nonPendingInResult.length).toBe(0)

        // Property: All PENDING executions from input should be in result
        const pendingInInput = executions.filter(e => e.status === 'PENDING')
        expect(result.length).toBe(pendingInInput.length)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2g: Filter preserves execution data integrity
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2g: filtering preserves all execution data fields', () => {
    fc.assert(
      fc.property(mixedExecutionsArb, statusFilterArb, (executions, statusFilter) => {
        const result = filterExecutionsByStatus(executions, statusFilter)

        // Property: Each returned execution should have all its original fields intact
        for (const resultExec of result) {
          const originalExec = executions.find(e => e.id === resultExec.id)
          expect(originalExec).toBeDefined()

          if (originalExec) {
            expect(resultExec.id).toBe(originalExec.id)
            expect(resultExec.status).toBe(originalExec.status)
            expect(resultExec.duration).toBe(originalExec.duration)
            expect(resultExec.totalTokens).toBe(originalExec.totalTokens)
            expect(resultExec.error).toBe(originalExec.error)
            expect(resultExec.createdAt).toBe(originalExec.createdAt)
            expect(resultExec.completedAt).toBe(originalExec.completedAt)
          }
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2h: Empty input returns empty result for any filter
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2h: empty input returns empty result for any filter', () => {
    fc.assert(
      fc.property(statusFilterArb, (statusFilter) => {
        const result = filterExecutionsByStatus([], statusFilter)

        // Property: Empty input should always return empty result
        expect(result.length).toBe(0)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2i: Filter result is a subset of input
   *
   * Feature: execution-history-integration, Property 2: 状态筛选正确性
   * Validates: Requirements 1.4
   */
  it('Property 2i: filter result is always a subset of input', () => {
    fc.assert(
      fc.property(mixedExecutionsArb, statusFilterArb, (executions, statusFilter) => {
        const result = filterExecutionsByStatus(executions, statusFilter)

        // Property: Result length should be <= input length
        expect(result.length).toBeLessThanOrEqual(executions.length)

        // Property: All result IDs should exist in input
        const inputIds = new Set(executions.map(e => e.id))
        for (const resultExec of result) {
          expect(inputIds.has(resultExec.id)).toBe(true)
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})


/**
 * Property-Based Tests for Execution History Time Range Filtering
 *
 * Feature: execution-history-integration
 * Property 3: 时间范围筛选正确性
 *
 * Validates: Requirements 4.2
 *
 * Property 3: For any execution record list and time range filter,
 * all filtered records should have createdAt within the specified time range.
 */

describe('Execution History Time Range Filter - Property Tests', () => {
  // Period types
  const PERIODS = ['day', 'week', 'month'] as const
  type Period = (typeof PERIODS)[number]
  const periodArb: fc.Arbitrary<Period> = fc.constantFrom(...PERIODS)

  // Generate executions with dates spread across a wide range
  const executionWithDateArb = (minTs: number, maxTs: number): fc.Arbitrary<Execution> =>
    fc.record({
      id: fc.uuid(),
      status: fc.constantFrom('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') as fc.Arbitrary<Execution['status']>,
      duration: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: null }),
      totalTokens: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
      error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
      createdAt: fc.integer({ min: minTs, max: maxTs }).map(ts => new Date(ts).toISOString()),
      completedAt: fc.option(
        fc.integer({ min: minTs, max: maxTs }).map(ts => new Date(ts).toISOString()),
        { nil: null }
      ),
    })

  /**
   * Property 3a: getStartDateFromPeriod returns valid date for valid periods
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3a: getStartDateFromPeriod returns valid ISO date string for valid periods', () => {
    fc.assert(
      fc.property(periodArb, (period) => {
        const result = getStartDateFromPeriod(period)

        // Property: Result should be a valid ISO date string
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')

        // Property: Result should be parseable as a date
        const date = new Date(result!)
        expect(date.getTime()).not.toBeNaN()

        // Property: Result should be in the past
        expect(date.getTime()).toBeLessThan(Date.now())

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3b: getStartDateFromPeriod returns undefined for invalid periods
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3b: getStartDateFromPeriod returns undefined for invalid periods', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !['day', 'week', 'month'].includes(s)),
        (invalidPeriod) => {
          const result = getStartDateFromPeriod(invalidPeriod)

          // Property: Invalid period should return undefined
          expect(result).toBeUndefined()

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3c: Time range filter returns only records within range
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3c: filtering by time range returns only records within that range', () => {
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

    fc.assert(
      fc.property(
        // Generate executions spread across 60 days
        fc.array(executionWithDateArb(sixtyDaysAgo, now), { minLength: 1, maxLength: 30 }),
        // Generate a start date within the range
        fc.integer({ min: sixtyDaysAgo, max: thirtyDaysAgo }).map(ts => new Date(ts).toISOString()),
        (executions, startDate) => {
          const result = filterExecutionsByTimeRange(executions, startDate)
          const startTime = new Date(startDate).getTime()

          // Property: All returned executions should have createdAt >= startDate
          for (const execution of result) {
            const createdAtTime = new Date(execution.createdAt).getTime()
            expect(createdAtTime).toBeGreaterThanOrEqual(startTime)
          }

          // Property: Count should match expected
          const expectedCount = executions.filter(
            e => new Date(e.createdAt).getTime() >= startTime
          ).length
          expect(result.length).toBe(expectedCount)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3d: Undefined start date returns all records
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3d: undefined start date returns all records unchanged', () => {
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    fc.assert(
      fc.property(
        fc.array(executionWithDateArb(thirtyDaysAgo, now), { minLength: 0, maxLength: 30 }),
        (executions) => {
          const result = filterExecutionsByTimeRange(executions, undefined)

          // Property: All executions should be returned
          expect(result.length).toBe(executions.length)

          // Property: The result should contain exactly the same executions
          const resultIds = new Set(result.map(e => e.id))
          const inputIds = new Set(executions.map(e => e.id))
          expect(resultIds).toEqual(inputIds)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3e: Time range filter excludes records before start date
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3e: time range filter excludes all records before start date', () => {
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

    fc.assert(
      fc.property(
        // Generate executions spread across 60 days
        fc.array(executionWithDateArb(sixtyDaysAgo, now), { minLength: 1, maxLength: 30 }),
        // Generate a start date within the range
        fc.integer({ min: sixtyDaysAgo, max: thirtyDaysAgo }).map(ts => new Date(ts).toISOString()),
        (executions, startDate) => {
          const result = filterExecutionsByTimeRange(executions, startDate)
          const startTime = new Date(startDate).getTime()

          // Property: No records before start date should be in result
          const recordsBeforeStartDate = result.filter(
            e => new Date(e.createdAt).getTime() < startTime
          )
          expect(recordsBeforeStartDate.length).toBe(0)

          // Property: All records before start date from input should be excluded
          const inputRecordsBeforeStartDate = executions.filter(
            e => new Date(e.createdAt).getTime() < startTime
          )
          const resultIds = new Set(result.map(e => e.id))
          for (const oldRecord of inputRecordsBeforeStartDate) {
            expect(resultIds.has(oldRecord.id)).toBe(false)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3f: Time range filter preserves execution data integrity
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3f: time range filtering preserves all execution data fields', () => {
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    fc.assert(
      fc.property(
        fc.array(executionWithDateArb(thirtyDaysAgo, now), { minLength: 1, maxLength: 30 }),
        fc.integer({ min: thirtyDaysAgo, max: now }).map(ts => new Date(ts).toISOString()),
        (executions, startDate) => {
          const result = filterExecutionsByTimeRange(executions, startDate)

          // Property: Each returned execution should have all its original fields intact
          for (const resultExec of result) {
            const originalExec = executions.find(e => e.id === resultExec.id)
            expect(originalExec).toBeDefined()

            if (originalExec) {
              expect(resultExec.id).toBe(originalExec.id)
              expect(resultExec.status).toBe(originalExec.status)
              expect(resultExec.duration).toBe(originalExec.duration)
              expect(resultExec.totalTokens).toBe(originalExec.totalTokens)
              expect(resultExec.error).toBe(originalExec.error)
              expect(resultExec.createdAt).toBe(originalExec.createdAt)
              expect(resultExec.completedAt).toBe(originalExec.completedAt)
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3g: Period-based filtering works correctly
   *
   * Feature: execution-history-integration, Property 3: 时间范围筛选正确性
   * Validates: Requirements 4.2
   */
  it('Property 3g: period-based filtering returns records within expected time range', () => {
    fc.assert(
      fc.property(periodArb, (period) => {
        const startDate = getStartDateFromPeriod(period)
        expect(startDate).toBeDefined()

        const startTime = new Date(startDate!).getTime()
        const now = Date.now()

        // Property: Start date should be approximately correct based on period
        const expectedDays = period === 'day' ? 1 : period === 'week' ? 7 : 30
        const expectedMs = expectedDays * 24 * 60 * 60 * 1000
        const actualDiff = now - startTime

        // Allow 1 second tolerance for test execution time
        expect(actualDiff).toBeGreaterThanOrEqual(expectedMs - 1000)
        expect(actualDiff).toBeLessThanOrEqual(expectedMs + 1000)

        return true
      }),
      { numRuns: 100 }
    )
  })
})
