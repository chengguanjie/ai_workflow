/**
 * Property-Based Tests for Test Execution API
 *
 * Feature: workflow-test-mode
 * Property 2: 测试执行记录完整性
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 *
 * Property 2: For any test mode execution, the created execution record SHALL contain
 * executionType=TEST, isAIGeneratedInput flag, input data, and other metadata.
 * Node feedbacks SHALL be correctly associated with the execution record.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/workflows/[id]/execute/route'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
    },
    execution: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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

vi.mock('@/lib/workflow/engine', () => ({
  executeWorkflow: vi.fn(),
  ExecutionOptions: {},
}))

vi.mock('@/lib/workflow/queue', () => ({
  executionQueue: {
    enqueue: vi.fn(),
  },
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'

// ============================================
// Arbitraries (Generators)
// ============================================

// Execution type generator
const EXECUTION_TYPES = ['NORMAL', 'TEST'] as const
type ExecutionType = (typeof EXECUTION_TYPES)[number]
const executionTypeArb: fc.Arbitrary<ExecutionType> = fc.constantFrom(...EXECUTION_TYPES)

// Boolean generator for isAIGeneratedInput
const isAIGeneratedInputArb: fc.Arbitrary<boolean> = fc.boolean()

// Reserved JavaScript property names that should be excluded from generated keys
const RESERVED_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
])

// Input data generator (simple JSON object)
// Excludes reserved JavaScript property names that don't serialize properly
const inputDataArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) && !RESERVED_PROPERTY_NAMES.has(s)
  ),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minKeys: 0, maxKeys: 5 }
)

// Test execution request generator
const testExecutionRequestArb: fc.Arbitrary<{
  input?: Record<string, unknown>
  executionType: ExecutionType
  isAIGeneratedInput: boolean
  mode?: 'production' | 'draft'
}> = fc.record({
  input: fc.option(inputDataArb, { nil: undefined }),
  executionType: executionTypeArb,
  isAIGeneratedInput: isAIGeneratedInputArb,
  mode: fc.option(fc.constantFrom('production' as const, 'draft' as const), { nil: undefined }),
})

// Test-only execution request generator (executionType = TEST)
const testModeExecutionRequestArb: fc.Arbitrary<{
  input?: Record<string, unknown>
  executionType: 'TEST'
  isAIGeneratedInput: boolean
  mode?: 'production' | 'draft'
}> = fc.record({
  input: fc.option(inputDataArb, { nil: undefined }),
  executionType: fc.constant('TEST' as const),
  isAIGeneratedInput: isAIGeneratedInputArb,
  mode: fc.option(fc.constantFrom('production' as const, 'draft' as const), { nil: undefined }),
})

// ============================================
// Test Setup
// ============================================

describe('Test Execution API - Property Tests', () => {
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
    config: {
      nodes: [
        { id: 'node-1', name: 'Input', type: 'INPUT', position: { x: 0, y: 0 }, config: {} },
        { id: 'node-2', name: 'Process', type: 'PROCESS', position: { x: 100, y: 0 }, config: {} },
      ],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
    },
    publishedConfig: null,
    draftConfig: null,
    publishStatus: 'DRAFT',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default successful auth
    vi.mocked(auth).mockResolvedValue(mockSession as never)

    // Setup workflow mock
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

    // Setup user mock
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: mockSession.user.id,
      departmentId: null,
    } as never)
  })

  /**
   * Property 2a: Test execution record contains executionType=TEST
   *
   * Feature: workflow-test-mode, Property 2: 测试执行记录完整性
   * Validates: Requirements 4.1
   */
  it('Property 2a: test mode execution creates record with executionType=TEST', async () => {
    await fc.assert(
      fc.asyncProperty(
        testModeExecutionRequestArb,
        async (requestData) => {
          const workflowId = mockWorkflow.id
          const executionId = `exec-${Date.now()}`
          const now = new Date()

          // Track the execution creation call
          let capturedExecutionData: Record<string, unknown> | null = null

          // Mock executeWorkflow to capture the execution type
          vi.mocked(executeWorkflow).mockImplementation(async (
            _workflowId,
            _organizationId,
            _userId,
            _input,
            options
          ) => {
            capturedExecutionData = {
              executionType: options?.executionType,
              isAIGeneratedInput: options?.isAIGeneratedInput,
            }
            return {
              status: 'COMPLETED' as const,
              executionId,
              output: { result: 'success' },
              duration: 100,
              totalTokens: 0,
              promptTokens: 0,
              completionTokens: 0,
            }
          })

          // Make POST request
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestData),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 2a: Execution must be created with TEST type
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(capturedExecutionData).not.toBeNull()
          expect(capturedExecutionData?.executionType).toBe('TEST')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2b: Test execution record contains isAIGeneratedInput flag
   *
   * Feature: workflow-test-mode, Property 2: 测试执行记录完整性
   * Validates: Requirements 4.3
   */
  it('Property 2b: test execution preserves isAIGeneratedInput flag', async () => {
    await fc.assert(
      fc.asyncProperty(
        testModeExecutionRequestArb,
        async (requestData) => {
          const workflowId = mockWorkflow.id
          const executionId = `exec-${Date.now()}`

          // Track the execution creation call
          let capturedIsAIGenerated: boolean | undefined

          // Mock executeWorkflow to capture the flag
          vi.mocked(executeWorkflow).mockImplementation(async (
            _workflowId,
            _organizationId,
            _userId,
            _input,
            options
          ) => {
            capturedIsAIGenerated = options?.isAIGeneratedInput
            return {
              status: 'COMPLETED' as const,
              executionId,
              output: { result: 'success' },
              duration: 100,
              totalTokens: 0,
              promptTokens: 0,
              completionTokens: 0,
            }
          })

          // Make POST request
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestData),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 2b: isAIGeneratedInput flag must be preserved
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(capturedIsAIGenerated).toBe(requestData.isAIGeneratedInput)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2c: Test execution record contains input data
   *
   * Feature: workflow-test-mode, Property 2: 测试执行记录完整性
   * Validates: Requirements 4.1, 4.3
   */
  it('Property 2c: test execution preserves input data', async () => {
    await fc.assert(
      fc.asyncProperty(
        testModeExecutionRequestArb.filter(r => r.input !== undefined),
        async (requestData) => {
          const workflowId = mockWorkflow.id
          const executionId = `exec-${Date.now()}`

          // Track the input data
          let capturedInput: Record<string, unknown> | undefined

          // Mock executeWorkflow to capture the input
          vi.mocked(executeWorkflow).mockImplementation(async (
            _workflowId,
            _organizationId,
            _userId,
            input,
            _options
          ) => {
            capturedInput = input
            return {
              status: 'COMPLETED' as const,
              executionId,
              output: { result: 'success' },
              duration: 100,
              totalTokens: 0,
              promptTokens: 0,
              completionTokens: 0,
            }
          })

          // Make POST request
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestData),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 2c: Input data must be preserved
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(capturedInput).toEqual(requestData.input)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2d: Async test execution passes executionType to queue
   *
   * Feature: workflow-test-mode, Property 2: 测试执行记录完整性
   * Validates: Requirements 4.1, 4.3
   */
  it('Property 2d: async test execution passes executionType to queue', async () => {
    await fc.assert(
      fc.asyncProperty(
        testModeExecutionRequestArb,
        async (requestData) => {
          const workflowId = mockWorkflow.id
          const taskId = `task-${Date.now()}`

          // Track the queue enqueue call
          let capturedQueueOptions: Record<string, unknown> | undefined

          // Mock queue enqueue
          vi.mocked(executionQueue.enqueue).mockImplementation(async (
            _workflowId,
            _organizationId,
            _userId,
            _input,
            options
          ) => {
            capturedQueueOptions = options
            return taskId
          })

          // Make POST request with async=true
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...requestData,
                async: true,
              }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 2d: Queue must receive executionType and isAIGeneratedInput
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(capturedQueueOptions).toBeDefined()
          expect(capturedQueueOptions?.executionType).toBe(requestData.executionType)
          expect(capturedQueueOptions?.isAIGeneratedInput).toBe(requestData.isAIGeneratedInput)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2e: Normal execution defaults to NORMAL type
   *
   * Feature: workflow-test-mode, Property 2: 测试执行记录完整性
   * Validates: Requirements 4.1
   */
  it('Property 2e: execution without executionType defaults to NORMAL', async () => {
    await fc.assert(
      fc.asyncProperty(
        inputDataArb,
        async (inputData) => {
          const workflowId = mockWorkflow.id
          const executionId = `exec-${Date.now()}`

          // Track the execution creation call
          let capturedExecutionType: string | undefined

          // Mock executeWorkflow to capture the execution type
          vi.mocked(executeWorkflow).mockImplementation(async (
            _workflowId,
            _organizationId,
            _userId,
            _input,
            options
          ) => {
            capturedExecutionType = options?.executionType
            return {
              status: 'COMPLETED' as const,
              executionId,
              output: { result: 'success' },
              duration: 100,
              totalTokens: 0,
              promptTokens: 0,
              completionTokens: 0,
            }
          })

          // Make POST request without executionType
          const request = new NextRequest(
            `http://localhost/api/workflows/${workflowId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ input: inputData }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId }),
          })
          const data = await response.json()

          // Property 2e: Default executionType should be NORMAL
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(capturedExecutionType).toBe('NORMAL')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
