/**
 * Property-Based Tests for Node Feedback API
 *
 * Feature: workflow-test-mode
 * Property 1: 反馈数据完整性和持久化
 *
 * Validates: Requirements 3.3, 3.4
 *
 * Property 1: For any valid node feedback data, saving to database and querying
 * SHALL return a complete record containing all required fields (nodeId, executionId,
 * isCorrect, errorReason, createdAt).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/executions/[id]/node-feedback/route'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    execution: {
      findFirst: vi.fn(),
    },
    nodeTestFeedback: {
      create: vi.fn(),
      findMany: vi.fn(),
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
const nonEmptyStringArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0)

// Node output generator (simple JSON object)
const nodeOutputArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minKeys: 0, maxKeys: 5 }
)

// Valid feedback data generator (isCorrect = true)
const correctFeedbackArb: fc.Arbitrary<{
  nodeId: string
  nodeName: string
  nodeType: string
  isCorrect: true
  errorReason?: string
  errorCategory?: ErrorCategory
  nodeOutput?: Record<string, unknown>
}> = fc.record({
  nodeId: fc.uuid(),
  nodeName: nonEmptyStringArb,
  nodeType: nodeTypeArb,
  isCorrect: fc.constant(true as const),
  nodeOutput: fc.option(nodeOutputArb, { nil: undefined }),
})

// Valid feedback data generator (isCorrect = false, with error info)
const incorrectFeedbackArb: fc.Arbitrary<{
  nodeId: string
  nodeName: string
  nodeType: string
  isCorrect: false
  errorReason?: string
  errorCategory?: ErrorCategory
  nodeOutput?: Record<string, unknown>
}> = fc.record({
  nodeId: fc.uuid(),
  nodeName: nonEmptyStringArb,
  nodeType: nodeTypeArb,
  isCorrect: fc.constant(false as const),
  errorReason: fc.option(nonEmptyStringArb, { nil: undefined }),
  errorCategory: fc.option(errorCategoryArb, { nil: undefined }),
  nodeOutput: fc.option(nodeOutputArb, { nil: undefined }),
}).filter(f => f.errorReason !== undefined || f.errorCategory !== undefined)

// Combined feedback generator
const feedbackDataArb = fc.oneof(correctFeedbackArb, incorrectFeedbackArb)

// Generate multiple feedbacks for query tests
const feedbacksArrayArb = fc.array(feedbackDataArb, { minLength: 1, maxLength: 10 })

// ============================================
// Test Setup
// ============================================

describe('Node Feedback API - Property Tests', () => {
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

  const mockExecution = {
    id: 'exec-1',
    workflowId: 'wf-1',
    status: 'COMPLETED',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default successful auth
    vi.mocked(auth).mockResolvedValue(mockSession as never)

    // Setup execution mock
    vi.mocked(prisma.execution.findFirst).mockResolvedValue(mockExecution as never)
  })

  /**
   * Property 1a: Feedback data completeness - all required fields are preserved
   *
   * Feature: workflow-test-mode, Property 1: 反馈数据完整性和持久化
   * Validates: Requirements 3.3, 3.4
   */
  it('Property 1a: saved feedback contains all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        feedbackDataArb,
        async (feedbackData) => {
          const executionId = mockExecution.id
          const feedbackId = `feedback-${Date.now()}`
          const now = new Date()

          // Mock the create to return the saved feedback
          const savedFeedback = {
            id: feedbackId,
            executionId,
            nodeId: feedbackData.nodeId,
            nodeName: feedbackData.nodeName,
            nodeType: feedbackData.nodeType,
            isCorrect: feedbackData.isCorrect,
            errorReason: feedbackData.errorReason || null,
            errorCategory: feedbackData.errorCategory || null,
            nodeOutput: feedbackData.nodeOutput || null,
            userId: mockSession.user.id,
            createdAt: now,
            updatedAt: now,
          }

          vi.mocked(prisma.nodeTestFeedback.create).mockResolvedValue(savedFeedback as never)

          // Make POST request
          const request = new NextRequest(
            `http://localhost/api/executions/${executionId}/node-feedback`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(feedbackData),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: executionId }),
          })
          const data = await response.json()

          // Property 1a: Response must contain all required fields
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          const feedback = data.data.feedback

          // Required fields per Requirement 3.4
          expect(feedback).toHaveProperty('id')
          expect(feedback).toHaveProperty('executionId')
          expect(feedback).toHaveProperty('nodeId')
          expect(feedback).toHaveProperty('nodeName')
          expect(feedback).toHaveProperty('nodeType')
          expect(feedback).toHaveProperty('isCorrect')
          expect(feedback).toHaveProperty('createdAt')
          expect(feedback).toHaveProperty('userId')

          // Verify data integrity
          expect(feedback.executionId).toBe(executionId)
          expect(feedback.nodeId).toBe(feedbackData.nodeId)
          expect(feedback.nodeName).toBe(feedbackData.nodeName)
          expect(feedback.nodeType).toBe(feedbackData.nodeType)
          expect(feedback.isCorrect).toBe(feedbackData.isCorrect)
          expect(feedback.userId).toBe(mockSession.user.id)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1b: Error feedback must include error information
   *
   * Feature: workflow-test-mode, Property 1: 反馈数据完整性和持久化
   * Validates: Requirements 3.3, 3.4
   */
  it('Property 1b: error feedback preserves error reason and category', async () => {
    await fc.assert(
      fc.asyncProperty(
        incorrectFeedbackArb,
        async (feedbackData) => {
          const executionId = mockExecution.id
          const feedbackId = `feedback-${Date.now()}`
          const now = new Date()

          // Mock the create to return the saved feedback
          const savedFeedback = {
            id: feedbackId,
            executionId,
            nodeId: feedbackData.nodeId,
            nodeName: feedbackData.nodeName,
            nodeType: feedbackData.nodeType,
            isCorrect: feedbackData.isCorrect,
            errorReason: feedbackData.errorReason || null,
            errorCategory: feedbackData.errorCategory || null,
            nodeOutput: feedbackData.nodeOutput || null,
            userId: mockSession.user.id,
            createdAt: now,
            updatedAt: now,
          }

          vi.mocked(prisma.nodeTestFeedback.create).mockResolvedValue(savedFeedback as never)

          // Make POST request
          const request = new NextRequest(
            `http://localhost/api/executions/${executionId}/node-feedback`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(feedbackData),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: executionId }),
          })
          const data = await response.json()

          // Property 1b: Error feedback must preserve error information
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          const feedback = data.data.feedback
          expect(feedback.isCorrect).toBe(false)

          // At least one of errorReason or errorCategory must be present
          const hasErrorInfo = feedback.errorReason !== null || feedback.errorCategory !== null
          expect(hasErrorInfo).toBe(true)

          // If provided, values must match
          if (feedbackData.errorReason) {
            expect(feedback.errorReason).toBe(feedbackData.errorReason)
          }
          if (feedbackData.errorCategory) {
            expect(feedback.errorCategory).toBe(feedbackData.errorCategory)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1c: Node output is preserved correctly
   *
   * Feature: workflow-test-mode, Property 1: 反馈数据完整性和持久化
   * Validates: Requirements 3.4
   */
  it('Property 1c: node output data is preserved in feedback', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          nodeId: fc.uuid(),
          nodeName: nonEmptyStringArb,
          nodeType: nodeTypeArb,
          isCorrect: fc.constant(true),
          nodeOutput: nodeOutputArb,
        }),
        async (feedbackData) => {
          const executionId = mockExecution.id
          const feedbackId = `feedback-${Date.now()}`
          const now = new Date()

          // Mock the create to return the saved feedback
          const savedFeedback = {
            id: feedbackId,
            executionId,
            nodeId: feedbackData.nodeId,
            nodeName: feedbackData.nodeName,
            nodeType: feedbackData.nodeType,
            isCorrect: feedbackData.isCorrect,
            errorReason: null,
            errorCategory: null,
            nodeOutput: feedbackData.nodeOutput,
            userId: mockSession.user.id,
            createdAt: now,
            updatedAt: now,
          }

          vi.mocked(prisma.nodeTestFeedback.create).mockResolvedValue(savedFeedback as never)

          // Make POST request
          const request = new NextRequest(
            `http://localhost/api/executions/${executionId}/node-feedback`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(feedbackData),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: executionId }),
          })
          const data = await response.json()

          // Property 1c: Node output must be preserved
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          const feedback = data.data.feedback
          expect(feedback.nodeOutput).toEqual(feedbackData.nodeOutput)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1d: Query returns all feedbacks for an execution
   *
   * Feature: workflow-test-mode, Property 1: 反馈数据完整性和持久化
   * Validates: Requirements 3.4, 4.5
   */
  it('Property 1d: query returns all feedbacks with complete data', async () => {
    await fc.assert(
      fc.asyncProperty(
        feedbacksArrayArb,
        async (feedbacksData) => {
          const executionId = mockExecution.id
          const now = new Date()

          // Create mock saved feedbacks
          const savedFeedbacks = feedbacksData.map((f, i) => ({
            id: `feedback-${i}`,
            executionId,
            nodeId: f.nodeId,
            nodeName: f.nodeName,
            nodeType: f.nodeType,
            isCorrect: f.isCorrect,
            errorReason: f.errorReason || null,
            errorCategory: f.errorCategory || null,
            nodeOutput: f.nodeOutput || null,
            userId: mockSession.user.id,
            createdAt: now,
            updatedAt: now,
          }))

          vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(savedFeedbacks as never)

          // Make GET request
          const request = new NextRequest(
            `http://localhost/api/executions/${executionId}/node-feedback`,
            {
              method: 'GET',
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: executionId }),
          })
          const data = await response.json()

          // Property 1d: All feedbacks must be returned with complete data
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(data.data.feedbacks.length).toBe(feedbacksData.length)

          // Verify each feedback has required fields
          for (const feedback of data.data.feedbacks) {
            expect(feedback).toHaveProperty('id')
            expect(feedback).toHaveProperty('executionId')
            expect(feedback).toHaveProperty('nodeId')
            expect(feedback).toHaveProperty('nodeName')
            expect(feedback).toHaveProperty('nodeType')
            expect(feedback).toHaveProperty('isCorrect')
            expect(feedback).toHaveProperty('createdAt')
            expect(feedback).toHaveProperty('userId')
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4a: Query by nodeId returns only matching feedbacks
   *
   * Feature: workflow-test-mode, Property 4: 多维度查询正确性
   * Validates: Requirements 4.5
   */
  it('Property 4a: query by nodeId returns only matching feedbacks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(feedbackDataArb, { minLength: 2, maxLength: 10 }),
        fc.uuid(),
        async (feedbacksData, targetNodeId) => {
          const executionId = mockExecution.id
          const now = new Date()

          // Assign the target nodeId to some feedbacks
          const feedbacksWithTargetNode = feedbacksData.map((f, i) => ({
            ...f,
            nodeId: i % 2 === 0 ? targetNodeId : f.nodeId,
          }))

          // Create mock saved feedbacks - only those matching targetNodeId
          const matchingFeedbacks = feedbacksWithTargetNode
            .filter(f => f.nodeId === targetNodeId)
            .map((f, i) => ({
              id: `feedback-${i}`,
              executionId,
              nodeId: f.nodeId,
              nodeName: f.nodeName,
              nodeType: f.nodeType,
              isCorrect: f.isCorrect,
              errorReason: f.errorReason || null,
              errorCategory: f.errorCategory || null,
              nodeOutput: f.nodeOutput || null,
              userId: mockSession.user.id,
              createdAt: now,
              updatedAt: now,
            }))

          vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(matchingFeedbacks as never)

          // Make GET request with nodeId filter
          const request = new NextRequest(
            `http://localhost/api/executions/${executionId}/node-feedback?nodeId=${targetNodeId}`,
            {
              method: 'GET',
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: executionId }),
          })
          const data = await response.json()

          // Property 4a: All returned feedbacks must have the target nodeId
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          for (const feedback of data.data.feedbacks) {
            expect(feedback.nodeId).toBe(targetNodeId)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4b: Query without filters returns all feedbacks
   *
   * Feature: workflow-test-mode, Property 4: 多维度查询正确性
   * Validates: Requirements 4.5
   */
  it('Property 4b: query without filters returns all feedbacks for execution', async () => {
    await fc.assert(
      fc.asyncProperty(
        feedbacksArrayArb,
        async (feedbacksData) => {
          const executionId = mockExecution.id
          const now = new Date()

          // Create mock saved feedbacks with different nodeIds
          const savedFeedbacks = feedbacksData.map((f, i) => ({
            id: `feedback-${i}`,
            executionId,
            nodeId: f.nodeId,
            nodeName: f.nodeName,
            nodeType: f.nodeType,
            isCorrect: f.isCorrect,
            errorReason: f.errorReason || null,
            errorCategory: f.errorCategory || null,
            nodeOutput: f.nodeOutput || null,
            userId: mockSession.user.id,
            createdAt: now,
            updatedAt: now,
          }))

          vi.mocked(prisma.nodeTestFeedback.findMany).mockResolvedValue(savedFeedbacks as never)

          // Make GET request without filters
          const request = new NextRequest(
            `http://localhost/api/executions/${executionId}/node-feedback`,
            {
              method: 'GET',
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: executionId }),
          })
          const data = await response.json()

          // Property 4b: Count must match total feedbacks
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(data.data.feedbacks.length).toBe(feedbacksData.length)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
