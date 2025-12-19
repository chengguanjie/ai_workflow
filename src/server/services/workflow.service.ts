/**
 * WorkflowService - Business logic layer for workflow operations
 * 
 * Provides methods for CRUD operations on workflows with proper
 * error handling, pagination, and type safety.
 * 
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { prisma } from '@/lib/db'
import { NotFoundError, ValidationError, BusinessError } from '@/lib/errors'
import type { Workflow, Prisma, TriggerType } from '@prisma/client'
import type { WorkflowConfig, TriggerNodeConfig, TriggerNodeConfigData } from '@/types/workflow'
import crypto from 'crypto'

/**
 * Parameters for listing workflows with pagination and filtering
 */
export interface WorkflowListParams {
  organizationId: string
  page?: number
  pageSize?: number
  search?: string
  category?: string
}

/**
 * Parameters for creating a new workflow
 */
export interface WorkflowCreateParams {
  name: string
  description?: string
  config: Prisma.InputJsonValue
  organizationId: string
  creatorId: string
}

/**
 * Parameters for updating an existing workflow
 */
export interface WorkflowUpdateParams {
  name?: string
  description?: string
  config?: Prisma.InputJsonValue
  isActive?: boolean
  category?: string
  tags?: string[]
}

/**
 * Workflow summary for list responses (without full config)
 */
export interface WorkflowSummary {
  id: string
  name: string
  description: string | null
  category: string | null
  tags: unknown
  isActive: boolean
  version: number
  createdAt: Date
  updatedAt: Date
  creator: {
    id: string
    name: string | null
    email: string
  }
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/**
 * WorkflowService class handles all workflow-related business logic
 */
export class WorkflowService {
  /**
   * List workflows with pagination and optional filtering
   * 
   * @param params - List parameters including pagination and filters
   * @returns Paginated list of workflow summaries
   * 
   * Requirements: 3.1, 4.1, 4.2
   */
  async list(params: WorkflowListParams): Promise<PaginatedResult<WorkflowSummary>> {
    const { organizationId, page = 1, pageSize = 20, search, category } = params

    // Build where clause
    const where: Prisma.WorkflowWhereInput = {
      organizationId,
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ]
    }

    if (category) {
      where.category = category
    }

    // Get total count
    const total = await prisma.workflow.count({ where })

    // Calculate pagination
    const totalPages = Math.ceil(total / pageSize)
    const skip = (page - 1) * pageSize

    // Fetch workflows
    const workflows = await prisma.workflow.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        isActive: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return {
      data: workflows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    }
  }

  /**
   * Get a single workflow by ID
   * 
   * @param id - Workflow ID
   * @param organizationId - Organization ID for access control
   * @returns Workflow with creator info or null if not found
   * 
   * Requirements: 3.1
   */
  async getById(id: string, organizationId: string): Promise<Workflow | null> {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return workflow
  }

  /**
   * Create a new workflow
   * 
   * @param params - Workflow creation parameters
   * @returns Created workflow
   * @throws ValidationError if name is empty
   * 
   * Requirements: 3.1
   */
  async create(params: WorkflowCreateParams): Promise<Workflow> {
    const { name, description, config, organizationId, creatorId } = params

    if (!name || name.trim() === '') {
      throw new ValidationError('名称不能为空')
    }

    const workflow = await prisma.workflow.create({
      data: {
        name: name.trim(),
        description: description || '',
        config,
        organizationId,
        creatorId,
      },
    })

    return workflow
  }

  /**
   * Update an existing workflow
   * 
   * @param id - Workflow ID
   * @param organizationId - Organization ID for access control
   * @param data - Fields to update
   * @returns Updated workflow
   * @throws NotFoundError if workflow doesn't exist
   * 
   * Requirements: 3.1
   */
  async update(
    id: string,
    organizationId: string,
    data: WorkflowUpdateParams
  ): Promise<Workflow> {
    // Verify workflow exists
    const existing = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    })

    if (!existing) {
      throw new NotFoundError('工作流不存在')
    }

    // Build update data
    const updateData: Prisma.WorkflowUpdateInput = {
      version: { increment: 1 },
    }

    if (data.name !== undefined) {
      if (!data.name || data.name.trim() === '') {
        throw new ValidationError('名称不能为空')
      }
      updateData.name = data.name.trim()
    }
    if (data.description !== undefined) updateData.description = data.description
    if (data.config !== undefined) updateData.config = data.config
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.category !== undefined) updateData.category = data.category
    if (data.tags !== undefined) updateData.tags = data.tags

    const workflow = await prisma.workflow.update({
      where: { id },
      data: updateData,
    })

    // Sync trigger from workflow config if config was updated
    if (data.config) {
      await this.syncTriggerFromConfig(workflow.id, data.config as unknown as WorkflowConfig, existing.creatorId)
    }

    return workflow
  }

  /**
   * Sync trigger from workflow config to WorkflowTrigger table
   *
   * @param workflowId - Workflow ID
   * @param config - Workflow configuration
   * @param creatorId - Creator ID for new triggers
   */
  private async syncTriggerFromConfig(
    workflowId: string,
    config: WorkflowConfig,
    creatorId: string
  ): Promise<void> {
    // Find trigger node in config
    const triggerNode = config.nodes?.find(
      (node) => node.type === 'TRIGGER'
    ) as TriggerNodeConfig | undefined

    // Get existing trigger for this workflow
    const existingTrigger = await prisma.workflowTrigger.findFirst({
      where: { workflowId },
    })

    if (!triggerNode) {
      // No trigger node - delete existing trigger if any
      if (existingTrigger) {
        await prisma.workflowTrigger.delete({
          where: { id: existingTrigger.id },
        })
      }
      return
    }

    const triggerConfig = triggerNode.config as TriggerNodeConfigData | undefined
    const triggerType = (triggerConfig?.triggerType || 'MANUAL') as TriggerType

    // Build trigger data
    const triggerData: Prisma.WorkflowTriggerCreateInput = {
      name: triggerNode.name || '触发器',
      type: triggerType,
      enabled: triggerConfig?.enabled ?? true,
      webhookPath: triggerConfig?.webhookPath || null,
      webhookSecret: existingTrigger?.webhookSecret || null,
      cronExpression: triggerConfig?.cronExpression || null,
      timezone: triggerConfig?.timezone || 'Asia/Shanghai',
      inputTemplate: triggerConfig?.inputTemplate as Prisma.InputJsonValue || Prisma.DbNull,
      retryOnFail: triggerConfig?.retryOnFail ?? false,
      maxRetries: triggerConfig?.maxRetries ?? 3,
      workflow: { connect: { id: workflowId } },
      createdById: creatorId,
    }

    // Generate webhook secret if needed and not exists
    if (triggerType === 'WEBHOOK' && triggerConfig?.hasWebhookSecret && !existingTrigger?.webhookSecret) {
      triggerData.webhookSecret = crypto.randomBytes(32).toString('hex')
    }

    // Clear webhook secret if disabled
    if (!triggerConfig?.hasWebhookSecret) {
      triggerData.webhookSecret = null
    }

    if (existingTrigger) {
      // Update existing trigger
      await prisma.workflowTrigger.update({
        where: { id: existingTrigger.id },
        data: {
          name: triggerData.name,
          type: triggerData.type,
          enabled: triggerData.enabled,
          webhookPath: triggerData.webhookPath,
          webhookSecret: triggerData.webhookSecret,
          cronExpression: triggerData.cronExpression,
          timezone: triggerData.timezone,
          inputTemplate: triggerData.inputTemplate,
          retryOnFail: triggerData.retryOnFail,
          maxRetries: triggerData.maxRetries,
        },
      })
    } else {
      // Create new trigger
      await prisma.workflowTrigger.create({
        data: triggerData,
      })
    }
  }

  /**
   * Soft delete a workflow
   * 
   * @param id - Workflow ID
   * @param organizationId - Organization ID for access control
   * @throws NotFoundError if workflow doesn't exist
   * 
   * Requirements: 3.1
   */
  async delete(id: string, organizationId: string): Promise<void> {
    // Verify workflow exists
    const existing = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    })

    if (!existing) {
      throw new NotFoundError('工作流不存在')
    }

    await prisma.workflow.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  /**
   * Copy an existing workflow
   * 
   * @param id - Source workflow ID
   * @param organizationId - Organization ID for access control
   * @param userId - User ID for the new workflow creator
   * @returns Newly created workflow copy
   * @throws NotFoundError if source workflow doesn't exist
   * 
   * Requirements: 4.3
   */
  async copy(id: string, organizationId: string, userId: string): Promise<Workflow> {
    // Get source workflow
    const source = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    })

    if (!source) {
      throw new NotFoundError('工作流不存在')
    }

    // Create copy with new name
    const workflow = await prisma.workflow.create({
      data: {
        name: `${source.name} (副本)`,
        description: source.description,
        category: source.category,
        tags: source.tags as Prisma.InputJsonValue,
        config: source.config as Prisma.InputJsonValue,
        organizationId,
        creatorId: userId,
      },
    })

    return workflow
  }
}

// Export singleton instance
export const workflowService = new WorkflowService()
