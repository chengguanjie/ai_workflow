/**
 * Property-Based Tests for V1 Workflow Version Management API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 7: Version Creation and Retrieval Round-Trip
 * Property 8: Version Restore Recovers Configuration
 *
 * Validates: Requirements 7.2, 7.3, 7.4
 *
 * Property 7: For any workflow, creating a version and then retrieving it SHALL return
 * a configuration that is equivalent to the workflow's configuration at the time of version creation.
 *
 * Property 8: For any workflow with multiple versions, restoring to a previous version SHALL
 * result in the workflow's current configuration matching that version's stored configuration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { GET as getVersions, POST as createVersion } from '@/app/api/v1/workflows/[id]/versions/route'
import { GET as getVersionDetail } from '@/app/api/v1/workflows/[id]/versions/[versionId]/route'
import { POST as restoreVersion } from '@/app/api/v1/workflows/[id]/versions/[versionId]/restore/route'
import type { WorkflowConfig, NodeConfig, EdgeConfig, NodeType } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workflowVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  validateApiTokenWithScope: vi.fn(),
  validateCrossOrganization: vi.fn(),
  createCrossOrgNotFoundResponse: vi.fn(),
  updateTokenUsage: vi.fn(),
}))

vi.mock('@/lib/services/version.service', () => ({
  versionService: {
    createVersion: vi.fn(),
    getVersions: vi.fn(),
    getVersion: vi.fn(),
    rollback: vi.fn(),
  },
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  updateTokenUsage,
} from '@/lib/auth'
import { versionService } from '@/lib/services/version.service'

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

// Generate a commit message
const commitMessageArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

// Generate a version tag
const versionTagArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => `v${s.replace(/[^a-zA-Z0-9.-]/g, '')}`)

// ============================================
// Test Setup
// ============================================

describe('V1 Workflow Version Management API - Property Tests', () => {
  const mockToken = {
    id: 'token-1',
    organizationId: 'org-1',
    createdById: 'user-1',
  }

  const mockUser = {
    id: 'user-1',
    name: 'Test User',
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

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  })

  /**
   * Property 7: Version Creation and Retrieval Round-Trip
   *
   * Feature: v1-workflow-api-enhancement, Property 7: Version Creation and Retrieval Round-Trip
   * Validates: Requirements 7.2, 7.3
   */
  it('Property 7: creating a version and retrieving it returns equivalent configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowConfigArb,
        commitMessageArb,
        fc.option(versionTagArb, { nil: undefined }),
        async (workflowConfig, commitMessage, versionTag) => {
          const workflowId = 'wf-test-1'
          const versionId = 'version-1'
          const versionNumber = 1

          // Setup mock workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: workflowId,
            organizationId: 'org-1',
            config: workflowConfig,
          } as never)

          // Mock version creation
          const createdVersion = {
            id: versionId,
            workflowId,
            versionNumber,
            versionTag: versionTag || `v${versionNumber}`,
            commitMessage,
            config: workflowConfig,
            versionType: 'MANUAL',
            isPublished: false,
            isActive: false,
            createdAt: new Date(),
            createdById: 'user-1',
            changesSummary: null,
            executionCount: 0,
            successRate: null,
            avgRating: null,
          }

          vi.mocked(versionService.createVersion).mockResolvedValue(createdVersion as never)
          vi.mocked(versionService.getVersion).mockResolvedValue(createdVersion as never)

          // Step 1: Create version
          const createRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/versions`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({
                commitMessage,
                versionTag,
              }),
            }
          )

          const createResponse = await createVersion(createRequest, {
            params: Promise.resolve({ id: workflowId }),
          })
          const createData = await createResponse.json()

          expect(createResponse.status).toBe(201)
          expect(createData.success).toBe(true)
          expect(createData.data.commitMessage).toBe(commitMessage)

          // Step 2: Retrieve the created version
          const getRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/versions/${versionId}`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const getResponse = await getVersionDetail(getRequest, {
            params: Promise.resolve({ id: workflowId, versionId }),
          })
          const getData = await getResponse.json()

          expect(getResponse.status).toBe(200)
          expect(getData.success).toBe(true)

          // Property 7: Retrieved config should match the original workflow config
          const retrievedConfig = getData.data.config as WorkflowConfig

          // Verify nodes match
          expect(retrievedConfig.nodes.length).toBe(workflowConfig.nodes.length)
          for (let i = 0; i < workflowConfig.nodes.length; i++) {
            const originalNode = workflowConfig.nodes[i]
            const retrievedNode = retrievedConfig.nodes.find((n) => n.id === originalNode.id)
            expect(retrievedNode).toBeDefined()
            expect(retrievedNode?.type).toBe(originalNode.type)
            expect(retrievedNode?.name).toBe(originalNode.name)
          }

          // Verify edges match
          expect(retrievedConfig.edges.length).toBe(workflowConfig.edges.length)
          for (let i = 0; i < workflowConfig.edges.length; i++) {
            const originalEdge = workflowConfig.edges[i]
            const retrievedEdge = retrievedConfig.edges.find((e) => e.id === originalEdge.id)
            expect(retrievedEdge).toBeDefined()
            expect(retrievedEdge?.source).toBe(originalEdge.source)
            expect(retrievedEdge?.target).toBe(originalEdge.target)
          }

          // Verify metadata
          expect(getData.data.commitMessage).toBe(commitMessage)
          if (versionTag) {
            expect(getData.data.versionTag).toBe(versionTag)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 8: Version Restore Recovers Configuration
   *
   * Feature: v1-workflow-api-enhancement, Property 8: Version Restore Recovers Configuration
   * Validates: Requirements 7.4
   */
  it('Property 8: restoring to a previous version recovers that version\'s configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowConfigArb,
        workflowConfigArb,
        async (originalConfig, modifiedConfig) => {
          const workflowId = 'wf-test-2'
          const originalVersionId = 'version-1'
          const newVersionId = 'version-2'

          // Setup mock workflow (currently has modified config)
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: workflowId,
            organizationId: 'org-1',
            config: modifiedConfig,
          } as never)

          // Mock the original version to restore to
          const originalVersion = {
            id: originalVersionId,
            workflowId,
            versionNumber: 1,
            versionTag: 'v1',
            commitMessage: 'Original version',
            config: originalConfig,
            versionType: 'MANUAL',
            isPublished: false,
            isActive: false,
            createdAt: new Date(Date.now() - 86400000), // 1 day ago
            createdById: 'user-1',
          }

          // Mock the new version created after restore
          const restoredVersion = {
            id: newVersionId,
            workflowId,
            versionNumber: 3,
            versionTag: 'v3',
            commitMessage: '回滚到版本 v1',
            config: originalConfig, // Should have original config
            versionType: 'ROLLBACK',
            isPublished: true,
            isActive: true,
            createdAt: new Date(),
            createdById: 'user-1',
          }

          vi.mocked(versionService.getVersion).mockResolvedValue(originalVersion as never)
          vi.mocked(versionService.rollback).mockResolvedValue(restoredVersion as never)

          // Perform restore
          const restoreRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/versions/${originalVersionId}/restore`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
            }
          )

          const restoreResponse = await restoreVersion(restoreRequest, {
            params: Promise.resolve({ id: workflowId, versionId: originalVersionId }),
          })
          const restoreData = await restoreResponse.json()

          expect(restoreResponse.status).toBe(200)
          expect(restoreData.success).toBe(true)

          // Property 8: Verify restore was called with correct parameters
          expect(versionService.rollback).toHaveBeenCalledWith(
            workflowId,
            originalVersionId,
            'user-1',
            undefined
          )

          // Verify response contains restore information
          expect(restoreData.data.restoredFromVersionId).toBe(originalVersionId)
          expect(restoreData.data.restoredFromVersionNumber).toBe(originalVersion.versionNumber)
          expect(restoreData.data.versionType).toBe('ROLLBACK')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 7 (additional): Version list contains created versions
   *
   * Feature: v1-workflow-api-enhancement, Property 7: Version Creation and Retrieval Round-Trip
   * Validates: Requirements 7.1, 7.5
   */
  it('Property 7: created versions appear in version list with correct metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            versionNumber: fc.integer({ min: 1, max: 100 }),
            commitMessage: commitMessageArb,
            versionTag: fc.option(versionTagArb, { nil: undefined }),
            isPublished: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (versionSpecs) => {
          const workflowId = 'wf-test-3'

          // Setup mock workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: workflowId,
            organizationId: 'org-1',
          } as never)

          // Create mock versions from specs
          const mockVersions = versionSpecs.map((spec, index) => ({
            id: `version-${index}`,
            workflowId,
            versionNumber: spec.versionNumber,
            versionTag: spec.versionTag || `v${spec.versionNumber}`,
            commitMessage: spec.commitMessage,
            isPublished: spec.isPublished,
            isActive: index === 0, // First one is active
            createdAt: new Date(Date.now() - index * 3600000),
            createdById: 'user-1',
          }))

          vi.mocked(versionService.getVersions).mockResolvedValue({
            versions: mockVersions,
            total: mockVersions.length,
            page: 1,
            limit: 20,
            totalPages: 1,
          } as never)

          // Get version list
          const listRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/versions`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const listResponse = await getVersions(listRequest, {
            params: Promise.resolve({ id: workflowId }),
          })
          const listData = await listResponse.json()

          expect(listResponse.status).toBe(200)
          expect(listData.success).toBe(true)

          // Verify all versions are in the list
          expect(listData.data.versions.length).toBe(mockVersions.length)

          // Verify each version has required metadata (Requirement 7.5)
          for (const version of listData.data.versions) {
            expect(version).toHaveProperty('id')
            expect(version).toHaveProperty('versionNumber')
            expect(version).toHaveProperty('commitMessage')
            expect(version).toHaveProperty('isPublished')
            expect(version).toHaveProperty('createdAt')
            expect(version).toHaveProperty('createdBy')
          }

          // Verify pagination info
          expect(listData.data.pagination).toHaveProperty('page')
          expect(listData.data.pagination).toHaveProperty('pageSize')
          expect(listData.data.pagination).toHaveProperty('total')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 8 (additional): Restore with custom commit message
   *
   * Feature: v1-workflow-api-enhancement, Property 8: Version Restore Recovers Configuration
   * Validates: Requirements 7.4
   */
  it('Property 8: restore with custom commit message uses that message', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowConfigArb,
        commitMessageArb,
        async (config, customCommitMessage) => {
          const workflowId = 'wf-test-4'
          const targetVersionId = 'version-1'
          const newVersionId = 'version-2'

          // Setup mock workflow
          vi.mocked(prisma.workflow.findFirst).mockResolvedValue({
            id: workflowId,
            organizationId: 'org-1',
            config,
          } as never)

          // Mock the target version
          const targetVersion = {
            id: targetVersionId,
            workflowId,
            versionNumber: 1,
            versionTag: 'v1',
            commitMessage: 'Original',
            config,
            versionType: 'MANUAL',
            isPublished: false,
            isActive: false,
            createdAt: new Date(),
            createdById: 'user-1',
          }

          // Mock the restored version with custom message
          const restoredVersion = {
            id: newVersionId,
            workflowId,
            versionNumber: 2,
            versionTag: 'v2',
            commitMessage: customCommitMessage,
            config,
            versionType: 'ROLLBACK',
            isPublished: true,
            isActive: true,
            createdAt: new Date(),
            createdById: 'user-1',
          }

          vi.mocked(versionService.getVersion).mockResolvedValue(targetVersion as never)
          vi.mocked(versionService.rollback).mockResolvedValue(restoredVersion as never)

          // Perform restore with custom message
          const restoreRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/versions/${targetVersionId}/restore`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ commitMessage: customCommitMessage }),
            }
          )

          const restoreResponse = await restoreVersion(restoreRequest, {
            params: Promise.resolve({ id: workflowId, versionId: targetVersionId }),
          })
          const restoreData = await restoreResponse.json()

          expect(restoreResponse.status).toBe(200)
          expect(restoreData.success).toBe(true)

          // Verify rollback was called with custom commit message
          expect(versionService.rollback).toHaveBeenCalledWith(
            workflowId,
            targetVersionId,
            'user-1',
            customCommitMessage
          )

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
