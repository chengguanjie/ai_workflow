/**
 * Property-Based Tests for V1 Node Delete API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 2: Node Deletion Removes Connected Edges
 *
 * Validates: Requirements 2.1, 2.3, 2.4
 *
 * For any workflow with nodes and edges, deleting a node SHALL result in:
 * - The node being removed from the workflow
 * - All edges where the node is source or target being removed
 * - The workflow version being incremented
 * - The response containing the deleted node and all removed edges
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/v1/workflows/[id]/nodes/[nodeId]/route'
import type { WorkflowConfig, NodeConfig, EdgeConfig, NodeType } from '@/types/workflow'

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

const nonInputNodeTypeArb: fc.Arbitrary<NodeType> = fc.constantFrom(
  'PROCESS',
  'CODE',
  'OUTPUT',
  'LOGIC'
)

const positionArb = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
})

const nodeNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

// Generate unique node IDs
const nodeIdArb = (prefix: string): fc.Arbitrary<string> =>
  fc.integer({ min: 1, max: 9999 }).map((n) => `${prefix}_${n}`)

// Generate a node with specific type
const nodeWithTypeArb = (
  id: string,
  type: NodeType
): fc.Arbitrary<NodeConfig> =>
  fc.record({
    id: fc.constant(id),
    type: fc.constant(type),
    name: nodeNameArb,
    position: positionArb,
    config: fc.constant({}),
  }) as fc.Arbitrary<NodeConfig>

// Generate an edge between two nodes
const edgeArb = (
  sourceId: string,
  targetId: string
): fc.Arbitrary<EdgeConfig> =>
  fc.record({
    id: fc.constant(`edge_${sourceId}_${targetId}`),
    source: fc.constant(sourceId),
    target: fc.constant(targetId),
    sourceHandle: fc.constant('output'),
    targetHandle: fc.constant('input'),
  }) as fc.Arbitrary<EdgeConfig>

// Generate a workflow with multiple nodes and edges
// Ensures at least 2 INPUT nodes so we can delete one
const workflowWithEdgesArb: fc.Arbitrary<{
  config: WorkflowConfig
  deletableNodeId: string
  expectedDeletedEdges: string[]
}> = fc
  .integer({ min: 2, max: 5 })
  .chain((nodeCount) => {
    // Generate node IDs
    const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node_${i}`)

    // First two nodes are INPUT (so we can delete one)
    // Rest are random non-INPUT types
    return fc
      .tuple(
        nodeWithTypeArb(nodeIds[0], 'INPUT'),
        nodeWithTypeArb(nodeIds[1], 'INPUT'),
        ...nodeIds.slice(2).map((id) =>
          nonInputNodeTypeArb.chain((type) => nodeWithTypeArb(id, type))
        )
      )
      .chain((nodes) => {
        // Generate edges - create some connections
        const edgeGenerators: fc.Arbitrary<EdgeConfig>[] = []

        // Create edges from first INPUT to other nodes
        for (let i = 2; i < nodes.length; i++) {
          edgeGenerators.push(edgeArb(nodeIds[0], nodeIds[i]))
        }

        // Create edges from second INPUT to other nodes
        for (let i = 2; i < nodes.length; i++) {
          edgeGenerators.push(edgeArb(nodeIds[1], nodeIds[i]))
        }

        // Create edges between non-INPUT nodes
        for (let i = 2; i < nodes.length - 1; i++) {
          edgeGenerators.push(edgeArb(nodeIds[i], nodeIds[i + 1]))
        }

        // Pick a deletable node (not the only INPUT)
        // We can delete the second INPUT or any non-INPUT node
        const deletableNodeIndex =
          nodes.length > 2
            ? fc.integer({ min: 1, max: nodes.length - 1 })
            : fc.constant(1)

        return fc.tuple(
          fc.constant(nodes),
          edgeGenerators.length > 0
            ? fc.tuple(...edgeGenerators)
            : fc.constant([] as EdgeConfig[]),
          deletableNodeIndex,
          fc.integer({ min: 1, max: 100 })
        )
      })
      .map(([nodes, edges, deletableIndex, version]) => {
        const deletableNodeId = nodes[deletableIndex].id

        // Find edges that should be deleted
        const expectedDeletedEdges = edges
          .filter(
            (e) => e.source === deletableNodeId || e.target === deletableNodeId
          )
          .map((e) => e.id)

        return {
          config: {
            version,
            nodes: nodes as NodeConfig[],
            edges: edges as EdgeConfig[],
          },
          deletableNodeId,
          expectedDeletedEdges,
        }
      })
  })

// ============================================
// Test Setup
// ============================================

describe('V1 Node Delete API - Property Tests', () => {
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
   * Property 2: Node Deletion Removes Connected Edges
   *
   * Feature: v1-workflow-api-enhancement, Property 2: Node Deletion Removes Connected Edges
   * Validates: Requirements 2.1, 2.3, 2.4
   */
  it('Property 2: deleting a node should remove it and all connected edges', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowWithEdgesArb,
        fc.constantFrom('DRAFT', 'PUBLISHED', 'DRAFT_MODIFIED'),
        async ({ config, deletableNodeId, expectedDeletedEdges }, publishStatus) => {
          const workflowId = 'wf-test-delete'
          const originalVersion = config.version
          const originalNodeCount = config.nodes.length
          const originalEdgeCount = config.edges.length

          // Setup mock workflow
          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            version: originalVersion,
            config,
            draftConfig: config,
            publishStatus,
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(
            mockWorkflow as never
          )

          let capturedUpdateData: Record<string, unknown> | null = null
          vi.mocked(prisma.workflow.update).mockImplementation(async (args) => {
            capturedUpdateData = args.data as Record<string, unknown>
            return { ...mockWorkflow, ...capturedUpdateData } as never
          })

          // Create DELETE request
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${deletableNodeId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          // Execute
          const response = await DELETE(request, {
            params: Promise.resolve({ id: workflowId, nodeId: deletableNodeId }),
          })
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Property 2.1: The deleted node should be returned
          expect(data.data.deleted.node).toBeDefined()
          expect(data.data.deleted.node.id).toBe(deletableNodeId)

          // Property 2.2: All connected edges should be returned as deleted
          const deletedEdgeIds = data.data.deleted.edges.map(
            (e: EdgeConfig) => e.id
          )
          expect(deletedEdgeIds.sort()).toEqual(expectedDeletedEdges.sort())

          // Property 2.3: Version should be incremented
          expect(data.data.workflowVersion).toBe(originalVersion + 1)

          // Verify the saved config
          expect(capturedUpdateData).not.toBeNull()
          const savedConfig = capturedUpdateData?.config as WorkflowConfig

          // Property 2.4: Node should be removed from saved config
          const savedNodeIds = savedConfig.nodes.map((n) => n.id)
          expect(savedNodeIds).not.toContain(deletableNodeId)
          expect(savedConfig.nodes.length).toBe(originalNodeCount - 1)

          // Property 2.5: Connected edges should be removed from saved config
          const savedEdgeIds = savedConfig.edges.map((e) => e.id)
          for (const deletedEdgeId of expectedDeletedEdges) {
            expect(savedEdgeIds).not.toContain(deletedEdgeId)
          }
          expect(savedConfig.edges.length).toBe(
            originalEdgeCount - expectedDeletedEdges.length
          )

          // Property 2.6: Remaining edges should not reference the deleted node
          for (const edge of savedConfig.edges) {
            expect(edge.source).not.toBe(deletableNodeId)
            expect(edge.target).not.toBe(deletableNodeId)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2.4: Version increment on deletion
   *
   * Feature: v1-workflow-api-enhancement, Property 2: Node Deletion Removes Connected Edges
   * Validates: Requirements 2.4
   */
  it('Property 2.4: version should always increment by exactly 1 on deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (initialVersion) => {
          const workflowId = 'wf-test-version'
          const nodeToDeleteId = 'node_to_delete'

          const workflowConfig: WorkflowConfig = {
            version: initialVersion,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input 1',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
              {
                id: 'input_2',
                type: 'INPUT',
                name: 'Input 2',
                position: { x: 100, y: 200 },
                config: { fields: [] },
              } as NodeConfig,
              {
                id: nodeToDeleteId,
                type: 'PROCESS',
                name: 'Process',
                position: { x: 300, y: 100 },
                config: { userPrompt: 'test' },
              } as NodeConfig,
            ],
            edges: [
              {
                id: 'edge_1',
                source: 'input_1',
                target: nodeToDeleteId,
                sourceHandle: 'output',
                targetHandle: 'input',
              } as EdgeConfig,
            ],
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            version: initialVersion,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(
            mockWorkflow as never
          )
          vi.mocked(prisma.workflow.update).mockResolvedValue(
            mockWorkflow as never
          )

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeToDeleteId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await DELETE(request, {
            params: Promise.resolve({ id: workflowId, nodeId: nodeToDeleteId }),
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

  /**
   * Property 2.1: Deleted node and edges are returned in response
   *
   * Feature: v1-workflow-api-enhancement, Property 2: Node Deletion Removes Connected Edges
   * Validates: Requirements 2.1, 2.3
   */
  it('Property 2.1: response should contain deleted node and all removed edges', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (edgeCount) => {
          const workflowId = 'wf-test-response'
          const nodeToDeleteId = 'node_to_delete'

          // Create edges connected to the node to delete
          const edges: EdgeConfig[] = []
          for (let i = 0; i < edgeCount; i++) {
            if (i % 2 === 0) {
              // Incoming edge
              edges.push({
                id: `edge_in_${i}`,
                source: 'input_1',
                target: nodeToDeleteId,
                sourceHandle: 'output',
                targetHandle: 'input',
              } as EdgeConfig)
            } else {
              // Outgoing edge
              edges.push({
                id: `edge_out_${i}`,
                source: nodeToDeleteId,
                target: 'output_1',
                sourceHandle: 'output',
                targetHandle: 'input',
              } as EdgeConfig)
            }
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
              {
                id: nodeToDeleteId,
                type: 'PROCESS',
                name: 'Process',
                position: { x: 300, y: 100 },
                config: {},
              } as NodeConfig,
              {
                id: 'output_1',
                type: 'OUTPUT',
                name: 'Output',
                position: { x: 500, y: 100 },
                config: {},
              } as NodeConfig,
            ],
            edges,
          }

          const mockWorkflow = {
            id: workflowId,
            organizationId: 'org-1',
            version: 1,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(
            mockWorkflow as never
          )
          vi.mocked(prisma.workflow.update).mockResolvedValue(
            mockWorkflow as never
          )

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeToDeleteId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await DELETE(request, {
            params: Promise.resolve({ id: workflowId, nodeId: nodeToDeleteId }),
          })
          const data = await response.json()

          expect(response.status).toBe(200)

          // Verify deleted node is returned
          expect(data.data.deleted.node.id).toBe(nodeToDeleteId)

          // Verify all connected edges are returned
          expect(data.data.deleted.edges.length).toBe(edgeCount)

          const returnedEdgeIds = data.data.deleted.edges.map(
            (e: EdgeConfig) => e.id
          )
          const expectedEdgeIds = edges.map((e) => e.id)
          expect(returnedEdgeIds.sort()).toEqual(expectedEdgeIds.sort())

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
