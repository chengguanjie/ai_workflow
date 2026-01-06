/**
 * Property-Based Tests for Test Statistics API
 *
 * Feature: workflow-test-mode
 * Property 6: 统计计算正确性
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5
 *
 * Property 6: For any node feedback dataset, the calculated correct rate SHALL equal
 * correctCount / totalCount, error category statistics SHALL equal the actual count
 * of each category, and time filtering SHALL only include data within the specified range.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/workflows/[id]/test-statistics/route'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    nodeTestFeedback: {
      findMany: vi.fn(),
    },
    execution: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/server/services/workflow.service', () => ({
  workflowService: {
    getById: vi.fn(),
  },
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { workflowService } from '@/server/services/workflow.service'

// ============================================
// Arbitraries (Generators)
// ============================================

// Error category generator
const ERROR_CATEGORIES = [
  'OUTPUT_FORMAT',
  'OUTPUT_CONTENT',
  'MISSING_DATA',
  'LOGIC_ERROR',
  'PERFORMANCE',
  'OTHER',
] as const

type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

const errorCategoryArb: fc.Arbitrary<ErrorCategory> = fc.constantFrom(...ERROR_CATEGORIES)

// Node type generator
const NODE_TYPES = ['INPUT', 'PROCESS', 'OUTPUT', 'CONDITION', 'LOOP', 'HTTP', 'CODE'] as const
const nodeTypeArb: fc.Arbitrary<string> = fc.constantFrom(...NODE_TYPES)

// Non-empty string generator for required fields
const nonEmptyStringArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

// Date within a reasonable range (last 30 days)
const recentDateArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 30 * 24 * 60 * 60 * 1000 })
  .map((offset) => new Date(Date.now() - offset))

// Single feedback record generator
const feedbackRecordArb: fc.Arbitrary<{
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  isCorrect: boolean
  errorCategory: ErrorCategory | null
  createdAt: Date
}> = fc.record({
  id: fc.uuid(),
  nodeId: fc.uuid(),
  nodeName: nonEmptyStringArb,
  nodeType: nodeTypeArb,
  isCorrect: fc.boolean(),
  errorCategory: fc.option(errorCategoryArb, { nil: null }),
  createdAt: recentDateArb,
})

// Array of feedback records
const feedbacksArrayArb: fc.Arbitrary<
  Array<{
    id: string
    nodeId: string
    nodeName: string
    nodeType: string
    isCorrect: boolean
    errorCategory: ErrorCategory | null
    createdAt: Date
  }>
> = fc.array(feedbackRecordArb, { minLength: 1, maxLength: 50 })

// ============================================
// Test Setup
// ============================================

describe('Test Statistics API - Property Tests', () => {
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

  const mockWorkflow = {
    id: 'wf-1',
    name: 'Test Workflow',
    organizationId: 'org-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default successful auth
    vi.mocked(auth).mockResolvedValue(mockSession as never)

    // Setup workflow mock
    vi.mocked(workflowService.getById).mockResolvedValue(mockWorkflow as never)
  })

  /**
   * Property 6a: Correct rate calculation is accurate
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.2
   */
  it('Property 6a: correct rate equals correctCount / totalCount for each node', async () => {
    await fc.assert(
      fc.asyncProperty(feedbacksArrayArb, async (feedbacks) => {
        const workflowId = mockWorkflow.id

        // Mock the database responses
        vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(feedbacks as never)
        vi.mocked(prisma.execution.count).mockResolvedValue(feedbacks.length)
        vi.mocked(prisma.execution.findMany).mockResolvedValue([])

        // Make GET request
        const request = new NextRequest(
          `http://localhost/api/workflows/${workflowId}/test-statistics`,
          { method: 'GET' }
        )

        const response = await GET(request, {
          user: mockSession.user,
          params: { id: workflowId },
        } as never)
        const data = await response.json()

        // Property 6a: Verify correct rate calculation
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Calculate expected statistics per node
        const expectedStats = new Map<
          string,
          { totalFeedbacks: number; correctCount: number; incorrectCount: number }
        >()

        for (const feedback of feedbacks) {
          if (!expectedStats.has(feedback.nodeId)) {
            expectedStats.set(feedback.nodeId, {
              totalFeedbacks: 0,
              correctCount: 0,
              incorrectCount: 0,
            })
          }
          const stats = expectedStats.get(feedback.nodeId)!
          stats.totalFeedbacks++
          if (feedback.isCorrect) {
            stats.correctCount++
          } else {
            stats.incorrectCount++
          }
        }

        // Verify each node's statistics
        for (const nodeStat of data.data.nodeStatistics) {
          const expected = expectedStats.get(nodeStat.nodeId)
          if (expected) {
            expect(nodeStat.totalFeedbacks).toBe(expected.totalFeedbacks)
            expect(nodeStat.correctCount).toBe(expected.correctCount)
            expect(nodeStat.incorrectCount).toBe(expected.incorrectCount)

            // Verify correct rate calculation
            const expectedRate =
              expected.totalFeedbacks > 0 ? expected.correctCount / expected.totalFeedbacks : 0
            expect(nodeStat.correctRate).toBeCloseTo(expectedRate, 10)
          }
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6b: Error category breakdown is accurate
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.3
   */
  it('Property 6b: error category breakdown equals actual count of each category', async () => {
    await fc.assert(
      fc.asyncProperty(feedbacksArrayArb, async (feedbacks) => {
        const workflowId = mockWorkflow.id

        // Mock the database responses
        vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(feedbacks as never)
        vi.mocked(prisma.execution.count).mockResolvedValue(feedbacks.length)
        vi.mocked(prisma.execution.findMany).mockResolvedValue([])

        // Make GET request
        const request = new NextRequest(
          `http://localhost/api/workflows/${workflowId}/test-statistics`,
          { method: 'GET' }
        )

        const response = await GET(request, {
          user: mockSession.user,
          params: { id: workflowId },
        } as never)
        const data = await response.json()

        // Property 6b: Verify error category breakdown
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Calculate expected error category breakdown
        const expectedBreakdown: Record<string, number> = {}
        for (const feedback of feedbacks) {
          if (!feedback.isCorrect && feedback.errorCategory) {
            expectedBreakdown[feedback.errorCategory] =
              (expectedBreakdown[feedback.errorCategory] || 0) + 1
          }
        }

        // Verify error category breakdown
        const actualBreakdown = data.data.errorCategoryBreakdown
        for (const category of ERROR_CATEGORIES) {
          const expectedCount = expectedBreakdown[category] || 0
          const actualCount = actualBreakdown[category] || 0
          expect(actualCount).toBe(expectedCount)
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6c: Node statistics include all nodes with feedbacks
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.2
   */
  it('Property 6c: node statistics include all nodes that have feedbacks', async () => {
    await fc.assert(
      fc.asyncProperty(feedbacksArrayArb, async (feedbacks) => {
        const workflowId = mockWorkflow.id

        // Mock the database responses
        vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(feedbacks as never)
        vi.mocked(prisma.execution.count).mockResolvedValue(feedbacks.length)
        vi.mocked(prisma.execution.findMany).mockResolvedValue([])

        // Make GET request
        const request = new NextRequest(
          `http://localhost/api/workflows/${workflowId}/test-statistics`,
          { method: 'GET' }
        )

        const response = await GET(request, {
          user: mockSession.user,
          params: { id: workflowId },
        } as never)
        const data = await response.json()

        // Property 6c: All unique nodes should be in statistics
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Get unique node IDs from feedbacks
        const uniqueNodeIds = new Set(feedbacks.map((f) => f.nodeId))

        // Get node IDs from statistics
        const statsNodeIds = new Set(
          data.data.nodeStatistics.map((s: { nodeId: string }) => s.nodeId)
        )

        // Verify all unique nodes are included
        expect(statsNodeIds.size).toBe(uniqueNodeIds.size)
        for (const nodeId of uniqueNodeIds) {
          expect(statsNodeIds.has(nodeId)).toBe(true)
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6d: Time filtering only includes data within range
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.4
   */
  it('Property 6d: time filtering only includes data within specified range', async () => {
    await fc.assert(
      fc.asyncProperty(
        feedbacksArrayArb,
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
        async (feedbacks, date1, date2) => {
          const workflowId = mockWorkflow.id

          // Ensure startDate <= endDate
          const startDate = date1 < date2 ? date1 : date2
          const endDate = date1 < date2 ? date2 : date1

          // Filter feedbacks that would be within the date range
          const filteredFeedbacks = feedbacks.filter((f) => {
            const feedbackDate = f.createdAt
            return feedbackDate >= startDate && feedbackDate <= endDate
          })

          // Mock the database responses with filtered data
          vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(filteredFeedbacks as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(filteredFeedbacks.length)
          vi.mocked(prisma.execution.findMany).mockResolvedValue([])

          // Make GET request with date filters
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/test-statistics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
            { method: 'GET' }
          )

          const response = await GET(request, {
            user: mockSession.user,
            params: { id: workflowId },
          } as never)
          const data = await response.json()

          // Property 6d: Verify time filtering
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify the prisma query was called with date filters
          expect(prisma.nodeTestFeedback.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                createdAt: expect.objectContaining({
                  gte: expect.any(Date),
                  lte: expect.any(Date),
                }),
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
   * Property 6e: Trend data is correctly aggregated by date
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.5
   */
  it('Property 6e: trend data is correctly aggregated by date', async () => {
    await fc.assert(
      fc.asyncProperty(feedbacksArrayArb, async (feedbacks) => {
        const workflowId = mockWorkflow.id

        // Mock the database responses
        vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(feedbacks as never)
        vi.mocked(prisma.execution.count).mockResolvedValue(feedbacks.length)
        vi.mocked(prisma.execution.findMany).mockResolvedValue([])

        // Make GET request
        const request = new NextRequest(
          `http://localhost/api/workflows/${workflowId}/test-statistics`,
          { method: 'GET' }
        )

        const response = await GET(request, {
          user: mockSession.user,
          params: { id: workflowId },
        } as never)
        const data = await response.json()

        // Property 6e: Verify trend data aggregation
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Calculate expected trend data
        const expectedTrend = new Map<string, { correctCount: number; totalCount: number }>()
        for (const feedback of feedbacks) {
          const date = feedback.createdAt.toISOString().split('T')[0]
          if (!expectedTrend.has(date)) {
            expectedTrend.set(date, { correctCount: 0, totalCount: 0 })
          }
          const item = expectedTrend.get(date)!
          item.totalCount++
          if (feedback.isCorrect) {
            item.correctCount++
          }
        }

        // Verify trend data
        for (const trendItem of data.data.trend) {
          const expected = expectedTrend.get(trendItem.date)
          if (expected) {
            const expectedRate =
              expected.totalCount > 0 ? expected.correctCount / expected.totalCount : 0
            expect(trendItem.correctRate).toBeCloseTo(expectedRate, 10)
          }
        }

        // Verify trend is sorted by date
        const dates = data.data.trend.map((t: { date: string }) => t.date)
        const sortedDates = [...dates].sort()
        expect(dates).toEqual(sortedDates)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6f: Empty feedback set returns zero statistics
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.2, 6.3
   */
  it('Property 6f: empty feedback set returns zero statistics', async () => {
    const workflowId = mockWorkflow.id

    // Mock empty database responses
    vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue([])
    vi.mocked(prisma.execution.count).mockResolvedValue(0)
    vi.mocked(prisma.execution.findMany).mockResolvedValue([])

    // Make GET request
    const request = new NextRequest(
      `http://localhost/api/workflows/${workflowId}/test-statistics`,
      { method: 'GET' }
    )

    const response = await GET(request, {
      user: mockSession.user,
      params: { id: workflowId },
    } as never)
    const data = await response.json()

    // Property 6f: Verify empty statistics
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.totalTests).toBe(0)
    expect(data.data.nodeStatistics).toEqual([])
    expect(data.data.errorCategoryBreakdown).toEqual({})
    expect(data.data.trend).toEqual([])
  })

  /**
   * Property 6g: Node ID filter returns statistics for specific node only
   *
   * Feature: workflow-test-mode, Property 6: 统计计算正确性
   * Validates: Requirements 6.2
   */
  it('Property 6g: nodeId filter returns statistics for specific node only', async () => {
    await fc.assert(
      fc.asyncProperty(
        feedbacksArrayArb.filter((f) => f.length >= 2),
        async (feedbacks) => {
          const workflowId = mockWorkflow.id
          const targetNodeId = feedbacks[0].nodeId

          // Filter feedbacks for the target node
          const filteredFeedbacks = feedbacks.filter((f) => f.nodeId === targetNodeId)

          // Mock the database responses with filtered data
          vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(filteredFeedbacks as never)
          vi.mocked(prisma.execution.count).mockResolvedValue(filteredFeedbacks.length)
          vi.mocked(prisma.execution.findMany).mockResolvedValue([])

          // Make GET request with nodeId filter
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/test-statistics?nodeId=${targetNodeId}`,
            { method: 'GET' }
          )

          const response = await GET(request, {
            user: mockSession.user,
            params: { id: workflowId },
          } as never)
          const data = await response.json()

          // Property 6g: Verify nodeId filtering
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Verify the prisma query was called with nodeId filter
          expect(prisma.nodeTestFeedback.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                nodeId: targetNodeId,
              }),
            })
          )

          // All returned node statistics should be for the target node
          for (const nodeStat of data.data.nodeStatistics) {
            expect(nodeStat.nodeId).toBe(targetNodeId)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
