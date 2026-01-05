/**
 * Property-Based Tests for V1 Node Test API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 3: Node Test Returns Consistent Structure
 *
 * Validates: Requirements 3.1, 3.3, 3.4, 3.5
 *
 * For any testable node (PROCESS or CODE type) and any valid input, the test response SHALL contain:
 * - A success boolean indicating execution result
 * - Output data if successful, error details if failed
 * - Metrics including duration (and token usage for PROCESS nodes)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v1/workflows/[id]/nodes/[nodeId]/test/route'
import type { WorkflowConfig, NodeConfig, NodeType, NodePosition } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  validateApiTokenWithScope: vi.fn(),
  validateCrossOrganization: vi.fn(),
  createCrossOrgNotFoundResponse: vi.fn(),
  updateTokenUsage: vi.fn(),
}))

vi.mock('@/lib/workflow/processors', () => ({
  getProcessor: vi.fn(),
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  updateTokenUsage,
} from '@/lib/auth'
import { getProcessor } from '@/lib/workflow/processors'

// ============================================
// Arbitraries (Generators)
// ============================================

const testableNodeTypeArb: fc.Arbitrary<NodeType> = fc.constantFrom('PROCESS', 'CODE')

const nonTestableNodeTypeArb: fc.Arbitrary<NodeType> = fc.constantFrom('INPUT', 'OUTPUT')

const positionArb: fc.Arbitrary<NodePosition> = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
})

const nodeIdArb: fc.Arbitrary<string> = fc
  .string({ minLength: 5, maxLength: 20 })
  .map((s) => `node_${s.replace(/[^a-zA-Z0-9]/g, '')}`)
  .filter((s) => s.length > 5)

// Generate valid input data
const inputDataArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  fc.oneof(
    fc.string({ maxLength: 100 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minKeys: 0, maxKeys: 5 }
)

// Generate PROCESS node config
const processNodeConfigArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  systemPrompt: fc.string({ maxLength: 200 }),
  userPrompt: fc.string({ maxLength: 200 }),
  temperature: fc.double({ min: 0, max: 2, noNaN: true }),
  maxTokens: fc.integer({ min: 1, max: 4096 }),
})

// Generate CODE node config
const codeNodeConfigArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  prompt: fc.string({ maxLength: 200 }),
  language: fc.constantFrom('javascript', 'typescript', 'python'),
  code: fc.string({ maxLength: 500 }),
})

// Generate a testable node
const testableNodeArb: fc.Arbitrary<NodeConfig> = testableNodeTypeArb.chain((type) =>
  fc.record({
    id: nodeIdArb,
    type: fc.constant(type),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    position: positionArb,
    config: type === 'PROCESS' ? processNodeConfigArb : codeNodeConfigArb,
  }) as fc.Arbitrary<NodeConfig>
)

// Generate a non-testable node
const nonTestableNodeArb: fc.Arbitrary<NodeConfig> = nonTestableNodeTypeArb.chain((type) =>
  fc.record({
    id: nodeIdArb,
    type: fc.constant(type),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    position: positionArb,
    config: fc.constant(type === 'INPUT' ? { fields: [] } : { format: 'text' }),
  }) as fc.Arbitrary<NodeConfig>
)

// Generate execution metrics
const metricsArb: fc.Arbitrary<{
  duration: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}> = fc.record({
  duration: fc.integer({ min: 1, max: 30000 }),
  promptTokens: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
  completionTokens: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
  totalTokens: fc.option(fc.integer({ min: 0, max: 20000 }), { nil: undefined }),
})

// ============================================
// Test Setup
// ============================================

describe('V1 Node Test API - Property Tests', () => {
  const mockToken = {
    id: 'token-1',
    organizationId: 'org-1',
    createdById: 'user-1',
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
  })

  /**
   * Property 3: Node Test Returns Consistent Structure
   *
   * Feature: v1-workflow-api-enhancement, Property 3: Node Test Returns Consistent Structure
   * Validates: Requirements 3.1, 3.3, 3.4, 3.5
   */
  it('Property 3: successful node test should return consistent response structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        testableNodeArb,
        inputDataArb,
        metricsArb,
        async (node, input, mockMetrics) => {
          const workflowId = 'wf-test-1'

          // Create workflow config with INPUT node and the test node
          const workflowConfig: WorkflowConfig = {
            version: 1,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
              node,
            ],
            edges: [],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            config: workflowConfig,
            draftConfig: workflowConfig,
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

          // Mock processor to return success
          const mockProcessor = {
            process: vi.fn().mockResolvedValue({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              status: 'success',
              data: { result: 'test output' },
              startedAt: new Date(),
              completedAt: new Date(),
              duration: mockMetrics.duration,
              tokenUsage: node.type === 'PROCESS' ? {
                promptTokens: mockMetrics.promptTokens || 0,
                completionTokens: mockMetrics.completionTokens || 0,
                totalTokens: mockMetrics.totalTokens || 0,
              } : undefined,
            }),
          }
          vi.mocked(getProcessor).mockReturnValue(mockProcessor as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/test`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ input }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Property 3.1: Response should have success boolean
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(typeof data.data.success).toBe('boolean')
          expect(data.data.success).toBe(true)

          // Property 3.2: Successful response should have output
          expect(data.data).toHaveProperty('output')

          // Property 3.3: Response should have metrics with duration
          expect(data.data).toHaveProperty('metrics')
          expect(data.data.metrics).toHaveProperty('duration')
          expect(typeof data.data.metrics.duration).toBe('number')
          expect(data.data.metrics.duration).toBeGreaterThanOrEqual(0)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3.4: Failed node test should return error details
   *
   * Feature: v1-workflow-api-enhancement, Property 3: Node Test Returns Consistent Structure
   * Validates: Requirements 3.4
   */
  it('Property 3.4: failed node test should return error details and metrics', async () => {
    await fc.assert(
      fc.asyncProperty(
        testableNodeArb,
        inputDataArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (node, input, errorMessage) => {
          const workflowId = 'wf-test-2'

          const workflowConfig: WorkflowConfig = {
            version: 1,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
              node,
            ],
            edges: [],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            config: workflowConfig,
            draftConfig: workflowConfig,
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

          // Mock processor to return error
          const mockProcessor = {
            process: vi.fn().mockResolvedValue({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              status: 'error',
              error: errorMessage,
              data: {},
              startedAt: new Date(),
              completedAt: new Date(),
              duration: 100,
            }),
          }
          vi.mocked(getProcessor).mockReturnValue(mockProcessor as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/test`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ input }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Property 3.4.1: Response should indicate failure
          expect(response.status).toBe(200)
          expect(data.success).toBe(true) // API call succeeded
          expect(data.data.success).toBe(false) // Node test failed

          // Property 3.4.2: Failed response should have error details
          expect(data.data).toHaveProperty('error')
          expect(data.data.error).toHaveProperty('message')
          expect(typeof data.data.error.message).toBe('string')

          // Property 3.4.3: Failed response should still have metrics
          expect(data.data).toHaveProperty('metrics')
          expect(data.data.metrics).toHaveProperty('duration')
          expect(typeof data.data.metrics.duration).toBe('number')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3.5: PROCESS nodes should include token usage in metrics
   *
   * Feature: v1-workflow-api-enhancement, Property 3: Node Test Returns Consistent Structure
   * Validates: Requirements 3.5
   */
  it('Property 3.5: PROCESS node test should include token usage in metrics', async () => {
    await fc.assert(
      fc.asyncProperty(
        processNodeConfigArb,
        inputDataArb,
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        async (config, input, promptTokens, completionTokens) => {
          const workflowId = 'wf-test-3'
          const nodeId = 'process_node_1'
          const totalTokens = promptTokens + completionTokens

          const processNode: NodeConfig = {
            id: nodeId,
            type: 'PROCESS',
            name: 'Process Node',
            position: { x: 300, y: 100 },
            config,
          }

          const workflowConfig: WorkflowConfig = {
            version: 1,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
              processNode,
            ],
            edges: [],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            config: workflowConfig,
            draftConfig: workflowConfig,
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

          // Mock processor to return success with token usage
          const mockProcessor = {
            process: vi.fn().mockResolvedValue({
              nodeId,
              nodeName: 'Process Node',
              nodeType: 'PROCESS',
              status: 'success',
              data: { result: 'AI response' },
              startedAt: new Date(),
              completedAt: new Date(),
              duration: 500,
              tokenUsage: {
                promptTokens,
                completionTokens,
                totalTokens,
              },
            }),
          }
          vi.mocked(getProcessor).mockReturnValue(mockProcessor as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeId}/test`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ input }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId }),
          })
          const data = await response.json()

          // Property 3.5.1: Response should be successful
          expect(response.status).toBe(200)
          expect(data.data.success).toBe(true)

          // Property 3.5.2: Metrics should include token usage for PROCESS nodes
          expect(data.data.metrics).toHaveProperty('promptTokens')
          expect(data.data.metrics).toHaveProperty('completionTokens')
          expect(data.data.metrics).toHaveProperty('totalTokens')

          // Property 3.5.3: Token values should match
          expect(data.data.metrics.promptTokens).toBe(promptTokens)
          expect(data.data.metrics.completionTokens).toBe(completionTokens)
          expect(data.data.metrics.totalTokens).toBe(totalTokens)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3.6: INPUT/OUTPUT nodes should return 400 error
   *
   * Feature: v1-workflow-api-enhancement, Property 3: Node Test Returns Consistent Structure
   * Validates: Requirements 3.6
   */
  it('Property 3.6: INPUT/OUTPUT nodes should return 400 error', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonTestableNodeArb,
        inputDataArb,
        async (node, input) => {
          const workflowId = 'wf-test-4'

          const workflowConfig: WorkflowConfig = {
            version: 1,
            nodes: [node],
            edges: [],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            config: workflowConfig,
            draftConfig: workflowConfig,
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/test`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ input }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Property 3.6.1: Should return 400 status
          expect(response.status).toBe(400)

          // Property 3.6.2: Should indicate failure
          expect(data.success).toBe(false)

          // Property 3.6.3: Error message should mention the node type
          expect(data.error).toBeDefined()
          expect(data.error.message).toContain(node.type)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
