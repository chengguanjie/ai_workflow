/**
 * Property-Based Tests for V1 Node Optimization API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 5: Optimization Response Structure
 *
 * Validates: Requirements 5.4, 5.6
 *
 * For any optimization request, the response SHALL contain:
 * - An array of suggestions (may be empty)
 * - Each suggestion with id, title, description, rationale, suggestedConfig, and impact
 * - Token usage information for the AI analysis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v1/workflows/[id]/nodes/[nodeId]/optimize/route'
import type { WorkflowConfig, NodeConfig, NodeType, NodePosition } from '@/types/workflow'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    apiKey: {
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

vi.mock('@/lib/ai', () => ({
  aiService: {
    chat: vi.fn(),
  },
}))

vi.mock('@/lib/crypto', () => ({
  safeDecryptApiKey: vi.fn().mockReturnValue('decrypted-api-key'),
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  updateTokenUsage,
} from '@/lib/auth'
import { aiService } from '@/lib/ai'

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

// Generate PROCESS node for optimization
const processNodeArb: fc.Arbitrary<NodeConfig> = fc.record({
  id: nodeIdArb,
  type: fc.constant('PROCESS' as NodeType),
  name: nodeNameArb,
  position: positionArb,
  config: fc.record({
    systemPrompt: fc.string({ minLength: 1, maxLength: 200 }),
    userPrompt: fc.string({ minLength: 1, maxLength: 200 }),
    temperature: fc.double({ min: 0, max: 1, noNaN: true }),
    maxTokens: fc.integer({ min: 100, max: 4000 }),
  }),
}) as fc.Arbitrary<NodeConfig>

// Generate CODE node for optimization
const codeNodeArb: fc.Arbitrary<NodeConfig> = fc.record({
  id: nodeIdArb,
  type: fc.constant('CODE' as NodeType),
  name: nodeNameArb,
  position: positionArb,
  config: fc.record({
    language: fc.constant('javascript'),
    code: fc.string({ minLength: 10, maxLength: 500 }).map((s) => `function process(input) { ${s.replace(/[{}]/g, '')}; return input; }`),
    timeout: fc.integer({ min: 1000, max: 60000 }),
  }),
}) as fc.Arbitrary<NodeConfig>

// Generate optimizable node (PROCESS or CODE)
const optimizableNodeArb: fc.Arbitrary<NodeConfig> = fc.oneof(
  processNodeArb,
  codeNodeArb
)

// Generate non-optimizable node types
const nonOptimizableNodeArb: fc.Arbitrary<NodeConfig> = fc.oneof(
  // INPUT node
  fc.record({
    id: nodeIdArb,
    type: fc.constant('INPUT' as NodeType),
    name: nodeNameArb,
    position: positionArb,
    config: fc.record({
      fields: fc.array(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          type: fc.constantFrom('string', 'number', 'boolean'),
          required: fc.boolean(),
        }),
        { minLength: 0, maxLength: 3 }
      ),
    }),
  }) as fc.Arbitrary<NodeConfig>,
  // OUTPUT node
  fc.record({
    id: nodeIdArb,
    type: fc.constant('OUTPUT' as NodeType),
    name: nodeNameArb,
    position: positionArb,
    config: fc.record({
      format: fc.constantFrom('text', 'json', 'markdown'),
    }),
  }) as fc.Arbitrary<NodeConfig>
)

// Generate AI optimization suggestions response
const suggestionArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  rationale: fc.string({ minLength: 1, maxLength: 200 }),
  category: fc.constantFrom('prompt', 'performance', 'error_handling', 'clarity'),
  impact: fc.constantFrom('high', 'medium', 'low'),
  suggestedConfig: fc.record({
    systemPrompt: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    userPrompt: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  }),
})

const aiResponseArb = fc.array(suggestionArb, { minLength: 0, maxLength: 3 })

// Generate token usage
const tokenUsageArb = fc.record({
  promptTokens: fc.integer({ min: 10, max: 1000 }),
  completionTokens: fc.integer({ min: 10, max: 500 }),
  totalTokens: fc.integer({ min: 20, max: 1500 }),
})

// ============================================
// Test Setup
// ============================================

describe('V1 Node Optimization API - Property Tests', () => {
  const mockToken = {
    id: 'token-1',
    organizationId: 'org-1',
    createdById: 'user-1',
  }

  const mockApiKey = {
    id: 'api-key-1',
    provider: 'openai',
    defaultModel: 'gpt-4o-mini',
    keyEncrypted: 'encrypted-key',
    baseUrl: null,
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

    // Setup API key mock
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(mockApiKey as never)
  })

  /**
   * Property 5: Optimization Response Structure
   *
   * Feature: v1-workflow-api-enhancement, Property 5: Optimization Response Structure
   * Validates: Requirements 5.4, 5.6
   */
  it('Property 5: optimization response should have consistent structure with suggestions array and token usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        optimizableNodeArb,
        aiResponseArb,
        tokenUsageArb,
        async (node, suggestions, tokenUsage) => {
          const workflowId = 'wf-optimize-1'

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
            version: 1,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

          // Mock AI response with generated suggestions
          const aiResponseContent = JSON.stringify({ suggestions })
          vi.mocked(aiService.chat).mockResolvedValue({
            content: aiResponseContent,
            usage: {
              promptTokens: tokenUsage.promptTokens,
              completionTokens: tokenUsage.completionTokens,
              totalTokens: tokenUsage.totalTokens,
            },
          } as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/optimize`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Bearer test-token',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ apply: false }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Property 5.1: Response should be successful
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Property 5.2: Response should have suggestions array
          expect(data.data).toHaveProperty('suggestions')
          expect(Array.isArray(data.data.suggestions)).toBe(true)

          // Property 5.3: Each suggestion should have required fields
          data.data.suggestions.forEach((suggestion: Record<string, unknown>) => {
            expect(suggestion).toHaveProperty('id')
            expect(suggestion).toHaveProperty('title')
            expect(suggestion).toHaveProperty('description')
            expect(suggestion).toHaveProperty('rationale')
            expect(suggestion).toHaveProperty('suggestedConfig')
            expect(suggestion).toHaveProperty('impact')
            expect(suggestion).toHaveProperty('category')

            // Validate types
            expect(typeof suggestion.id).toBe('string')
            expect(typeof suggestion.title).toBe('string')
            expect(typeof suggestion.description).toBe('string')
            expect(typeof suggestion.rationale).toBe('string')
            expect(typeof suggestion.suggestedConfig).toBe('object')
            expect(['high', 'medium', 'low']).toContain(suggestion.impact)
            expect(['prompt', 'performance', 'error_handling', 'clarity']).toContain(suggestion.category)
          })

          // Property 5.4: Response should have token usage (Requirement 5.6)
          expect(data.data).toHaveProperty('tokenUsage')
          expect(data.data.tokenUsage).toHaveProperty('promptTokens')
          expect(data.data.tokenUsage).toHaveProperty('completionTokens')
          expect(data.data.tokenUsage).toHaveProperty('totalTokens')
          expect(typeof data.data.tokenUsage.promptTokens).toBe('number')
          expect(typeof data.data.tokenUsage.completionTokens).toBe('number')
          expect(typeof data.data.tokenUsage.totalTokens).toBe('number')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 5.2: Non-optimizable nodes should return error
   *
   * Feature: v1-workflow-api-enhancement, Property 5: Optimization Response Structure
   * Validates: Requirements 5.1
   */
  it('Property 5.2: non-optimizable node types should return 400 error', async () => {
    await fc.assert(
      fc.asyncProperty(nonOptimizableNodeArb, async (node) => {
        const workflowId = 'wf-optimize-2'

        const workflowConfig: WorkflowConfig = {
          version: 1,
          nodes: [node],
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

        const request = new NextRequest(
          `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/optimize`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          }
        )

        const response = await POST(request, {
          params: Promise.resolve({ id: workflowId, nodeId: node.id }),
        })
        const data = await response.json()

        // Non-optimizable nodes should return 400 error
        expect(response.status).toBe(400)
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 5.3: Apply parameter should return updated node when true
   *
   * Feature: v1-workflow-api-enhancement, Property 5: Optimization Response Structure
   * Validates: Requirements 5.5
   */
  it('Property 5.3: apply=true should return appliedSuggestion and updatedNode when suggestions exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        optimizableNodeArb,
        fc.array(suggestionArb, { minLength: 1, maxLength: 3 }),
        tokenUsageArb,
        async (node, suggestions, tokenUsage) => {
          const workflowId = 'wf-optimize-3'

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
            version: 1,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
          vi.mocked(prisma.workflow.update).mockResolvedValue(mockWorkflow as never)

          // Mock AI response with at least one suggestion
          const aiResponseContent = JSON.stringify({ suggestions })
          vi.mocked(aiService.chat).mockResolvedValue({
            content: aiResponseContent,
            usage: {
              promptTokens: tokenUsage.promptTokens,
              completionTokens: tokenUsage.completionTokens,
              totalTokens: tokenUsage.totalTokens,
            },
          } as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/optimize`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Bearer test-token',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ apply: true }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Response should be successful
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // When apply=true and suggestions exist, should have appliedSuggestion and updatedNode
          if (data.data.suggestions.length > 0) {
            expect(data.data).toHaveProperty('appliedSuggestion')
            expect(data.data).toHaveProperty('updatedNode')
            expect(typeof data.data.appliedSuggestion).toBe('string')
            expect(data.data.updatedNode).toHaveProperty('id')
            expect(data.data.updatedNode).toHaveProperty('type')
            expect(data.data.updatedNode).toHaveProperty('config')
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 5.4: Empty suggestions should still have valid response structure
   *
   * Feature: v1-workflow-api-enhancement, Property 5: Optimization Response Structure
   * Validates: Requirements 5.4
   */
  it('Property 5.4: empty suggestions should still return valid response structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        optimizableNodeArb,
        tokenUsageArb,
        async (node, tokenUsage) => {
          const workflowId = 'wf-optimize-4'

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
            version: 1,
            config: workflowConfig,
            draftConfig: workflowConfig,
            publishStatus: 'DRAFT',
          }

          vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

          // Mock AI response with empty suggestions
          vi.mocked(aiService.chat).mockResolvedValue({
            content: JSON.stringify({ suggestions: [] }),
            usage: {
              promptTokens: tokenUsage.promptTokens,
              completionTokens: tokenUsage.completionTokens,
              totalTokens: tokenUsage.totalTokens,
            },
          } as never)

          const request = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/nodes/${node.id}/optimize`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Bearer test-token',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ apply: false }),
            }
          )

          const response = await POST(request, {
            params: Promise.resolve({ id: workflowId, nodeId: node.id }),
          })
          const data = await response.json()

          // Response should be successful
          expect(response.status).toBe(200)
          expect(data.success).toBe(true)

          // Should have empty suggestions array
          expect(data.data.suggestions).toEqual([])

          // Should still have token usage
          expect(data.data).toHaveProperty('tokenUsage')
          expect(data.data.tokenUsage.promptTokens).toBeGreaterThanOrEqual(0)
          expect(data.data.tokenUsage.completionTokens).toBeGreaterThanOrEqual(0)
          expect(data.data.tokenUsage.totalTokens).toBeGreaterThanOrEqual(0)

          // Should not have appliedSuggestion or updatedNode when no suggestions
          expect(data.data.appliedSuggestion).toBeUndefined()
          expect(data.data.updatedNode).toBeUndefined()

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
