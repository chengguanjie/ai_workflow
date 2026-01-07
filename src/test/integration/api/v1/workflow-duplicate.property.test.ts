/**
 * Property-Based Tests for V1 Workflow Duplicate API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 6: Workflow Duplicate Creates Independent Copy
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 *
 * For any workflow, duplicating it SHALL result in:
 * - A new workflow with a different ID
 * - The name being the original name + "(副本)" (unless custom name provided)
 * - The config (nodes, edges) being identical to the source
 * - publishStatus being DRAFT and version being 1
 * - Changes to the copy not affecting the original
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v1/workflows/[id]/duplicate/route'
import type { WorkflowConfig, NodeConfig, EdgeConfig, NodeType } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
      create: vi.fn(),
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

// Generate a workflow name (valid, non-empty)
const workflowNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

// Generate a workflow config with nodes and edges
const workflowConfigArb: fc.Arbitrary<WorkflowConfig> = fc
  .integer({ min: 1, max: 5 })
  .chain((nodeCount) => {
    const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node_${i}`)

    // First node is always INPUT
    const nodeGenerators = [
      nodeWithTypeArb(nodeIds[0], 'INPUT'),
      ...nodeIds.slice(1).map((id) =>
        nodeTypeArb
          .filter((t) => t !== 'INPUT')
          .chain((type) => nodeWithTypeArb(id, type))
      ),
    ]

    return fc.tuple(...nodeGenerators).chain((nodes) => {
      // Generate edges connecting nodes sequentially
      const edgeGenerators: fc.Arbitrary<EdgeConfig>[] = []
      for (let i = 0; i < nodes.length - 1; i++) {
        edgeGenerators.push(edgeArb(nodeIds[i], nodeIds[i + 1]))
      }

      return fc.tuple(
        fc.constant(nodes),
        edgeGenerators.length > 0
          ? fc.tuple(...edgeGenerators)
          : fc.constant([] as EdgeConfig[]),
        fc.integer({ min: 1, max: 100 })
      )
    })
  })
  .map(([nodes, edges, version]) => ({
    version,
    nodes: nodes as NodeConfig[],
    edges: edges as EdgeConfig[],
  }))

// Generate a complete source workflow
const sourceWorkflowArb = fc.record({
  id: fc.uuid(),
  name: workflowNameArb,
  description: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  category: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  config: workflowConfigArb,
  organizationId: fc.constant('org-1'),
  publishStatus: fc.constantFrom('DRAFT', 'PUBLISHED', 'DRAFT_MODIFIED'),
  version: fc.integer({ min: 1, max: 100 }),
})

// ============================================
// Test Setup
// ============================================

describe('V1 Workflow Duplicate API - Property Tests', () => {
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
   * Property 6: Workflow Duplicate Creates Independent Copy
   *
   * Feature: v1-workflow-api-enhancement, Property 6: Workflow Duplicate Creates Independent Copy
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
   */
  it('Property 6: duplicating a workflow creates an independent copy with correct properties', async () => {
    await fc.assert(
      fc.asyncProperty(
        sourceWorkflowArb,
        async (sourceWorkflow) => {
          const newWorkflowId = 'new-workflow-id'

          // Setup mock for finding source workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: sourceWorkflow.id,
            name: sourceWorkflow.name,
            description: sourceWorkflow.description,
            category: sourceWorkflow.category,
            tags: sourceWorkflow.tags,
            config: sourceWorkflow.config,
            organizationId: sourceWorkflow.organizationId,
          } as never)

          // Capture the create call data
          let capturedCreateData: any
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            capturedCreateData = args?.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData?.name,
              description: capturedCreateData?.description,
              config: capturedCreateData?.config,
              draftConfig: capturedCreateData?.draftConfig,
              publishedConfig: null,
              publishStatus: capturedCreateData?.publishStatus,
              version: capturedCreateData?.version,
              category: capturedCreateData?.category,
              tags: capturedCreateData?.tags,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              creator: {
                id: 'user-1',
                name: 'Test User',
                email: 'test@example.com',
              },
            })
          })

          // Create request without custom name
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${sourceWorkflow.id}/duplicate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
            }
          )

          // Execute
          const response = await POST(request, {
            params: Promise.resolve({ id: sourceWorkflow.id }),
          })
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Property 6.1: New workflow has different ID
          expect(data.data.id).toBe(newWorkflowId)
          expect(data.data.id).not.toBe(sourceWorkflow.id)

          // Property 6.2: Name has "(副本)" appended
          if (!capturedCreateData) throw new Error('expected prisma.workflow.create to be called')
          expect(capturedCreateData.name).toBe(`${sourceWorkflow.name} (副本)`)

          // Property 6.3: Config (nodes, edges) is identical to source
          const createdConfig = capturedCreateData.config as WorkflowConfig
          expect(createdConfig.nodes.length).toBe(sourceWorkflow.config.nodes.length)
          expect(createdConfig.edges.length).toBe(sourceWorkflow.config.edges.length)

          // Verify each node is copied
          for (let i = 0; i < sourceWorkflow.config.nodes.length; i++) {
            const sourceNode = sourceWorkflow.config.nodes[i]
            const copiedNode = createdConfig.nodes.find((n) => n.id === sourceNode.id)
            expect(copiedNode).toBeDefined()
            expect(copiedNode?.type).toBe(sourceNode.type)
            expect(copiedNode?.name).toBe(sourceNode.name)
          }

          // Verify each edge is copied
          for (let i = 0; i < sourceWorkflow.config.edges.length; i++) {
            const sourceEdge = sourceWorkflow.config.edges[i]
            const copiedEdge = createdConfig.edges.find((e) => e.id === sourceEdge.id)
            expect(copiedEdge).toBeDefined()
            expect(copiedEdge?.source).toBe(sourceEdge.source)
            expect(copiedEdge?.target).toBe(sourceEdge.target)
          }

          // Property 6.4: publishStatus is DRAFT and version is 1
          expect(capturedCreateData.publishStatus).toBe('DRAFT')
          expect(capturedCreateData.version).toBe(1)
          expect(createdConfig.version).toBe(1)

          // Property 6.5: Description, category, tags are copied
          expect(capturedCreateData.description).toBe(sourceWorkflow.description)
          expect(capturedCreateData.category).toBe(sourceWorkflow.category)
          expect(capturedCreateData.tags).toEqual(sourceWorkflow.tags)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6.6: Custom name is used when provided
   *
   * Feature: v1-workflow-api-enhancement, Property 6: Workflow Duplicate Creates Independent Copy
   * Validates: Requirements 6.6
   */
  it('Property 6.6: custom name is used when provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        sourceWorkflowArb,
        workflowNameArb,
        async (sourceWorkflow, customName) => {
          const newWorkflowId = 'new-workflow-id'

          // Setup mock for finding source workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: sourceWorkflow.id,
            name: sourceWorkflow.name,
            description: sourceWorkflow.description,
            category: sourceWorkflow.category,
            tags: sourceWorkflow.tags,
            config: sourceWorkflow.config,
            organizationId: sourceWorkflow.organizationId,
          } as never)

          // Capture the create call data
          let capturedCreateData: any
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            capturedCreateData = args?.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData?.name,
              description: capturedCreateData?.description,
              config: capturedCreateData?.config,
              draftConfig: capturedCreateData?.draftConfig,
              publishedConfig: null,
              publishStatus: capturedCreateData?.publishStatus,
              version: capturedCreateData?.version,
              category: capturedCreateData?.category,
              tags: capturedCreateData?.tags,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              creator: {
                id: 'user-1',
                name: 'Test User',
                email: 'test@example.com',
              },
            })
          })

          // Create request with custom name
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${sourceWorkflow.id}/duplicate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ name: customName }),
            }
          )

          // Execute
          const response = await POST(request, {
            params: Promise.resolve({ id: sourceWorkflow.id }),
          })
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Custom name should be used instead of "(副本)" suffix
          if (!capturedCreateData) throw new Error('expected prisma.workflow.create to be called')
          expect(capturedCreateData.name).toBe(customName)
          expect(capturedCreateData.name).not.toContain('(副本)')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6.4: Version is always reset to 1
   *
   * Feature: v1-workflow-api-enhancement, Property 6: Workflow Duplicate Creates Independent Copy
   * Validates: Requirements 6.4
   */
  it('Property 6.4: duplicated workflow version is always 1 regardless of source version', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (sourceVersion) => {
          const sourceWorkflowId = 'source-workflow-id'
          const newWorkflowId = 'new-workflow-id'

          const sourceConfig: WorkflowConfig = {
            version: sourceVersion,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
            ],
            edges: [],
          }

          // Setup mock for finding source workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: sourceWorkflowId,
            name: 'Source Workflow',
            description: null,
            category: null,
            tags: [],
            config: sourceConfig,
            organizationId: 'org-1',
          } as never)

          // Capture the create call data
          let capturedCreateData: any
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            capturedCreateData = args?.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData?.name,
              description: capturedCreateData?.description,
              config: capturedCreateData?.config,
              draftConfig: capturedCreateData?.draftConfig,
              publishedConfig: null,
              publishStatus: capturedCreateData?.publishStatus,
              version: capturedCreateData?.version,
              category: capturedCreateData?.category,
              tags: capturedCreateData?.tags,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              creator: {
                id: 'user-1',
                name: 'Test User',
                email: 'test@example.com',
              },
            })
          })

          // Create request
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${sourceWorkflowId}/duplicate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
            }
          )

          // Execute
          const response = await POST(request, {
            params: Promise.resolve({ id: sourceWorkflowId }),
          })
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Version should always be 1
          if (!capturedCreateData) throw new Error('expected prisma.workflow.create to be called')
          expect(capturedCreateData.version).toBe(1)

          // Config version should also be 1
          const createdConfig = capturedCreateData.config as WorkflowConfig
          expect(createdConfig.version).toBe(1)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 6.4: PublishStatus is always DRAFT
   *
   * Feature: v1-workflow-api-enhancement, Property 6: Workflow Duplicate Creates Independent Copy
   * Validates: Requirements 6.4
   */
  it('Property 6.4: duplicated workflow publishStatus is always DRAFT regardless of source status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('DRAFT', 'PUBLISHED', 'DRAFT_MODIFIED'),
        async (sourcePublishStatus) => {
          const sourceWorkflowId = 'source-workflow-id'
          const newWorkflowId = 'new-workflow-id'

          const sourceConfig: WorkflowConfig = {
            version: 5,
            nodes: [
              {
                id: 'input_1',
                type: 'INPUT',
                name: 'Input',
                position: { x: 100, y: 100 },
                config: { fields: [] },
              } as NodeConfig,
            ],
            edges: [],
          }

          // Setup mock for finding source workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: sourceWorkflowId,
            name: 'Source Workflow',
            description: null,
            category: null,
            tags: [],
            config: sourceConfig,
            organizationId: 'org-1',
            publishStatus: sourcePublishStatus,
          } as never)

          // Capture the create call data
          let capturedCreateData: any
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            capturedCreateData = args?.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData?.name,
              description: capturedCreateData?.description,
              config: capturedCreateData?.config,
              draftConfig: capturedCreateData?.draftConfig,
              publishedConfig: null,
              publishStatus: capturedCreateData?.publishStatus,
              version: capturedCreateData?.version,
              category: capturedCreateData?.category,
              tags: capturedCreateData?.tags,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              creator: {
                id: 'user-1',
                name: 'Test User',
                email: 'test@example.com',
              },
            })
          })

          // Create request
          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${sourceWorkflowId}/duplicate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
            }
          )

          // Execute
          const response = await POST(request, {
            params: Promise.resolve({ id: sourceWorkflowId }),
          })
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // PublishStatus should always be DRAFT
          expect(capturedCreateData?.publishStatus).toBe('DRAFT')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
