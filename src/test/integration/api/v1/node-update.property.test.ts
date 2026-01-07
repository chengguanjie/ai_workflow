/**
 * Property-Based Tests for V1 Node Update API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 1: Node Update Preserves Workflow Integrity
 *
 * Validates: Requirements 1.1, 1.3, 1.4
 *
 * For any valid workflow and any valid node update request, updating a node SHALL result in:
 * - The node's configuration being updated to match the request
 * - The workflow version being incremented by 1
 * - The publishStatus changing to DRAFT_MODIFIED if it was PUBLISHED
 * - All other nodes remaining unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { PUT } from '@/app/api/v1/workflows/[id]/nodes/[nodeId]/route'
import type { WorkflowConfig, NodeConfig, NodeType, NodePosition } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
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

const nodeTypeArb: fc.Arbitrary<NodeType> = fc.constantFrom(
  'INPUT',
  'PROCESS',
  'CODE',
  'OUTPUT',
  'LOGIC'
)

const positionArb: fc.Arbitrary<NodePosition> = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
})

const nodeNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

const nodeIdArb: fc.Arbitrary<string> = fc
  .string({ minLength: 5, maxLength: 20 })
  .map((s) => `node_${s.replace(/[^a-zA-Z0-9]/g, '')}`)
  .filter((s) => s.length > 5)

// Generate a valid node config based on type
const nodeConfigArb = (type: NodeType): fc.Arbitrary<Record<string, unknown>> => {
  switch (type) {
    case 'INPUT':
      return fc.constant({ fields: [] })
    case 'PROCESS':
      return fc.record({
        systemPrompt: fc.string({ maxLength: 200 }),
        userPrompt: fc.string({ maxLength: 200 }),
        temperature: fc.double({ min: 0, max: 2, noNaN: true }),
        maxTokens: fc.integer({ min: 1, max: 4096 }),
      })
    case 'CODE':
      return fc.record({
        prompt: fc.string({ maxLength: 200 }),
        language: fc.constantFrom('javascript', 'typescript', 'python'),
        code: fc.string({ maxLength: 500 }),
      })
    case 'OUTPUT':
      return fc.record({
        prompt: fc.string({ maxLength: 200 }),
        format: fc.constantFrom('text', 'json', 'markdown'),
      })
    case 'LOGIC':
      return fc.record({
        mode: fc.constantFrom('condition', 'merge'),
        conditions: fc.constant([]),
      })
    default:
      return fc.constant({})
  }
}

// Generate a single node
const nodeArb: fc.Arbitrary<NodeConfig> = nodeTypeArb.chain((type) =>
  fc.record({
    id: nodeIdArb,
    type: fc.constant(type),
    name: nodeNameArb,
    position: positionArb,
    config: nodeConfigArb(type),
  }) as fc.Arbitrary<NodeConfig>
)

// Generate a workflow config with at least one INPUT node
const workflowConfigArb: fc.Arbitrary<WorkflowConfig> = fc
  .array(nodeArb, { minLength: 1, maxLength: 5 })
  .chain((nodes) => {
    // Ensure at least one INPUT node exists
    const hasInput = nodes.some((n) => n.type === 'INPUT')
    const finalNodes = hasInput
      ? nodes
      : [
          {
            id: 'input_default',
            type: 'INPUT' as NodeType,
            name: 'Input',
            position: { x: 100, y: 100 },
            config: { fields: [] },
          } as NodeConfig,
          ...nodes,
        ]

    return fc.record({
      version: fc.integer({ min: 1, max: 100 }),
      nodes: fc.constant(finalNodes),
      edges: fc.constant([]),
    })
  })

// Generate a valid update request
const updateRequestArb: fc.Arbitrary<{
  name?: string
  type?: NodeType
  position?: NodePosition
  config?: Record<string, unknown>
}> = fc.record(
  {
    name: fc.option(nodeNameArb, { nil: undefined }),
    type: fc.option(nodeTypeArb, { nil: undefined }),
    position: fc.option(positionArb, { nil: undefined }),
    config: fc.option(
      fc.record({
        userPrompt: fc.string({ maxLength: 100 }),
      }),
      { nil: undefined }
    ),
  },
  { requiredKeys: [] }
)

// ============================================
// Test Setup
// ============================================

describe('V1 Node Update API - Property Tests', () => {
  const mockToken = {
    id: 'token-1',
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
  })

  /**
   * Property 1: Node Update Preserves Workflow Integrity
   *
   * Feature: v1-workflow-api-enhancement, Property 1: Node Update Preserves Workflow Integrity
   * Validates: Requirements 1.1, 1.3, 1.4
   */
  it('Property 1: updating a node should increment version and preserve other nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowConfigArb,
        updateRequestArb,
        fc.constantFrom('DRAFT', 'PUBLISHED', 'DRAFT_MODIFIED'),
        async (workflowConfig, updateRequest, publishStatus) => {
          // Skip if no nodes to update
          if (workflowConfig.nodes.length === 0) return true

          // Pick a random node to update
          const nodeIndex = Math.floor(Math.random() * workflowConfig.nodes.length)
          const targetNode = workflowConfig.nodes[nodeIndex]
          const workflowId = 'wf-test-1'
          const originalVersion = workflowConfig.version

          // Setup mock workflow
          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            version: originalVersion,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus,
          }

          ;(prisma.workflow.findFirst as any).mockResolvedValue(mockWorkflow)

          let capturedUpdateData: { config?: WorkflowConfig; publishStatus?: string } | undefined
          ;(prisma.workflow.update as any).mockImplementation((args: any) => {
            capturedUpdateData = args?.data
            return Promise.resolve({ ...mockWorkflow, ...(capturedUpdateData || {}) })
          })

          // Create request
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${targetNode.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify(updateRequest),
            }
          )

          // Execute
          const response = await PUT(request, {
            params: Promise.resolve({ id: workflowId, nodeId: targetNode.id }),
          })
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Property 1.1: Version should be incremented by 1
          expect(data.data.workflowVersion).toBe(originalVersion + 1)

          // Property 1.2: Updated node should reflect the changes
          const updatedNode = data.data.node
          if (updateRequest.name !== undefined) {
            expect(updatedNode.name).toBe(updateRequest.name)
          }
          if (updateRequest.position !== undefined) {
            expect(updatedNode.position).toEqual(updateRequest.position)
          }

          // Property 1.3: Other nodes should remain unchanged
          if (!capturedUpdateData) throw new Error('expected prisma.workflow.update to be called')
          const savedConfig = capturedUpdateData.config as WorkflowConfig
          const otherNodes = savedConfig.nodes.filter((n) => n.id !== targetNode.id)
          const originalOtherNodes = workflowConfig.nodes.filter(
            (n) => n.id !== targetNode.id
          )

          expect(otherNodes.length).toBe(originalOtherNodes.length)
          otherNodes.forEach((node, idx) => {
            expect(node.id).toBe(originalOtherNodes[idx].id)
            expect(node.name).toBe(originalOtherNodes[idx].name)
            expect(node.type).toBe(originalOtherNodes[idx].type)
          })

          // Property 1.4: PublishStatus should change to DRAFT_MODIFIED if was PUBLISHED
          if (publishStatus === 'PUBLISHED') {
            expect(capturedUpdateData.publishStatus).toBe('DRAFT_MODIFIED')
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1.3: Node type change should apply default config
   *
   * Feature: v1-workflow-api-enhancement, Property 1: Node Update Preserves Workflow Integrity
   * Validates: Requirements 1.3
   */
  it('Property 1.3: changing node type should apply default config for new type', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeTypeArb,
        nodeTypeArb.filter((t) => t !== 'INPUT'), // Exclude INPUT as target to avoid complexity
        async (originalType, newType) => {
          // Skip if types are the same
          if (originalType === newType) return true

          const workflowId = 'wf-test-2'
          const nodeId = 'node_test_1'

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
              {
                id: nodeId,
                type: originalType,
                name: 'Test Node',
                position: { x: 300, y: 100 },
                config: {},
              } as NodeConfig,
            ],
            edges: [],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            version: 1,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
          vi.mocked(prisma.workflow.update).mockResolvedValue(mockWorkflow as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ type: newType }),
            }
          )

          const response = await PUT(request, {
            params: Promise.resolve({ id: workflowId, nodeId }),
          })
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(data.data.node.type).toBe(newType)

          // Verify default config is applied based on new type
          const updatedConfig = data.data.node.config
          switch (newType) {
            case 'PROCESS':
              expect(updatedConfig).toHaveProperty('temperature')
              expect(updatedConfig).toHaveProperty('maxTokens')
              break
            case 'CODE':
              expect(updatedConfig).toHaveProperty('language')
              break
            case 'OUTPUT':
              expect(updatedConfig).toHaveProperty('format')
              break
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1.4: Version increment is consistent
   *
   * Feature: v1-workflow-api-enhancement, Property 1: Node Update Preserves Workflow Integrity
   * Validates: Requirements 1.4
   */
  it('Property 1.4: version should always increment by exactly 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (initialVersion) => {
          const workflowId = 'wf-test-3'
          const nodeId = 'node_test_1'

          const workflowConfig: WorkflowConfig = {
            version: initialVersion,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
              {
                id: nodeId,
                type: 'PROCESS',
                name: 'Process',
                position: { x: 300, y: 100 },
                config: { userPrompt: 'test' },
              } as NodeConfig,
            ],
            edges: [],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            version: initialVersion,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
          vi.mocked(prisma.workflow.update).mockResolvedValue(mockWorkflow as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ name: 'Updated Name' }),
            }
          )

          const response = await PUT(request, {
            params: Promise.resolve({ id: workflowId, nodeId }),
          })
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.data.workflowVersion).toBe(initialVersion + 1)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
