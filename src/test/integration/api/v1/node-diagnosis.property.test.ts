/**
 * Property-Based Tests for V1 Node Diagnosis API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 4: Node Diagnosis Detects Invalid References
 *
 * Validates: Requirements 4.2, 4.3, 4.5
 *
 * For any node configuration containing variable references, the diagnosis SHALL:
 * - Identify all references to non-existent nodes
 * - Identify all references to non-existent fields
 * - Return each as an issue with severity 'error' or 'warning'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v1/workflows/[id]/nodes/[nodeId]/diagnose/route'
import type { WorkflowConfig, NodeConfig, NodeType, NodePosition } from '@/types/workflow'
import { DIAGNOSIS_CODES } from '@/lib/services/node-diagnosis.service'

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

const positionArb: fc.Arbitrary<NodePosition> = fc.record({
  x: fc.integer({ min: 0, max: 2000 }),
  y: fc.integer({ min: 0, max: 2000 }),
})

const nodeIdArb: fc.Arbitrary<string> = fc
  .string({ minLength: 5, maxLength: 20 })
  .map((s) => `node_${s.replace(/[^a-zA-Z0-9]/g, '')}`)
  .filter((s) => s.length > 5)

const nodeNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(s))

// Generate a non-existent node reference (guaranteed not to match any real node)
const invalidNodeRefArb: fc.Arbitrary<string> = fc
  .string({ minLength: 3, maxLength: 15 })
  .map((s) => `nonexistent_${s.replace(/[^a-zA-Z0-9]/g, '')}`)
  .filter((s) => s.length > 10)

// Generate a valid variable reference pattern
const variableRefArb = (nodeRef: string, fieldRef?: string): string => {
  return fieldRef ? `{{${nodeRef}.${fieldRef}}}` : `{{${nodeRef}}}`
}

// Generate PROCESS node with invalid references
const processNodeWithInvalidRefsArb = (
  invalidRefs: string[]
): fc.Arbitrary<NodeConfig> => {
  return fc.record({
    id: nodeIdArb,
    type: fc.constant('PROCESS' as NodeType),
    name: nodeNameArb,
    position: positionArb,
    config: fc.record({
      systemPrompt: fc.constant('System prompt'),
      userPrompt: fc.constant(
        `Process this: ${invalidRefs.map((ref) => variableRefArb(ref, 'output')).join(' ')}`
      ),
      temperature: fc.constant(0.7),
      maxTokens: fc.constant(1000),
    }),
  }) as fc.Arbitrary<NodeConfig>
}

// Generate CODE node with invalid references
const codeNodeWithInvalidRefsArb = (
  invalidRefs: string[]
): fc.Arbitrary<NodeConfig> => {
  return fc.record({
    id: nodeIdArb,
    type: fc.constant('CODE' as NodeType),
    name: nodeNameArb,
    position: positionArb,
    config: fc.record({
      language: fc.constant('javascript'),
      code: fc.constant(
        `const data = ${invalidRefs.map((ref) => variableRefArb(ref)).join(' + ')}; return data;`
      ),
      timeout: fc.constant(30000),
    }),
  }) as fc.Arbitrary<NodeConfig>
}

// Generate OUTPUT node with invalid references
const outputNodeWithInvalidRefsArb = (
  invalidRefs: string[]
): fc.Arbitrary<NodeConfig> => {
  return fc.record({
    id: nodeIdArb,
    type: fc.constant('OUTPUT' as NodeType),
    name: nodeNameArb,
    position: positionArb,
    config: fc.record({
      prompt: fc.constant(
        `Output: ${invalidRefs.map((ref) => variableRefArb(ref, 'result')).join(', ')}`
      ),
      format: fc.constant('text'),
    }),
  }) as fc.Arbitrary<NodeConfig>
}

// Generate LOGIC node with invalid references in conditions
const logicNodeWithInvalidRefsArb = (
  invalidRefs: string[]
): fc.Arbitrary<NodeConfig> => {
  return fc.record({
    id: nodeIdArb,
    type: fc.constant('LOGIC' as NodeType),
    name: nodeNameArb,
    position: positionArb,
    config: fc.record({
      mode: fc.constant('condition'),
      conditions: fc.constant(
        invalidRefs.map((ref, idx) => ({
          id: `cond_${idx}`,
          expression: `${variableRefArb(ref, 'value')} > 0`,
          targetNodeId: null,
        }))
      ),
    }),
  }) as fc.Arbitrary<NodeConfig>
}

// Generate a healthy PROCESS node (no invalid references)
const healthyProcessNodeArb: fc.Arbitrary<NodeConfig> = fc.record({
  id: nodeIdArb,
  type: fc.constant('PROCESS' as NodeType),
  name: nodeNameArb,
  position: positionArb,
  config: fc.record({
    systemPrompt: fc.string({ minLength: 1, maxLength: 100 }),
    userPrompt: fc.string({ minLength: 1, maxLength: 100 }).map((s) => `Process: ${s}`),
    temperature: fc.double({ min: 0, max: 0.8, noNaN: true }),
    maxTokens: fc.integer({ min: 100, max: 2000 }),
    aiConfigId: fc.constant('ai-config-1'),
  }),
}) as fc.Arbitrary<NodeConfig>

// ============================================
// Test Setup
// ============================================

describe('V1 Node Diagnosis API - Property Tests', () => {
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
   * Property 4: Node Diagnosis Detects Invalid References
   *
   * Feature: v1-workflow-api-enhancement, Property 4: Node Diagnosis Detects Invalid References
   * Validates: Requirements 4.2, 4.3, 4.5
   */
  it('Property 4: diagnosis should detect invalid node references in PROCESS nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(invalidNodeRefArb, { minLength: 1, maxLength: 3 }),
        async (invalidRefs) => {
          const workflowId = 'wf-diagnosis-1'

          // Generate a PROCESS node with invalid references
          const nodeWithInvalidRefs = await fc.sample(
            processNodeWithInvalidRefsArb(invalidRefs),
            1
          )[0]

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
              nodeWithInvalidRefs,
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

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeWithInvalidRefs.id}/diagnose`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: workflowId, nodeId: nodeWithInvalidRefs.id }),
          })
          const data = await response.json()

          // Property 4.1: Response should be successful
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Property 4.2: Should detect invalid references
          const invalidRefIssues = data.data.issues.filter(
            (issue: { code: string }) => issue.code === DIAGNOSIS_CODES.INVALID_VARIABLE_REF
          )

          // Should have at least one invalid reference issue for each invalid ref
          expect(invalidRefIssues.length).toBeGreaterThanOrEqual(1)

          // Property 4.3: Each invalid reference issue should have proper severity
          invalidRefIssues.forEach((issue: { severity: string; code: string; message: string }) => {
            expect(['error', 'warning']).toContain(issue.severity)
            expect(issue.code).toBe(DIAGNOSIS_CODES.INVALID_VARIABLE_REF)
            expect(issue.message).toBeDefined()
            expect(typeof issue.message).toBe('string')
          })

          // Property 4.5: Status should reflect the issues
          expect(['warning', 'error']).toContain(data.data.status)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4.2: Diagnosis should detect invalid references in CODE nodes
   *
   * Feature: v1-workflow-api-enhancement, Property 4: Node Diagnosis Detects Invalid References
   * Validates: Requirements 4.2, 4.3
   */
  it('Property 4.2: diagnosis should detect invalid node references in CODE nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(invalidNodeRefArb, { minLength: 1, maxLength: 3 }),
        async (invalidRefs) => {
          const workflowId = 'wf-diagnosis-2'

          const nodeWithInvalidRefs = await fc.sample(
            codeNodeWithInvalidRefsArb(invalidRefs),
            1
          )[0]

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
              nodeWithInvalidRefs,
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

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeWithInvalidRefs.id}/diagnose`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: workflowId, nodeId: nodeWithInvalidRefs.id }),
          })
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Should detect invalid references in code
          const invalidRefIssues = data.data.issues.filter(
            (issue: { code: string }) => issue.code === DIAGNOSIS_CODES.INVALID_VARIABLE_REF
          )

          expect(invalidRefIssues.length).toBeGreaterThanOrEqual(1)

          invalidRefIssues.forEach((issue: { severity: string }) => {
            expect(['error', 'warning']).toContain(issue.severity)
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4.3: Diagnosis should detect invalid references in OUTPUT nodes
   *
   * Feature: v1-workflow-api-enhancement, Property 4: Node Diagnosis Detects Invalid References
   * Validates: Requirements 4.2, 4.3
   */
  it('Property 4.3: diagnosis should detect invalid node references in OUTPUT nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(invalidNodeRefArb, { minLength: 1, maxLength: 3 }),
        async (invalidRefs) => {
          const workflowId = 'wf-diagnosis-3'

          const nodeWithInvalidRefs = await fc.sample(
            outputNodeWithInvalidRefsArb(invalidRefs),
            1
          )[0]

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
              nodeWithInvalidRefs,
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

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeWithInvalidRefs.id}/diagnose`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: workflowId, nodeId: nodeWithInvalidRefs.id }),
          })
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          const invalidRefIssues = data.data.issues.filter(
            (issue: { code: string }) => issue.code === DIAGNOSIS_CODES.INVALID_VARIABLE_REF
          )

          expect(invalidRefIssues.length).toBeGreaterThanOrEqual(1)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4.4: Diagnosis should detect invalid references in LOGIC node conditions
   *
   * Feature: v1-workflow-api-enhancement, Property 4: Node Diagnosis Detects Invalid References
   * Validates: Requirements 4.2, 4.3
   */
  it('Property 4.4: diagnosis should detect invalid node references in LOGIC nodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(invalidNodeRefArb, { minLength: 1, maxLength: 3 }),
        async (invalidRefs) => {
          const workflowId = 'wf-diagnosis-4'

          const nodeWithInvalidRefs = await fc.sample(
            logicNodeWithInvalidRefsArb(invalidRefs),
            1
          )[0]

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
              nodeWithInvalidRefs,
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

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${nodeWithInvalidRefs.id}/diagnose`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: workflowId, nodeId: nodeWithInvalidRefs.id }),
          })
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          const invalidRefIssues = data.data.issues.filter(
            (issue: { code: string }) => issue.code === DIAGNOSIS_CODES.INVALID_VARIABLE_REF
          )

          expect(invalidRefIssues.length).toBeGreaterThanOrEqual(1)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4.5: Healthy nodes should return status 'healthy' or only info/warning issues
   *
   * Feature: v1-workflow-api-enhancement, Property 4: Node Diagnosis Detects Invalid References
   * Validates: Requirements 4.5, 4.6
   */
  it('Property 4.5: nodes with valid references should not have invalid reference errors', async () => {
    await fc.assert(
      fc.asyncProperty(healthyProcessNodeArb, async (healthyNode) => {
        const workflowId = 'wf-diagnosis-5'

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
            healthyNode,
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

        const request = new NextRequest(
          `http://localhost/api/v1/workflows/${workflowId}/nodes/${healthyNode.id}/diagnose`,
          {
            method: 'GET',
            headers: {
              Authorization: 'Bearer test-token',
            },
          }
        )

        const response = await GET(request, {
          params: Promise.resolve({ id: workflowId, nodeId: healthyNode.id }),
        })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Should not have any invalid reference errors
        const invalidRefIssues = data.data.issues.filter(
          (issue: { code: string }) => issue.code === DIAGNOSIS_CODES.INVALID_VARIABLE_REF
        )

        expect(invalidRefIssues.length).toBe(0)

        // Status should be healthy, warning, or error (but not due to invalid refs)
        expect(['healthy', 'warning', 'error']).toContain(data.data.status)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 4.6: Diagnosis response structure should be consistent
   *
   * Feature: v1-workflow-api-enhancement, Property 4: Node Diagnosis Detects Invalid References
   * Validates: Requirements 4.5
   */
  it('Property 4.6: diagnosis response should have consistent structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          healthyProcessNodeArb,
          fc.array(invalidNodeRefArb, { minLength: 1, maxLength: 2 }).chain((refs) =>
            processNodeWithInvalidRefsArb(refs)
          )
        ),
        async (node) => {
          const workflowId = 'wf-diagnosis-6'

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

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/diagnose`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const response = await GET(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Response structure validation
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)
          expect(data.data).toHaveProperty('status')
          expect(data.data).toHaveProperty('issues')
          expect(['healthy', 'warning', 'error']).toContain(data.data.status)
          expect(Array.isArray(data.data.issues)).toBe(true)

          // Each issue should have required fields
          data.data.issues.forEach((issue: { severity: string; code: string; message: string }) => {
            expect(issue).toHaveProperty('severity')
            expect(issue).toHaveProperty('code')
            expect(issue).toHaveProperty('message')
            expect(['error', 'warning', 'info']).toContain(issue.severity)
            expect(typeof issue.code).toBe('string')
            expect(typeof issue.message).toBe('string')
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
