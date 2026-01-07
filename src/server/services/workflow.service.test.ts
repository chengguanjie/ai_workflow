/**
 * Property-based tests for WorkflowService
 * 
 * Tests Property 5: Service Method Result Typing
 * Tests Property 6: Service Error Structure
 * 
 * Validates: Requirements 3.3, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { WorkflowService } from './workflow.service'
import { NotFoundError, ValidationError, AppError } from '@/lib/errors'
import { prisma } from '@/lib/db'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  withRetry: (operation: () => Promise<unknown>) => operation(),
}))

// Arbitraries for generating test data
const cuidArb = fc.stringMatching(/^c[a-z0-9]{24}$/)
const emailArb = fc.emailAddress()
// Generate valid names that are not whitespace-only (service validates trimmed names)
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
const descriptionArb = fc.option(fc.string({ maxLength: 500 }), { nil: null })
const categoryArb = fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null })

// Arbitrary for workflow config
const workflowConfigArb = fc.record({
  nodes: fc.array(fc.record({
    id: fc.string(),
    type: fc.constantFrom('INPUT', 'PROCESS', 'CODE', 'OUTPUT'),
    data: fc.dictionary(fc.string(), fc.string()),
  })),
  edges: fc.array(fc.record({
    id: fc.string(),
    source: fc.string(),
    target: fc.string(),
  })),
})

// Arbitrary for creator info
const creatorArb = fc.record({
  id: cuidArb,
  name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  email: emailArb,
})

// Arbitrary for workflow summary
const workflowSummaryArb = fc.record({
  id: cuidArb,
  name: nameArb,
  description: descriptionArb,
  category: categoryArb,
  tags: fc.array(fc.string()),
  isActive: fc.boolean(),
  version: fc.integer({ min: 1, max: 1000 }),
  createdAt: fc.date(),
  updatedAt: fc.date(),
  creator: creatorArb,
})

// Arbitrary for full workflow
const workflowArb = fc.record({
  id: cuidArb,
  name: nameArb,
  description: descriptionArb,
  category: categoryArb,
  tags: fc.array(fc.string()),
  isActive: fc.boolean(),
  isPublic: fc.boolean(),
  version: fc.integer({ min: 1, max: 1000 }),
  config: workflowConfigArb,
  createdAt: fc.date(),
  updatedAt: fc.date(),
  deletedAt: fc.constant(null),
  organizationId: cuidArb,
  creatorId: cuidArb,
  creator: creatorArb,
})

// Arbitrary for pagination params
const paginationArb = fc.record({
  page: fc.integer({ min: 1, max: 100 }),
  pageSize: fc.integer({ min: 1, max: 100 }),
  total: fc.integer({ min: 0, max: 10000 }),
})

describe('WorkflowService', () => {
  let service: WorkflowService

  beforeEach(() => {
    service = new WorkflowService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  /**
   * **Feature: project-optimization, Property 5: Service Method Result Typing**
   * **Validates: Requirements 3.3**
   * 
   * For any successful Service method call, the returned result SHALL conform 
   * to the declared return type interface with all required fields present.
   */
  describe('Property 5: Service Method Result Typing', () => {
    it('list() should return PaginatedResult with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(workflowSummaryArb, { minLength: 0, maxLength: 20 }),
          paginationArb,
          cuidArb,
          async (workflows, pagination, organizationId) => {
            const { page, pageSize, total } = pagination
            
            // Mock prisma responses
            vi.mocked(prisma.workflow.count).mockResolvedValue(total)
            vi.mocked(prisma.workflow.findMany).mockResolvedValue(workflows as never)

            const result = await service.list({
              organizationId,
              page,
              pageSize,
            })

            // Verify result conforms to PaginatedResult<WorkflowSummary>
            expect(result).toHaveProperty('data')
            expect(result).toHaveProperty('pagination')
            expect(Array.isArray(result.data)).toBe(true)
            
            // Verify pagination metadata
            expect(result.pagination).toHaveProperty('page')
            expect(result.pagination).toHaveProperty('pageSize')
            expect(result.pagination).toHaveProperty('total')
            expect(result.pagination).toHaveProperty('totalPages')
            
            // Verify types
            expect(typeof result.pagination.page).toBe('number')
            expect(typeof result.pagination.pageSize).toBe('number')
            expect(typeof result.pagination.total).toBe('number')
            expect(typeof result.pagination.totalPages).toBe('number')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('list() pagination metadata should be mathematically consistent', async () => {
      await fc.assert(
        fc.asyncProperty(
          paginationArb,
          cuidArb,
          async (pagination, organizationId) => {
            const { page, pageSize, total } = pagination
            
            vi.mocked(prisma.workflow.count).mockResolvedValue(total)
            vi.mocked(prisma.workflow.findMany).mockResolvedValue([])

            const result = await service.list({
              organizationId,
              page,
              pageSize,
            })

            // totalPages = ceil(total / pageSize)
            const expectedTotalPages = Math.ceil(total / pageSize)
            expect(result.pagination.totalPages).toBe(expectedTotalPages)
            expect(result.pagination.page).toBe(page)
            expect(result.pagination.pageSize).toBe(pageSize)
            expect(result.pagination.total).toBe(total)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('getById() should return workflow with all required fields when found', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowArb,
          cuidArb,
          async (workflow, organizationId) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(workflow as never)

            const result = await service.getById(workflow.id, organizationId)

            // Verify result has all required Workflow fields
            expect(result).not.toBeNull()
            if (result) {
              expect(result).toHaveProperty('id')
              expect(result).toHaveProperty('name')
              expect(result).toHaveProperty('config')
              expect(result).toHaveProperty('organizationId')
              expect(result).toHaveProperty('creatorId')
              expect(result).toHaveProperty('createdAt')
              expect(result).toHaveProperty('updatedAt')
              expect(result).toHaveProperty('version')
              expect(result).toHaveProperty('isActive')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('getById() should return null when workflow not found', async () => {
      await fc.assert(
        fc.asyncProperty(
          cuidArb,
          cuidArb,
          async (id, organizationId) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null)

            const result = await service.getById(id, organizationId)

            expect(result).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('create() should return workflow with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          nameArb,
          descriptionArb,
          workflowConfigArb,
          cuidArb,
          cuidArb,
          async (name, description, config, organizationId, creatorId) => {
            const createdWorkflow = {
              id: 'c' + 'a'.repeat(24),
              name,
              description: description || '',
              category: null,
              tags: [],
              isActive: true,
              isPublic: false,
              version: 1,
              config,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              organizationId,
              creatorId,
            }

            vi.mocked(prisma.workflow.create).mockResolvedValue(createdWorkflow as never)

            const result = await service.create({
              name,
              description: description || undefined,
              config,
              organizationId,
              creatorId,
            })

            // Verify result has all required fields
            expect(result).toHaveProperty('id')
            expect(result).toHaveProperty('name')
            expect(result).toHaveProperty('config')
            expect(result).toHaveProperty('organizationId')
            expect(result).toHaveProperty('creatorId')
            expect(typeof result.id).toBe('string')
            expect(typeof result.name).toBe('string')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('update() should return updated workflow with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowArb,
          nameArb,
          cuidArb,
          async (existingWorkflow, newName, organizationId) => {
            const updatedWorkflow = {
              ...existingWorkflow,
              name: newName,
              version: existingWorkflow.version + 1,
              updatedAt: new Date(),
            }

            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(existingWorkflow as never)
            vi.mocked(prisma.workflow.update).mockResolvedValue(updatedWorkflow as never)

            const result = await service.update(existingWorkflow.id, organizationId, {
              name: newName,
            })

            // Verify result has all required fields
            expect(result).toHaveProperty('id')
            expect(result).toHaveProperty('name')
            expect(result).toHaveProperty('config')
            expect(result).toHaveProperty('version')
            expect(result.name).toBe(newName)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('copy() should return new workflow with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowArb,
          cuidArb,
          cuidArb,
          async (sourceWorkflow, organizationId, userId) => {
            const copiedWorkflow = {
              ...sourceWorkflow,
              id: 'c' + 'b'.repeat(24),
              name: `${sourceWorkflow.name} (副本)`,
              version: 1,
              creatorId: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            }

            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(sourceWorkflow as never)
            vi.mocked(prisma.workflow.create).mockResolvedValue(copiedWorkflow as never)

            const result = await service.copy(sourceWorkflow.id, organizationId, userId)

            // Verify result has all required fields
            expect(result).toHaveProperty('id')
            expect(result).toHaveProperty('name')
            expect(result).toHaveProperty('config')
            expect(result.name).toContain('(副本)')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * **Feature: project-optimization, Property 6: Service Error Structure**
   * **Validates: Requirements 3.4**
   * 
   * For any Service method that encounters a business error, the thrown error 
   * SHALL be an instance of a typed error class containing `code` and `message` properties.
   */
  describe('Property 6: Service Error Structure', () => {
    it('update() should throw NotFoundError with code and message when workflow not found', async () => {
      await fc.assert(
        fc.asyncProperty(
          cuidArb,
          cuidArb,
          nameArb,
          async (id, organizationId, newName) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null)

            try {
              await service.update(id, organizationId, { name: newName })
              // Should not reach here
              expect(true).toBe(false)
            } catch (error) {
              // Verify error is typed AppError with code and message
              expect(error).toBeInstanceOf(AppError)
              expect(error).toBeInstanceOf(NotFoundError)
              
              const appError = error as AppError
              expect(appError).toHaveProperty('code')
              expect(appError).toHaveProperty('message')
              expect(typeof appError.code).toBe('string')
              expect(typeof appError.message).toBe('string')
              expect(appError.code).toBe('NOT_FOUND')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('delete() should throw NotFoundError with code and message when workflow not found', async () => {
      await fc.assert(
        fc.asyncProperty(
          cuidArb,
          cuidArb,
          async (id, organizationId) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null)

            try {
              await service.delete(id, organizationId)
              expect(true).toBe(false)
            } catch (error) {
              expect(error).toBeInstanceOf(AppError)
              expect(error).toBeInstanceOf(NotFoundError)
              
              const appError = error as AppError
              expect(appError).toHaveProperty('code')
              expect(appError).toHaveProperty('message')
              expect(appError.code).toBe('NOT_FOUND')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('copy() should throw NotFoundError with code and message when source workflow not found', async () => {
      await fc.assert(
        fc.asyncProperty(
          cuidArb,
          cuidArb,
          cuidArb,
          async (id, organizationId, userId) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null)

            try {
              await service.copy(id, organizationId, userId)
              expect(true).toBe(false)
            } catch (error) {
              expect(error).toBeInstanceOf(AppError)
              expect(error).toBeInstanceOf(NotFoundError)
              
              const appError = error as AppError
              expect(appError).toHaveProperty('code')
              expect(appError).toHaveProperty('message')
              expect(appError.code).toBe('NOT_FOUND')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('create() should throw ValidationError with code and message for empty name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('', '   ', '\t', '\n'),
          workflowConfigArb,
          cuidArb,
          cuidArb,
          async (emptyName, config, organizationId, creatorId) => {
            try {
              await service.create({
                name: emptyName,
                config,
                organizationId,
                creatorId,
              })
              expect(true).toBe(false)
            } catch (error) {
              expect(error).toBeInstanceOf(AppError)
              expect(error).toBeInstanceOf(ValidationError)
              
              const appError = error as AppError
              expect(appError).toHaveProperty('code')
              expect(appError).toHaveProperty('message')
              expect(appError.code).toBe('VALIDATION_ERROR')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('update() should throw ValidationError with code and message for empty name update', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowArb,
          fc.constantFrom('', '   ', '\t', '\n'),
          cuidArb,
          async (existingWorkflow, emptyName, organizationId) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(existingWorkflow as never)

            try {
              await service.update(existingWorkflow.id, organizationId, { name: emptyName })
              expect(true).toBe(false)
            } catch (error) {
              expect(error).toBeInstanceOf(AppError)
              expect(error).toBeInstanceOf(ValidationError)
              
              const appError = error as AppError
              expect(appError).toHaveProperty('code')
              expect(appError).toHaveProperty('message')
              expect(appError.code).toBe('VALIDATION_ERROR')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('all thrown errors should have toJSON method returning proper structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          cuidArb,
          cuidArb,
          async (id, organizationId) => {
            vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null)

            try {
              await service.delete(id, organizationId)
              expect(true).toBe(false)
            } catch (error) {
              const appError = error as AppError
              const json = appError.toJSON()
              
              // Verify toJSON returns proper structure
              expect(json).toHaveProperty('success', false)
              expect(json).toHaveProperty('error')
              expect(json.error).toHaveProperty('message')
              expect(json.error).toHaveProperty('code')
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
