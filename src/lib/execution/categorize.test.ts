/**
 * 执行记录分类工具函数 - 属性测试
 * 
 * 使用 fast-check 进行属性测试，验证分类逻辑的正确性
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  categorizeExecutions,
  isRunningExecution,
  isHistoryExecution,
  calculateElapsedTime,
  formatElapsedTime,
  filterHistoryExecutions,
  paginateExecutions,
  filterAndPaginateHistory,
  type Execution,
  type HistoryFilters,
  type PaginationParams,
} from './categorize'
import type { ExecutionStatus } from '@/lib/workflow/types'

// 所有可能的执行状态
const ALL_STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED']

// 运行中状态
const RUNNING_STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING']

// 历史记录状态
const HISTORY_STATUSES: ExecutionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED']

// 生成任意执行状态
const statusArb = fc.constantFrom(...ALL_STATUSES)

// 生成运行中状态
const runningStatusArb = fc.constantFrom(...RUNNING_STATUSES)

// 生成历史记录状态
const historyStatusArb = fc.constantFrom(...HISTORY_STATUSES)

// 生成有效的日期字符串（使用时间戳范围）
const MIN_TIMESTAMP = new Date('2020-01-01').getTime()
const MAX_TIMESTAMP = new Date('2030-12-31').getTime()

const validDateArb = fc.integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
  .map(ts => new Date(ts).toISOString())

// 生成任意执行记录
const executionArb = (statusGen: fc.Arbitrary<ExecutionStatus> = statusArb): fc.Arbitrary<Execution> =>
  fc.record({
    id: fc.uuid(),
    status: statusGen,
    workflowId: fc.uuid(),
    workflowName: fc.string({ minLength: 1, maxLength: 100 }),
    startedAt: fc.oneof(fc.constant(null), validDateArb),
    completedAt: fc.oneof(fc.constant(null), validDateArb),
    createdAt: validDateArb,
    duration: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 3600000 })),
    totalTokens: fc.integer({ min: 0, max: 1000000 }),
    error: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 500 })),
    outputFileCount: fc.integer({ min: 0, max: 100 }),
  })

// 生成执行记录数组
const executionsArb = fc.array(executionArb(), { minLength: 0, maxLength: 50 })

/**
 * **Feature: execution-history-categories, Property 1: Execution Categorization Completeness**
 * **Validates: Requirements 1.2, 1.3, 2.2**
 * 
 * For any list of executions, categorizing them into running and history sections 
 * SHALL result in every execution appearing in exactly one section (for RUNNING, PENDING, 
 * COMPLETED, FAILED, CANCELLED statuses), with no executions lost or duplicated.
 */
describe('Property 1: Execution Categorization Completeness', () => {
  it('should categorize all executions with running or history status into exactly one section', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { running, history } = categorizeExecutions(executions)
          
          // 计算应该被分类的执行记录数量（排除 PAUSED 状态）
          const categorizableExecutions = executions.filter(
            e => RUNNING_STATUSES.includes(e.status) || HISTORY_STATUSES.includes(e.status)
          )
          
          // 分类后的总数应该等于可分类的执行记录数
          expect(running.length + history.length).toBe(categorizableExecutions.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not duplicate any execution across sections', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { running, history } = categorizeExecutions(executions)
          
          // 获取所有分类后的 ID
          const runningIds = new Set(running.map(e => e.id))
          const historyIds = new Set(history.map(e => e.id))
          
          // 两个集合不应有交集
          const intersection = [...runningIds].filter(id => historyIds.has(id))
          expect(intersection.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve all execution data during categorization', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { running, history } = categorizeExecutions(executions)
          const allCategorized = [...running, ...history]
          
          // 每个分类后的执行记录应该与原始记录完全相同
          for (const categorized of allCategorized) {
            const original = executions.find(e => e.id === categorized.id)
            expect(original).toBeDefined()
            expect(categorized).toEqual(original)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: execution-history-categories, Property 2: Running Section Contains Only Active Executions**
 * **Validates: Requirements 1.2**
 * 
 * For any execution in the Running_Section, its status SHALL be either 'RUNNING' or 'PENDING'.
 */
describe('Property 2: Running Section Contains Only Active Executions', () => {
  it('should only contain RUNNING or PENDING status in running section', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { running } = categorizeExecutions(executions)
          
          // 运行区域中的每个执行记录状态必须是 RUNNING 或 PENDING
          for (const execution of running) {
            expect(RUNNING_STATUSES).toContain(execution.status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include all RUNNING and PENDING executions in running section', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { running } = categorizeExecutions(executions)
          
          // 所有 RUNNING 或 PENDING 状态的执行记录都应该在运行区域
          const expectedRunning = executions.filter(e => RUNNING_STATUSES.includes(e.status))
          expect(running.length).toBe(expectedRunning.length)
          
          const runningIds = new Set(running.map(e => e.id))
          for (const expected of expectedRunning) {
            expect(runningIds.has(expected.id)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('isRunningExecution should return true only for RUNNING or PENDING status', () => {
    fc.assert(
      fc.property(
        executionArb(),
        (execution) => {
          const isRunning = isRunningExecution(execution)
          
          if (RUNNING_STATUSES.includes(execution.status)) {
            expect(isRunning).toBe(true)
          } else {
            expect(isRunning).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: execution-history-categories, Property 3: History Section Contains Only Completed Executions**
 * **Validates: Requirements 1.3**
 * 
 * For any execution in the History_Section, its status SHALL be one of 'COMPLETED', 'FAILED', or 'CANCELLED'.
 */
describe('Property 3: History Section Contains Only Completed Executions', () => {
  it('should only contain COMPLETED, FAILED, or CANCELLED status in history section', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { history } = categorizeExecutions(executions)
          
          // 历史区域中的每个执行记录状态必须是 COMPLETED、FAILED 或 CANCELLED
          for (const execution of history) {
            expect(HISTORY_STATUSES).toContain(execution.status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include all COMPLETED, FAILED, and CANCELLED executions in history section', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { history } = categorizeExecutions(executions)
          
          // 所有 COMPLETED、FAILED 或 CANCELLED 状态的执行记录都应该在历史区域
          const expectedHistory = executions.filter(e => HISTORY_STATUSES.includes(e.status))
          expect(history.length).toBe(expectedHistory.length)
          
          const historyIds = new Set(history.map(e => e.id))
          for (const expected of expectedHistory) {
            expect(historyIds.has(expected.id)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('isHistoryExecution should return true only for COMPLETED, FAILED, or CANCELLED status', () => {
    fc.assert(
      fc.property(
        executionArb(),
        (execution) => {
          const isHistory = isHistoryExecution(execution)
          
          if (HISTORY_STATUSES.includes(execution.status)) {
            expect(isHistory).toBe(true)
          } else {
            expect(isHistory).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * 单元测试：calculateElapsedTime 和 formatElapsedTime
 */
describe('calculateElapsedTime', () => {
  it('should return 0 when startedAt is null', () => {
    const execution: Execution = {
      id: 'test-1',
      status: 'RUNNING',
      workflowId: 'wf-1',
      workflowName: 'Test Workflow',
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      duration: null,
      totalTokens: 0,
      error: null,
      outputFileCount: 0,
    }
    
    expect(calculateElapsedTime(execution)).toBe(0)
  })

  it('should calculate elapsed time for completed execution', () => {
    const startTime = new Date('2024-01-01T10:00:00Z')
    const endTime = new Date('2024-01-01T10:05:00Z')
    
    const execution: Execution = {
      id: 'test-2',
      status: 'COMPLETED',
      workflowId: 'wf-1',
      workflowName: 'Test Workflow',
      startedAt: startTime.toISOString(),
      completedAt: endTime.toISOString(),
      createdAt: startTime.toISOString(),
      duration: 300000,
      totalTokens: 100,
      error: null,
      outputFileCount: 1,
    }
    
    expect(calculateElapsedTime(execution)).toBe(300000) // 5 minutes in ms
  })

  it('should return non-negative elapsed time', () => {
    fc.assert(
      fc.property(
        executionArb(),
        (execution) => {
          const elapsed = calculateElapsedTime(execution)
          expect(elapsed).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('formatElapsedTime', () => {
  it('should format milliseconds correctly', () => {
    expect(formatElapsedTime(500)).toBe('500ms')
    expect(formatElapsedTime(999)).toBe('999ms')
  })

  it('should format seconds correctly', () => {
    expect(formatElapsedTime(1000)).toBe('1s')
    expect(formatElapsedTime(30000)).toBe('30s')
    expect(formatElapsedTime(59000)).toBe('59s')
  })

  it('should format minutes correctly', () => {
    expect(formatElapsedTime(60000)).toBe('1m')
    expect(formatElapsedTime(90000)).toBe('1m 30s')
    expect(formatElapsedTime(3540000)).toBe('59m')
  })

  it('should format hours correctly', () => {
    expect(formatElapsedTime(3600000)).toBe('1h')
    expect(formatElapsedTime(5400000)).toBe('1h 30m')
    expect(formatElapsedTime(7200000)).toBe('2h')
  })
})

/**
 * **Feature: execution-history-categories, Property 4: Running Count Accuracy**
 * **Validates: Requirements 1.5**
 * 
 * For any list of executions, the displayed running count SHALL equal the number 
 * of executions with status 'RUNNING' or 'PENDING'.
 */
describe('Property 4: Running Count Accuracy', () => {
  it('should return count equal to number of RUNNING or PENDING executions', () => {
    fc.assert(
      fc.property(
        executionsArb,
        (executions) => {
          const { running } = categorizeExecutions(executions)
          
          // 计算预期的运行中数量
          const expectedCount = executions.filter(
            e => e.status === 'RUNNING' || e.status === 'PENDING'
          ).length
          
          // 运行区域的长度应该等于预期数量
          expect(running.length).toBe(expectedCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return 0 when no executions are running or pending', () => {
    fc.assert(
      fc.property(
        // 只生成历史状态的执行记录
        fc.array(executionArb(historyStatusArb), { minLength: 0, maxLength: 50 }),
        (executions) => {
          const { running } = categorizeExecutions(executions)
          expect(running.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should count all running executions when all are running or pending', () => {
    fc.assert(
      fc.property(
        // 只生成运行中状态的执行记录
        fc.array(executionArb(runningStatusArb), { minLength: 1, maxLength: 50 }),
        (executions) => {
          const { running } = categorizeExecutions(executions)
          expect(running.length).toBe(executions.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should accurately count mixed status executions', () => {
    fc.assert(
      fc.property(
        // 生成混合状态的执行记录
        fc.tuple(
          fc.array(executionArb(runningStatusArb), { minLength: 0, maxLength: 25 }),
          fc.array(executionArb(historyStatusArb), { minLength: 0, maxLength: 25 })
        ),
        ([runningExecutions, historyExecutions]) => {
          const allExecutions = [...runningExecutions, ...historyExecutions]
          const { running } = categorizeExecutions(allExecutions)
          
          // 运行区域的数量应该等于运行中执行记录的数量
          expect(running.length).toBe(runningExecutions.length)
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * **Feature: execution-history-categories, Property 5: Filter Correctness**
 * **Validates: Requirements 3.2, 3.3**
 * 
 * For any filter combination applied to history executions, all returned records 
 * SHALL match all specified filter criteria.
 */
describe('Property 5: Filter Correctness', () => {
  // Generate history-only executions for filter tests
  const historyExecutionsArb = fc.array(executionArb(historyStatusArb), { minLength: 0, maxLength: 50 })

  // Generate workflow IDs that might be used in filters
  const workflowIdArb = fc.uuid()

  // Generate date strings for filter tests
  const dateStringArb = fc.integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
    .map(ts => {
      const date = new Date(ts)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    })

  // Generate filter combinations
  const filtersArb: fc.Arbitrary<HistoryFilters> = fc.record({
    workflowId: fc.oneof(fc.constant(undefined), workflowIdArb),
    status: fc.oneof(
      fc.constant(undefined),
      fc.constantFrom('COMPLETED' as const, 'FAILED' as const, 'CANCELLED' as const)
    ),
    startDate: fc.oneof(fc.constant(undefined), dateStringArb),
    endDate: fc.oneof(fc.constant(undefined), dateStringArb),
  })

  it('should return only executions matching workflowId filter', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        workflowIdArb,
        (executions, workflowId) => {
          const filters: HistoryFilters = { workflowId }
          const filtered = filterHistoryExecutions(executions, filters)
          
          // All filtered results should have the specified workflowId
          for (const execution of filtered) {
            expect(execution.workflowId).toBe(workflowId)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return only executions matching status filter', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        fc.constantFrom('COMPLETED' as const, 'FAILED' as const, 'CANCELLED' as const),
        (executions, status) => {
          const filters: HistoryFilters = { status }
          const filtered = filterHistoryExecutions(executions, filters)
          
          // All filtered results should have the specified status
          for (const execution of filtered) {
            expect(execution.status).toBe(status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return only executions within date range', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        dateStringArb,
        dateStringArb,
        (executions, date1, date2) => {
          // Ensure startDate <= endDate
          const [startDate, endDate] = date1 <= date2 ? [date1, date2] : [date2, date1]
          const filters: HistoryFilters = { startDate, endDate }
          const filtered = filterHistoryExecutions(executions, filters)
          
          const startDateTime = new Date(startDate)
          startDateTime.setHours(0, 0, 0, 0)
          const endDateTime = new Date(endDate)
          endDateTime.setHours(23, 59, 59, 999)
          
          // All filtered results should be within the date range
          for (const execution of filtered) {
            const executionDate = new Date(execution.startedAt || execution.createdAt)
            expect(executionDate.getTime()).toBeGreaterThanOrEqual(startDateTime.getTime())
            expect(executionDate.getTime()).toBeLessThanOrEqual(endDateTime.getTime())
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return only executions matching all filter criteria combined', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        filtersArb,
        (executions, filters) => {
          const filtered = filterHistoryExecutions(executions, filters)
          
          for (const execution of filtered) {
            // Check workflowId filter
            if (filters.workflowId) {
              expect(execution.workflowId).toBe(filters.workflowId)
            }
            
            // Check status filter
            if (filters.status) {
              expect(execution.status).toBe(filters.status)
            }
            
            // Check date range filters
            if (filters.startDate) {
              const startDateTime = new Date(filters.startDate)
              startDateTime.setHours(0, 0, 0, 0)
              const executionDate = new Date(execution.startedAt || execution.createdAt)
              expect(executionDate.getTime()).toBeGreaterThanOrEqual(startDateTime.getTime())
            }
            
            if (filters.endDate) {
              const endDateTime = new Date(filters.endDate)
              endDateTime.setHours(23, 59, 59, 999)
              const executionDate = new Date(execution.startedAt || execution.createdAt)
              expect(executionDate.getTime()).toBeLessThanOrEqual(endDateTime.getTime())
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return all history executions when no filters are applied', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        (executions) => {
          const filters: HistoryFilters = {}
          const filtered = filterHistoryExecutions(executions, filters)
          
          // Should return all history executions
          expect(filtered.length).toBe(executions.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not include running executions in filtered results', () => {
    fc.assert(
      fc.property(
        executionsArb, // Mixed statuses
        filtersArb,
        (executions, filters) => {
          const filtered = filterHistoryExecutions(executions, filters)
          
          // No running executions should be in the results
          for (const execution of filtered) {
            expect(RUNNING_STATUSES).not.toContain(execution.status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: execution-history-categories, Property 6: Pagination Correctness**
 * **Validates: Requirements 3.1**
 * 
 * For any page number and page size, the history section SHALL display at most 
 * pageSize records, and the total count SHALL reflect all matching records.
 */
describe('Property 6: Pagination Correctness', () => {
  // Generate history-only executions for pagination tests
  const historyExecutionsArb = fc.array(executionArb(historyStatusArb), { minLength: 0, maxLength: 100 })

  // Generate pagination parameters
  const paginationArb: fc.Arbitrary<PaginationParams> = fc.record({
    page: fc.integer({ min: 1, max: 20 }),
    pageSize: fc.integer({ min: 1, max: 50 }),
  })

  it('should return at most pageSize items', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        paginationArb,
        (executions, pagination) => {
          const result = paginateExecutions(executions, pagination)
          
          // Items count should be at most pageSize
          expect(result.items.length).toBeLessThanOrEqual(pagination.pageSize)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return correct total count', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        paginationArb,
        (executions, pagination) => {
          const result = paginateExecutions(executions, pagination)
          
          // Total should equal the input array length
          expect(result.total).toBe(executions.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should calculate totalPages correctly', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        paginationArb,
        (executions, pagination) => {
          const result = paginateExecutions(executions, pagination)
          
          // totalPages should be ceil(total / pageSize)
          const expectedTotalPages = Math.ceil(executions.length / pagination.pageSize)
          expect(result.totalPages).toBe(expectedTotalPages)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return correct items for each page', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        paginationArb,
        (executions, pagination) => {
          const result = paginateExecutions(executions, pagination)
          
          // Calculate expected slice
          const validPage = Math.max(1, Math.min(pagination.page, result.totalPages || 1))
          const startIndex = (validPage - 1) * pagination.pageSize
          const expectedItems = executions.slice(startIndex, startIndex + pagination.pageSize)
          
          // Items should match the expected slice
          expect(result.items).toEqual(expectedItems)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle page number exceeding total pages', () => {
    fc.assert(
      fc.property(
        fc.array(executionArb(historyStatusArb), { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 10 }),
        (executions, pageSize) => {
          const totalPages = Math.ceil(executions.length / pageSize)
          const pagination: PaginationParams = { page: totalPages + 5, pageSize }
          
          const result = paginateExecutions(executions, pagination)
          
          // Page should be clamped to totalPages
          expect(result.page).toBe(totalPages)
          // Should return items from the last page
          expect(result.items.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle page number less than 1', () => {
    fc.assert(
      fc.property(
        fc.array(executionArb(historyStatusArb), { minLength: 1, maxLength: 50 }),
        fc.integer({ min: -10, max: 0 }),
        fc.integer({ min: 1, max: 10 }),
        (executions, invalidPage, pageSize) => {
          const pagination: PaginationParams = { page: invalidPage, pageSize }
          
          const result = paginateExecutions(executions, pagination)
          
          // Page should be clamped to 1
          expect(result.page).toBe(1)
          // Should return items from the first page
          const expectedItems = executions.slice(0, pageSize)
          expect(result.items).toEqual(expectedItems)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return empty items for empty input', () => {
    fc.assert(
      fc.property(
        paginationArb,
        (pagination) => {
          const result = paginateExecutions([], pagination)
          
          expect(result.items).toEqual([])
          expect(result.total).toBe(0)
          expect(result.totalPages).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve item order during pagination', () => {
    fc.assert(
      fc.property(
        historyExecutionsArb,
        paginationArb,
        (executions, pagination) => {
          const result = paginateExecutions(executions, pagination)
          
          // Items should maintain their relative order from the original array
          for (let i = 0; i < result.items.length - 1; i++) {
            const currentIndex = executions.findIndex(e => e.id === result.items[i].id)
            const nextIndex = executions.findIndex(e => e.id === result.items[i + 1].id)
            expect(currentIndex).toBeLessThan(nextIndex)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should work correctly with filterAndPaginateHistory', () => {
    fc.assert(
      fc.property(
        executionsArb, // Mixed statuses
        paginationArb,
        (executions, pagination) => {
          const filters: HistoryFilters = {}
          const result = filterAndPaginateHistory(executions, filters, pagination)
          
          // Total should equal the number of history executions
          const historyCount = executions.filter(e => HISTORY_STATUSES.includes(e.status)).length
          expect(result.total).toBe(historyCount)
          
          // Items should be at most pageSize
          expect(result.items.length).toBeLessThanOrEqual(pagination.pageSize)
          
          // All items should be history executions
          for (const item of result.items) {
            expect(HISTORY_STATUSES).toContain(item.status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
