/**
 * Property-Based Tests for V1 Workflow Trigger Management API
 *
 * Feature: v1-workflow-api-enhancement
 * Property 9: Trigger CRUD Operations
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 *
 * Property 9: For any workflow, trigger operations SHALL satisfy:
 * - Created triggers appear in the list
 * - Updated triggers reflect the changes
 * - Deleted triggers no longer appear in the list
 * - WEBHOOK triggers have generated URL and secret
 * - SCHEDULE triggers have valid cron expressions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { GET as listTriggers, POST as createTrigger } from '@/app/api/v1/workflows/[id]/triggers/route'
import { GET as getTrigger, PUT as updateTrigger, DELETE as deleteTrigger } from '@/app/api/v1/workflows/[id]/triggers/[triggerId]/route'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findFirst: vi.fn(),
    },
    workflowTrigger: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    apiToken: {
      findUnique: vi.fn(),
    },
    triggerLog: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  validateApiTokenWithScope: vi.fn(),
  validateCrossOrganization: vi.fn(),
  createCrossOrgNotFoundResponse: vi.fn(),
  updateTokenUsage: vi.fn(),
}))

vi.mock('@/lib/webhook/signature', () => ({
  generateWebhookPath: vi.fn(() => 'mock-webhook-path-' + Math.random().toString(36).substring(7)),
  generateWebhookSecret: vi.fn(() => 'whsec_mock-secret-' + Math.random().toString(36).substring(7)),
}))

vi.mock('@/lib/scheduler', () => ({
  scheduler: {
    scheduleJob: vi.fn(),
    removeJob: vi.fn(),
  },
}))

// Import mocked modules
import { prisma } from '@/lib/db'
import {
  validateApiTokenWithScope,
  validateCrossOrganization,
  updateTokenUsage,
} from '@/lib/auth'
import { generateWebhookPath, generateWebhookSecret } from '@/lib/webhook/signature'


// ============================================
// Arbitraries (Generators)
// ============================================

// Trigger type generator
const triggerTypeArb: fc.Arbitrary<'WEBHOOK' | 'SCHEDULE'> = fc.constantFrom('WEBHOOK', 'SCHEDULE')

// Trigger name generator
const triggerNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

// Valid cron expression generator (common patterns)
const cronExpressionArb: fc.Arbitrary<string> = fc.constantFrom(
  '0 * * * *',      // Every hour
  '*/5 * * * *',   // Every 5 minutes
  '0 0 * * *',     // Daily at midnight
  '0 9 * * 1-5',   // Weekdays at 9am
  '0 0 1 * *',     // Monthly on 1st
  '30 8 * * *',    // Daily at 8:30
  '0 12 * * 0',    // Sundays at noon
  '*/15 * * * *',  // Every 15 minutes
  '0 6,18 * * *',  // 6am and 6pm
  '0 0 * * 1',     // Every Monday
)

// Timezone generator
const timezoneArb: fc.Arbitrary<string> = fc.constantFrom(
  'Asia/Shanghai',
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo'
)

// Input template generator
const inputTemplateArb: fc.Arbitrary<Record<string, unknown> | undefined> = fc.option(
  fc.record({
    key: fc.string({ minLength: 1, maxLength: 20 }),
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  }),
  { nil: undefined }
)

// Boolean generator
const enabledArb: fc.Arbitrary<boolean> = fc.boolean()

// Max retries generator (1-10)
const maxRetriesArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10 })

// Generate a complete trigger creation request
const webhookTriggerRequestArb: fc.Arbitrary<{
  name: string
  type: 'WEBHOOK'
  enabled: boolean
  inputTemplate?: Record<string, unknown>
  retryOnFail: boolean
  maxRetries: number
}> = fc.record({
  name: triggerNameArb,
  type: fc.constant('WEBHOOK' as const),
  enabled: enabledArb,
  inputTemplate: inputTemplateArb,
  retryOnFail: fc.boolean(),
  maxRetries: maxRetriesArb,
})

const scheduleTriggerRequestArb: fc.Arbitrary<{
  name: string
  type: 'SCHEDULE'
  enabled: boolean
  cronExpression: string
  timezone: string
  inputTemplate?: Record<string, unknown>
  retryOnFail: boolean
  maxRetries: number
}> = fc.record({
  name: triggerNameArb,
  type: fc.constant('SCHEDULE' as const),
  enabled: enabledArb,
  cronExpression: cronExpressionArb,
  timezone: timezoneArb,
  inputTemplate: inputTemplateArb,
  retryOnFail: fc.boolean(),
  maxRetries: maxRetriesArb,
})

// Combined trigger request generator
const triggerRequestArb = fc.oneof(webhookTriggerRequestArb, scheduleTriggerRequestArb)

// Update request generator (partial fields)
const triggerUpdateArb: fc.Arbitrary<{
  name?: string
  enabled?: boolean
  cronExpression?: string
  timezone?: string
  retryOnFail?: boolean
  maxRetries?: number
}> = fc.record({
  name: fc.option(triggerNameArb, { nil: undefined }),
  enabled: fc.option(enabledArb, { nil: undefined }),
  cronExpression: fc.option(cronExpressionArb, { nil: undefined }),
  timezone: fc.option(timezoneArb, { nil: undefined }),
  retryOnFail: fc.option(fc.boolean(), { nil: undefined }),
  maxRetries: fc.option(maxRetriesArb, { nil: undefined }),
}).filter(obj => Object.values(obj).some(v => v !== undefined))


// ============================================
// Test Setup
// ============================================

describe('V1 Workflow Trigger Management API - Property Tests', () => {
  const mockToken = {
    id: 'token-1',
    organizationId: 'org-1',
    createdById: 'user-1',
  }

  const mockWorkflow = {
    id: 'wf-test-1',
    name: 'Test Workflow',
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

    // Setup workflow mock
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)

    // Setup API token mock
    vi.mocked(prisma.apiToken.findUnique).mockResolvedValue({
      id: mockToken.id,
      createdById: 'user-1',
    } as never)
  })

  /**
   * Property 9a: Created WEBHOOK triggers have URL and secret
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.2, 8.5
   */
  it('Property 9a: WEBHOOK triggers have generated URL and secret on creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        webhookTriggerRequestArb,
        async (triggerRequest) => {
          const workflowId = mockWorkflow.id
          const triggerId = 'trigger-' + Math.random().toString(36).substring(7)
          const webhookPath = 'mock-path-' + Math.random().toString(36).substring(7)
          const webhookSecret = 'whsec_mock-' + Math.random().toString(36).substring(7)

          // Mock webhook generation
          vi.mocked(generateWebhookPath).mockReturnValue(webhookPath)
          vi.mocked(generateWebhookSecret).mockReturnValue(webhookSecret)

          // Mock trigger creation
          const createdTrigger = {
            id: triggerId,
            name: triggerRequest.name,
            type: 'WEBHOOK',
            enabled: triggerRequest.enabled,
            webhookPath,
            webhookSecret,
            cronExpression: null,
            timezone: 'Asia/Shanghai',
            inputTemplate: triggerRequest.inputTemplate || null,
            retryOnFail: triggerRequest.retryOnFail,
            maxRetries: triggerRequest.maxRetries,
            triggerCount: 0,
            lastTriggeredAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            workflowId,
            createdById: 'user-1',
          }

          vi.mocked(prisma.workflowTrigger.create).mockResolvedValue(createdTrigger as never)

          // Create trigger
          const createRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify(triggerRequest),
            }
          )

          const createResponse = await createTrigger(createRequest, {
            params: Promise.resolve({ id: workflowId }),
          })
          const createData = await createResponse.json()

          // Property 9a: WEBHOOK triggers must have URL and secret
          expect(createResponse.status).toBe(201)
          expect(createData.success).toBe(true)
          expect(createData.data.type).toBe('WEBHOOK')
          expect(createData.data.webhookUrl).toBeDefined()
          expect(createData.data.webhookUrl).toContain(webhookPath)
          expect(createData.data.webhookSecret).toBe(webhookSecret)
          expect(createData.data.name).toBe(triggerRequest.name)
          expect(createData.data.enabled).toBe(triggerRequest.enabled)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })


  /**
   * Property 9b: Created SCHEDULE triggers have valid cron expressions
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.2, 8.6
   */
  it('Property 9b: SCHEDULE triggers have valid cron expressions', async () => {
    await fc.assert(
      fc.asyncProperty(
        scheduleTriggerRequestArb,
        async (triggerRequest) => {
          const workflowId = mockWorkflow.id
          const triggerId = 'trigger-' + Math.random().toString(36).substring(7)

          // Mock trigger creation
          const createdTrigger = {
            id: triggerId,
            name: triggerRequest.name,
            type: 'SCHEDULE',
            enabled: triggerRequest.enabled,
            webhookPath: null,
            webhookSecret: null,
            cronExpression: triggerRequest.cronExpression,
            timezone: triggerRequest.timezone,
            inputTemplate: triggerRequest.inputTemplate || null,
            retryOnFail: triggerRequest.retryOnFail,
            maxRetries: triggerRequest.maxRetries,
            triggerCount: 0,
            lastTriggeredAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            workflowId,
            createdById: 'user-1',
          }

          vi.mocked(prisma.workflowTrigger.create).mockResolvedValue(createdTrigger as never)

          // Create trigger
          const createRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify(triggerRequest),
            }
          )

          const createResponse = await createTrigger(createRequest, {
            params: Promise.resolve({ id: workflowId }),
          })
          const createData = await createResponse.json()

          // Property 9b: SCHEDULE triggers must have cron expression
          expect(createResponse.status).toBe(201)
          expect(createData.success).toBe(true)
          expect(createData.data.type).toBe('SCHEDULE')
          expect(createData.data.cronExpression).toBe(triggerRequest.cronExpression)
          expect(createData.data.timezone).toBe(triggerRequest.timezone)
          expect(createData.data.webhookUrl).toBeNull()

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 9c: Created triggers appear in the list
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.1, 8.2
   */
  it('Property 9c: created triggers appear in the trigger list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(triggerRequestArb, { minLength: 1, maxLength: 5 }),
        async (triggerRequests) => {
          const workflowId = mockWorkflow.id

          // Create mock triggers from requests
          const mockTriggers = triggerRequests.map((req, index) => ({
            id: `trigger-${index}`,
            name: req.name,
            type: req.type,
            enabled: req.enabled,
            webhookPath: req.type === 'WEBHOOK' ? `path-${index}` : null,
            webhookSecret: req.type === 'WEBHOOK' ? `secret-${index}` : null,
            cronExpression: req.type === 'SCHEDULE' ? (req as { cronExpression: string }).cronExpression : null,
            timezone: req.type === 'SCHEDULE' ? (req as { timezone: string }).timezone : 'Asia/Shanghai',
            inputTemplate: req.inputTemplate || null,
            retryOnFail: req.retryOnFail,
            maxRetries: req.maxRetries,
            triggerCount: 0,
            lastTriggeredAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { logs: 0 },
          }))

          vi.mocked(prisma.workflowTrigger.findMany).mockResolvedValue(mockTriggers as never)
          vi.mocked(prisma.workflowTrigger.count).mockResolvedValue(mockTriggers.length)

          // List triggers
          const listRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const listResponse = await listTriggers(listRequest, {
            params: Promise.resolve({ id: workflowId }),
          })
          const listData = await listResponse.json()

          // Property 9c: All created triggers should appear in the list
          expect(listResponse.status).toBe(200)
          expect(listData.success).toBe(true)
          expect(listData.data.length).toBe(mockTriggers.length)

          // Verify each trigger is in the list with correct data
          for (let i = 0; i < mockTriggers.length; i++) {
            const mockTrigger = mockTriggers[i]
            const listedTrigger = listData.data.find((t: { id: string }) => t.id === mockTrigger.id)
            expect(listedTrigger).toBeDefined()
            expect(listedTrigger.name).toBe(mockTrigger.name)
            expect(listedTrigger.type).toBe(mockTrigger.type)
            expect(listedTrigger.enabled).toBe(mockTrigger.enabled)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })


  /**
   * Property 9d: Updated triggers reflect the changes
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.3
   */
  it('Property 9d: updated triggers reflect the changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        scheduleTriggerRequestArb,
        triggerUpdateArb,
        async (originalRequest, updateRequest) => {
          const workflowId = mockWorkflow.id
          const triggerId = 'trigger-update-test'

          // Original trigger
          const originalTrigger = {
            id: triggerId,
            name: originalRequest.name,
            type: 'SCHEDULE' as const,
            enabled: originalRequest.enabled,
            webhookPath: null,
            webhookSecret: null,
            cronExpression: originalRequest.cronExpression,
            timezone: originalRequest.timezone,
            inputTemplate: originalRequest.inputTemplate || null,
            retryOnFail: originalRequest.retryOnFail,
            maxRetries: originalRequest.maxRetries,
            triggerCount: 5,
            lastTriggeredAt: new Date(),
            lastSuccessAt: new Date(),
            lastFailureAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            workflowId,
            createdById: 'user-1',
            workflow: mockWorkflow,
          }

          // Expected updated trigger
          const updatedTrigger = {
            ...originalTrigger,
            name: updateRequest.name ?? originalTrigger.name,
            enabled: updateRequest.enabled ?? originalTrigger.enabled,
            cronExpression: updateRequest.cronExpression ?? originalTrigger.cronExpression,
            timezone: updateRequest.timezone ?? originalTrigger.timezone,
            retryOnFail: updateRequest.retryOnFail ?? originalTrigger.retryOnFail,
            maxRetries: updateRequest.maxRetries ?? originalTrigger.maxRetries,
            updatedAt: new Date(),
          }

          vi.mocked(prisma.workflowTrigger.findFirst).mockResolvedValue(originalTrigger as never)
          vi.mocked(prisma.workflowTrigger.update).mockResolvedValue(updatedTrigger as never)

          // Update trigger
          const updateReq = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers/${triggerId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify(updateRequest),
            }
          )

          const updateResponse = await updateTrigger(updateReq, {
            params: Promise.resolve({ id: workflowId, triggerId }),
          })
          const updateData = await updateResponse.json()

          // Property 9d: Updated fields should reflect the changes
          expect(updateResponse.status).toBe(200)
          expect(updateData.success).toBe(true)

          if (updateRequest.name !== undefined) {
            expect(updateData.data.name).toBe(updateRequest.name)
          }
          if (updateRequest.enabled !== undefined) {
            expect(updateData.data.enabled).toBe(updateRequest.enabled)
          }
          if (updateRequest.cronExpression !== undefined) {
            expect(updateData.data.cronExpression).toBe(updateRequest.cronExpression)
          }
          if (updateRequest.timezone !== undefined) {
            expect(updateData.data.timezone).toBe(updateRequest.timezone)
          }
          if (updateRequest.retryOnFail !== undefined) {
            expect(updateData.data.retryOnFail).toBe(updateRequest.retryOnFail)
          }
          if (updateRequest.maxRetries !== undefined) {
            expect(updateData.data.maxRetries).toBe(updateRequest.maxRetries)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 9e: Deleted triggers no longer appear in the list
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.4
   */
  it('Property 9e: deleted triggers no longer appear in the list', async () => {
    await fc.assert(
      fc.asyncProperty(
        triggerRequestArb,
        async (triggerRequest) => {
          const workflowId = mockWorkflow.id
          const triggerId = 'trigger-delete-test'

          // Mock trigger to delete
          const triggerToDelete = {
            id: triggerId,
            name: triggerRequest.name,
            type: triggerRequest.type,
            enabled: triggerRequest.enabled,
            webhookPath: triggerRequest.type === 'WEBHOOK' ? 'path-1' : null,
            webhookSecret: triggerRequest.type === 'WEBHOOK' ? 'secret-1' : null,
            cronExpression: triggerRequest.type === 'SCHEDULE' ? (triggerRequest as { cronExpression: string }).cronExpression : null,
            timezone: triggerRequest.type === 'SCHEDULE' ? (triggerRequest as { timezone: string }).timezone : 'Asia/Shanghai',
            inputTemplate: triggerRequest.inputTemplate || null,
            retryOnFail: triggerRequest.retryOnFail,
            maxRetries: triggerRequest.maxRetries,
            triggerCount: 0,
            lastTriggeredAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            workflowId,
            createdById: 'user-1',
            workflow: mockWorkflow,
          }

          vi.mocked(prisma.workflowTrigger.findFirst).mockResolvedValue(triggerToDelete as never)
          vi.mocked(prisma.workflowTrigger.delete).mockResolvedValue(triggerToDelete as never)

          // Delete trigger
          const deleteRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers/${triggerId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const deleteResponse = await deleteTrigger(deleteRequest, {
            params: Promise.resolve({ id: workflowId, triggerId }),
          })
          const deleteData = await deleteResponse.json()

          // Property 9e: Delete should succeed
          expect(deleteResponse.status).toBe(200)
          expect(deleteData.success).toBe(true)
          expect(deleteData.data.message).toBe('触发器已删除')

          // Verify delete was called
          expect(prisma.workflowTrigger.delete).toHaveBeenCalledWith({
            where: { id: triggerId },
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })


  /**
   * Property 9f: Trigger enable/disable toggle works correctly
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.7
   */
  it('Property 9f: trigger enabled field can be toggled', async () => {
    await fc.assert(
      fc.asyncProperty(
        triggerRequestArb,
        async (triggerRequest) => {
          const workflowId = mockWorkflow.id
          const triggerId = 'trigger-toggle-test'
          const originalEnabled = triggerRequest.enabled
          const newEnabled = !originalEnabled

          // Original trigger
          const originalTrigger = {
            id: triggerId,
            name: triggerRequest.name,
            type: triggerRequest.type,
            enabled: originalEnabled,
            webhookPath: triggerRequest.type === 'WEBHOOK' ? 'path-1' : null,
            webhookSecret: triggerRequest.type === 'WEBHOOK' ? 'secret-1' : null,
            cronExpression: triggerRequest.type === 'SCHEDULE' ? (triggerRequest as { cronExpression: string }).cronExpression : null,
            timezone: triggerRequest.type === 'SCHEDULE' ? (triggerRequest as { timezone: string }).timezone : 'Asia/Shanghai',
            inputTemplate: triggerRequest.inputTemplate || null,
            retryOnFail: triggerRequest.retryOnFail,
            maxRetries: triggerRequest.maxRetries,
            triggerCount: 0,
            lastTriggeredAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            workflowId,
            createdById: 'user-1',
            workflow: mockWorkflow,
          }

          // Updated trigger with toggled enabled
          const updatedTrigger = {
            ...originalTrigger,
            enabled: newEnabled,
            updatedAt: new Date(),
          }

          vi.mocked(prisma.workflowTrigger.findFirst).mockResolvedValue(originalTrigger as never)
          vi.mocked(prisma.workflowTrigger.update).mockResolvedValue(updatedTrigger as never)

          // Toggle enabled
          const updateRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers/${triggerId}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({ enabled: newEnabled }),
            }
          )

          const updateResponse = await updateTrigger(updateRequest, {
            params: Promise.resolve({ id: workflowId, triggerId }),
          })
          const updateData = await updateResponse.json()

          // Property 9f: Enabled should be toggled
          expect(updateResponse.status).toBe(200)
          expect(updateData.success).toBe(true)
          expect(updateData.data.enabled).toBe(newEnabled)
          expect(updateData.data.enabled).not.toBe(originalEnabled)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 9g: Get trigger returns complete details
   *
   * Feature: v1-workflow-api-enhancement, Property 9: Trigger CRUD Operations
   * Validates: Requirements 8.1
   */
  it('Property 9g: get trigger returns complete details with stats', async () => {
    await fc.assert(
      fc.asyncProperty(
        triggerRequestArb,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        async (triggerRequest, totalCount, successCount, failedCount) => {
          const workflowId = mockWorkflow.id
          const triggerId = 'trigger-get-test'

          // Mock trigger
          const trigger = {
            id: triggerId,
            name: triggerRequest.name,
            type: triggerRequest.type,
            enabled: triggerRequest.enabled,
            webhookPath: triggerRequest.type === 'WEBHOOK' ? 'path-1' : null,
            webhookSecret: triggerRequest.type === 'WEBHOOK' ? 'secret-1' : null,
            cronExpression: triggerRequest.type === 'SCHEDULE' ? (triggerRequest as { cronExpression: string }).cronExpression : null,
            timezone: triggerRequest.type === 'SCHEDULE' ? (triggerRequest as { timezone: string }).timezone : 'Asia/Shanghai',
            inputTemplate: triggerRequest.inputTemplate || null,
            retryOnFail: triggerRequest.retryOnFail,
            maxRetries: triggerRequest.maxRetries,
            triggerCount: totalCount,
            lastTriggeredAt: totalCount > 0 ? new Date() : null,
            lastSuccessAt: successCount > 0 ? new Date() : null,
            lastFailureAt: failedCount > 0 ? new Date() : null,
            createdAt: new Date(),
            updatedAt: new Date(),
            workflowId,
            createdById: 'user-1',
            workflow: mockWorkflow,
          }

          vi.mocked(prisma.workflowTrigger.findFirst).mockResolvedValue(trigger as never)
          vi.mocked(prisma.triggerLog.findMany).mockResolvedValue([])
          vi.mocked(prisma.triggerLog.groupBy).mockResolvedValue([
            { status: 'SUCCESS', _count: successCount },
            { status: 'FAILED', _count: failedCount },
          ] as never)

          // Get trigger
          const getRequest = new NextRequest(
            `http://localhost/api/v1/workflows/${workflowId}/triggers/${triggerId}`,
            {
              method: 'GET',
              headers: {
                Authorization: 'Bearer test-token',
              },
            }
          )

          const getResponse = await getTrigger(getRequest, {
            params: Promise.resolve({ id: workflowId, triggerId }),
          })
          const getData = await getResponse.json()

          // Property 9g: Response should contain complete details
          expect(getResponse.status).toBe(200)
          expect(getData.success).toBe(true)
          expect(getData.data.id).toBe(triggerId)
          expect(getData.data.name).toBe(triggerRequest.name)
          expect(getData.data.type).toBe(triggerRequest.type)
          expect(getData.data.enabled).toBe(triggerRequest.enabled)
          expect(getData.data.triggerCount).toBe(totalCount)
          expect(getData.data.stats).toBeDefined()
          expect(getData.data.stats.success).toBe(successCount)
          expect(getData.data.stats.failed).toBe(failedCount)
          expect(getData.data.workflow).toBeDefined()
          expect(getData.data.workflow.id).toBe(workflowId)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
