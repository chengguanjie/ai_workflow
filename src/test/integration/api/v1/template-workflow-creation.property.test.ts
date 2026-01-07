/**
 * Property-Based Tests for V1 Template-Based Workflow Creation API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 11: Template-Based Workflow Creation
 *
 * Validates: Requirements 10.1
 *
 * For any valid template, creating a workflow with that templateId SHALL result in
 * a workflow whose configuration matches the template's configuration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v1/workflows/route'
import type { WorkflowConfig, NodeConfig, EdgeConfig, NodeType } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflowTemplate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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

// Generate a template visibility
const visibilityArb = fc.constantFrom('PUBLIC', 'PRIVATE', 'ORGANIZATION')

// Generate a complete template
const templateArb = fc.record({
  id: fc.uuid(),
  name: workflowNameArb,
  description: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  category: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  config: workflowConfigArb,
  visibility: visibilityArb,
  isOfficial: fc.boolean(),
  organizationId: fc.option(fc.constant('org-1'), { nil: null }),
  usageCount: fc.integer({ min: 0, max: 1000 }),
})

// ============================================
// Test Setup
// ============================================

describe('V1 Template-Based Workflow Creation API - Property Tests', () => {
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
   * Property 11: Template-Based Workflow Creation
   *
   * Feature: v1-workflow-api-enhancement, Property 11: Template-Based Workflow Creation
   * Validates: Requirements 10.1
   *
   * For any valid template, creating a workflow with that templateId SHALL result in
   * a workflow whose configuration matches the template's configuration.
   */
  it('Property 11: creating a workflow from template copies the template configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateArb,
        workflowNameArb,
        async (template, workflowName) => {
          // Only test accessible templates (PUBLIC, official, or same org)
          const isAccessible =
            template.visibility === 'PUBLIC' ||
            template.isOfficial ||
            template.organizationId === mockToken.organizationId

          if (!isAccessible) {
            // Skip inaccessible templates - they should return 403
            return true
          }

          const newWorkflowId = 'new-workflow-id'

          // Setup mock for finding template
          vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue({
            id: template.id,
            name: template.name,
            config: template.config,
            visibility: template.visibility,
            isOfficial: template.isOfficial,
            organizationId: template.organizationId,
          } as never)

          // Mock template usage count update
          vi.mocked(prisma.workflowTemplate.update).mockResolvedValue({} as never)

          // Capture the create call data
          let capturedCreateData: any
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            capturedCreateData = args?.data
            return Promise.resolve({
              id: newWorkflowId,
              name: capturedCreateData?.name,
              description: capturedCreateData?.description,
              config: capturedCreateData?.config,
              category: capturedCreateData?.category,
              tags: capturedCreateData?.tags,
              isActive: true,
              publishStatus: capturedCreateData?.publishStatus,
              version: capturedCreateData?.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          })

          // Create request with templateId
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
                templateId: template.id,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          // Property 11: Configuration matches template
          if (!capturedCreateData) throw new Error('expected prisma.workflow.create to be called')
          const createdConfig = capturedCreateData.config as WorkflowConfig
          
          // Verify nodes count matches
          expect(createdConfig.nodes.length).toBe(template.config.nodes.length)
          
          // Verify edges count matches
          expect(createdConfig.edges.length).toBe(template.config.edges.length)

          // Verify each node is copied from template
          for (let i = 0; i < template.config.nodes.length; i++) {
            const templateNode = template.config.nodes[i]
            const createdNode = createdConfig.nodes.find((n) => n.id === templateNode.id)
            expect(createdNode).toBeDefined()
            expect(createdNode?.type).toBe(templateNode.type)
            expect(createdNode?.name).toBe(templateNode.name)
            expect(createdNode?.position).toEqual(templateNode.position)
          }

          // Verify each edge is copied from template
          for (let i = 0; i < template.config.edges.length; i++) {
            const templateEdge = template.config.edges[i]
            const createdEdge = createdConfig.edges.find((e) => e.id === templateEdge.id)
            expect(createdEdge).toBeDefined()
            expect(createdEdge?.source).toBe(templateEdge.source)
            expect(createdEdge?.target).toBe(templateEdge.target)
          }

          // Verify template info is included in response
          expect(data.data.templateUsed).toBeDefined()
          expect(data.data.templateUsed.id).toBe(template.id)
          expect(data.data.templateUsed.name).toBe(template.name)

          // Verify template usage count was incremented
          expect(prisma.workflowTemplate.update).toHaveBeenCalledWith({
            where: { id: template.id },
            data: { usageCount: { increment: 1 } },
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 11.1: Inaccessible templates return 403
   *
   * Feature: v1-workflow-api-enhancement, Property 11: Template-Based Workflow Creation
   * Validates: Requirements 10.1 (access control)
   */
  it('Property 11.1: inaccessible templates return 403 error', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        async (workflowName) => {
          const templateId = 'private-template-id'

          // Setup mock for finding a private template from different org
          vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue({
            id: templateId,
            name: 'Private Template',
            config: { version: 1, nodes: [], edges: [] },
            visibility: 'PRIVATE',
            isOfficial: false,
            organizationId: 'other-org', // Different organization
          } as never)

          // Create request with templateId
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
                templateId,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(403)
          expect(data.success).toBe(false)
          expect(data.error).toBeDefined()

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 11.2: Non-existent templates return 404
   *
   * Feature: v1-workflow-api-enhancement, Property 11: Template-Based Workflow Creation
   * Validates: Requirements 10.1 (error handling)
   */
  it('Property 11.2: non-existent templates return 404 error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        workflowNameArb,
        async (templateId, workflowName) => {
          // Setup mock for template not found
          vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue(null)

          // Create request with non-existent templateId
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
                templateId,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions
          expect(response.status).toBe(404)
          expect(data.success).toBe(false)
          expect(data.error).toBeDefined()

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 11.3: Official templates are always accessible
   *
   * Feature: v1-workflow-api-enhancement, Property 11: Template-Based Workflow Creation
   * Validates: Requirements 10.1 (official template access)
   */
  it('Property 11.3: official templates are accessible regardless of visibility', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateArb.map((t) => ({ ...t, isOfficial: true })),
        workflowNameArb,
        async (template, workflowName) => {
          const newWorkflowId = 'new-workflow-id'

          // Setup mock for finding official template
          vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue({
            id: template.id,
            name: template.name,
            config: template.config,
            visibility: template.visibility,
            isOfficial: true,
            organizationId: 'other-org', // Different org but official
          } as never)

          // Mock template usage count update
          vi.mocked(prisma.workflowTemplate.update).mockResolvedValue({} as never)

          // Capture the create call data
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            const data = args?.data as Record<string, unknown>
            return Promise.resolve({
              id: newWorkflowId,
              name: data.name,
              description: data.description,
              config: data.config,
              category: data.category,
              tags: data.tags,
              isActive: true,
              publishStatus: data.publishStatus,
              version: data.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          })

          // Create request with templateId
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
                templateId: template.id,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions - official templates should always be accessible
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 11.4: Public templates are always accessible
   *
   * Feature: v1-workflow-api-enhancement, Property 11: Template-Based Workflow Creation
   * Validates: Requirements 10.1 (public template access)
   */
  it('Property 11.4: public templates are accessible regardless of organization', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateArb.map((t) => ({ ...t, visibility: 'PUBLIC' as const, isOfficial: false })),
        workflowNameArb,
        async (template, workflowName) => {
          const newWorkflowId = 'new-workflow-id'

          // Setup mock for finding public template from different org
          vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue({
            id: template.id,
            name: template.name,
            config: template.config,
            visibility: 'PUBLIC',
            isOfficial: false,
            organizationId: 'other-org', // Different org but public
          } as never)

          // Mock template usage count update
          vi.mocked(prisma.workflowTemplate.update).mockResolvedValue({} as never)

          // Capture the create call data
          ;(prisma.workflow.create as any).mockImplementation((args: any) => {
            const data = args?.data as Record<string, unknown>
            return Promise.resolve({
              id: newWorkflowId,
              name: data.name,
              description: data.description,
              config: data.config,
              category: data.category,
              tags: data.tags,
              isActive: true,
              publishStatus: data.publishStatus,
              version: data.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          })

          // Create request with templateId
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
                templateId: template.id,
              }),
            }
          )

          // Execute
          const response = await POST(request)
          const data = await response.json()

          // Assertions - public templates should always be accessible
          expect(response.status).toBe(201)
          expect(data.success).toBe(true)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
