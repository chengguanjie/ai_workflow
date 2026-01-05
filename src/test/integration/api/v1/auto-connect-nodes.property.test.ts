/**
 * Property-Based Tests for V1 Auto-Connect Node Sequencing API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 12: Auto-Connect Node Sequencing
 *
 * Validates: Requirements 10.3
 *
 * For any array of nodes provided with autoConnect=true, the created workflow
 * SHALL have edges connecting each node to the next in sequence
 * (node[0] → node[1] → node[2] → ...).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v1/workflows/route'
import type { WorkflowConfig, NodeConfig, NodeType } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      create: vi.fn(),
    },
    workflowTrigger: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  validateApiTokenWithScope: vi.fn(),
  updateTokenUsage: vi.fn(),
}))

vi.mock('@/lib/webhook/signature', () => ({
  generateWebhookPath: vi.fn(() => 'webhook-path-123'),
  generateWebhookSecret: vi.fn(() => 'webhook-secret-456'),
}))

vi.mock('@/lib/scheduler', () => ({
  scheduler: {
    scheduleJob: vi.fn(),
  },
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import {
  validateApiTokenWithScope,
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

const positionArb = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
})

const nodeNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

// Generate a node with specific type
const nodeArb = (type?: NodeType): fc.Arbitrary<NodeConfig> =>
  fc.record({
    id: fc.option(fc.uuid(), { nil: undefined }),
    type: type ? fc.constant(type) : nodeTypeArb,
    name: nodeNameArb,
    position: fc.option(positionArb, { nil: undefined }),
    config: fc.constant({}),
  }) as fc.Arbitrary<NodeConfig>

// Generate a workflow name (valid, non-empty)
const workflowNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

// Generate an array of nodes (2-6 nodes for meaningful auto-connect testing)
const nodesArrayArb: fc.Arbitrary<NodeConfig[]> = fc
  .integer({ min: 2, max: 6 })
  .chain((count) => {
    const nodeGenerators: fc.Arbitrary<NodeConfig>[] = []
    for (let i = 0; i < count; i++) {
      nodeGenerators.push(nodeArb())
    }
    return fc.tuple(...nodeGenerators)
  })
  .map((nodes) => nodes as NodeConfig[])

// ============================================
// Test Setup
// ============================================

describe('V1 Auto-Connect Node Sequencing API - Property Tests', () => {
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

    vi.mocked(updateTokenUsage).mockResolvedValue(undefined)
  })

  /**
   * Property 12: Auto-Connect Node Sequencing
   *
   * Feature: v1-workflow-api-enhancement, Property 12: Auto-Connect Node Sequencing
   * Validates: Requirements 10.3
   *
   * For any array of nodes provided with autoConnect=true, the created workflow
   * SHALL have edges connecting each node to the next in sequence.
   */
  it('Property 12: auto-connect creates sequential edges between nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodesArrayArb,
        workflowNameArb,
        async (nodes, workflowName) => {
          const newWorkflowId = 'new-workflow-id'

          // Capture the create call data
          let capturedCreateData: Record<string, unknown> | null = null
          vi.mocked(prisma.workflow.create).mockImplementation(((args: { data: Record<string, unknown> }) => {
            capturedCreateData = args.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData.name,
              description: capturedCreateData.description,
              config: capturedCreateData.config,
              category: capturedCreateData.category,
              tags: capturedCreateData.tags,
              isActive: true,
              publishStatus: capturedCreateData.publishStatus,
              version: capturedCreateData.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }) as never)

          // Create request with nodes array and autoConnect=true
          const request = new NextRequest(
            'http://localhost/api/v1/workflows',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({
                name: workflowName,
                nodes,
                autoConnect: true,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Property 12: Verify sequential edges
          const createdConfig = capturedCreateData?.config as WorkflowConfig
          
          // Verify nodes count matches input
          expect(createdConfig.nodes.length).toBe(nodes.length)

          // Verify edges count is nodes.length - 1 (sequential connections)
          expect(createdConfig.edges.length).toBe(nodes.length - 1)

          // Verify each edge connects consecutive nodes in sequence
          for (let i = 0; i < createdConfig.edges.length; i++) {
            const edge = createdConfig.edges[i]
            const sourceNode = createdConfig.nodes[i]
            const targetNode = createdConfig.nodes[i + 1]

            // Edge source should be the i-th node
            expect(edge.source).toBe(sourceNode.id)
            // Edge target should be the (i+1)-th node
            expect(edge.target).toBe(targetNode.id)
          }

          // Verify all nodes have IDs assigned
          for (const node of createdConfig.nodes) {
            expect(node.id).toBeDefined()
            expect(typeof node.id).toBe('string')
            expect(node.id.length).toBeGreaterThan(0)
          }

          // Verify all nodes have positions assigned
          for (const node of createdConfig.nodes) {
            expect(node.position).toBeDefined()
            expect(typeof node.position.x).toBe('number')
            expect(typeof node.position.y).toBe('number')
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 12.1: Without autoConnect, no edges are created
   *
   * Feature: v1-workflow-api-enhancement, Property 12: Auto-Connect Node Sequencing
   * Validates: Requirements 10.3 (negative case)
   */
  it('Property 12.1: without autoConnect, no edges are created from nodes array', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodesArrayArb,
        workflowNameArb,
        async (nodes, workflowName) => {
          const newWorkflowId = 'new-workflow-id'

          // Capture the create call data
          let capturedCreateData: Record<string, unknown> | null = null
          vi.mocked(prisma.workflow.create).mockImplementation(((args: { data: Record<string, unknown> }) => {
            capturedCreateData = args.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData.name,
              description: capturedCreateData.description,
              config: capturedCreateData.config,
              category: capturedCreateData.category,
              tags: capturedCreateData.tags,
              isActive: true,
              publishStatus: capturedCreateData.publishStatus,
              version: capturedCreateData.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }) as never)

          // Create request with nodes array but autoConnect=false (default)
          const request = new NextRequest(
            'http://localhost/api/v1/workflows',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({
                name: workflowName,
                nodes,
                autoConnect: false,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Property 12.1: No edges when autoConnect is false
          const createdConfig = capturedCreateData?.config as WorkflowConfig
          
          // Verify nodes count matches input
          expect(createdConfig.nodes.length).toBe(nodes.length)

          // Verify no edges are created
          expect(createdConfig.edges.length).toBe(0)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 12.2: Single node with autoConnect creates no edges
   *
   * Feature: v1-workflow-api-enhancement, Property 12: Auto-Connect Node Sequencing
   * Validates: Requirements 10.3 (edge case)
   */
  it('Property 12.2: single node with autoConnect creates no edges', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeArb(),
        workflowNameArb,
        async (node, workflowName) => {
          const newWorkflowId = 'new-workflow-id'

          // Capture the create call data
          let capturedCreateData: Record<string, unknown> | null = null
          vi.mocked(prisma.workflow.create).mockImplementation(((args: { data: Record<string, unknown> }) => {
            capturedCreateData = args.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData.name,
              description: capturedCreateData.description,
              config: capturedCreateData.config,
              category: capturedCreateData.category,
              tags: capturedCreateData.tags,
              isActive: true,
              publishStatus: capturedCreateData.publishStatus,
              version: capturedCreateData.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }) as never)

          // Create request with single node and autoConnect=true
          const request = new NextRequest(
            'http://localhost/api/v1/workflows',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({
                name: workflowName,
                nodes: [node],
                autoConnect: true,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Property 12.2: Single node means no edges
          const createdConfig = capturedCreateData?.config as WorkflowConfig
          
          // Verify single node
          expect(createdConfig.nodes.length).toBe(1)

          // Verify no edges (can't connect a single node to itself)
          expect(createdConfig.edges.length).toBe(0)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 12.3: Node order is preserved in auto-connect
   *
   * Feature: v1-workflow-api-enhancement, Property 12: Auto-Connect Node Sequencing
   * Validates: Requirements 10.3 (order preservation)
   */
  it('Property 12.3: node order is preserved when auto-connecting', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodesArrayArb,
        workflowNameArb,
        async (nodes, workflowName) => {
          const newWorkflowId = 'new-workflow-id'

          // Capture the create call data
          let capturedCreateData: Record<string, unknown> | null = null
          vi.mocked(prisma.workflow.create).mockImplementation(((args: { data: Record<string, unknown> }) => {
            capturedCreateData = args.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData.name,
              description: capturedCreateData.description,
              config: capturedCreateData.config,
              category: capturedCreateData.category,
              tags: capturedCreateData.tags,
              isActive: true,
              publishStatus: capturedCreateData.publishStatus,
              version: capturedCreateData.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }) as never)

          // Create request with nodes array and autoConnect=true
          const request = new NextRequest(
            'http://localhost/api/v1/workflows',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({
                name: workflowName,
                nodes,
                autoConnect: true,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Property 12.3: Node order is preserved
          const createdConfig = capturedCreateData?.config as WorkflowConfig
          
          // Verify node types are in the same order as input
          for (let i = 0; i < nodes.length; i++) {
            expect(createdConfig.nodes[i].type).toBe(nodes[i].type)
            expect(createdConfig.nodes[i].name).toBe(nodes[i].name)
          }

          // Verify edges follow the node order
          for (let i = 0; i < createdConfig.edges.length; i++) {
            const edge = createdConfig.edges[i]
            // Source should be node at index i
            expect(edge.source).toBe(createdConfig.nodes[i].id)
            // Target should be node at index i+1
            expect(edge.target).toBe(createdConfig.nodes[i + 1].id)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
