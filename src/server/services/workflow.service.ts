/**
 * WorkflowService - Business logic layer for workflow operations
 * 
 * Provides methods for CRUD operations on workflows with proper
 * error handling, pagination, and type safety.
 * 
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import { prisma } from '@/lib/db'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'
import { Prisma } from '@prisma/client'
import type { Workflow, TriggerType } from '@prisma/client'
import type { WorkflowConfig, NodeConfig } from '@/types/workflow'
import { getAccessibleWorkflowIds } from '@/lib/permissions/workflow'
import crypto from 'crypto'

/**
 * Parameters for listing workflows with pagination and filtering
 */
export interface WorkflowListParams {
  organizationId: string
  userId?: string  // 用于权限过滤
  page?: number
  pageSize?: number
  search?: string
  category?: string
  creatorId?: string  // 按创建人筛选
  departmentId?: string  // 按部门筛选
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
  expectedVersion?: number
  forceOverwrite?: boolean
}

/**
 * Parameters for publishing a workflow
 */
export interface WorkflowPublishParams {
  commitMessage?: string
  createVersion?: boolean
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
    const { organizationId, userId, page = 1, pageSize = 20, search, category, creatorId, departmentId } = params

    // Build where clause
    const where: Prisma.WorkflowWhereInput = {
      organizationId,
      deletedAt: null,
    }

    // 如果提供了 userId，进行权限过滤
    if (userId) {
      const accessibleIds = await getAccessibleWorkflowIds(userId, organizationId, 'VIEW')
      // 如果不是 'all'，则需要限制可访问的工作流
      if (accessibleIds !== 'all') {
        where.id = { in: accessibleIds }
      }
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

    // 按创建人筛选
    if (creatorId) {
      where.creatorId = creatorId
    }

    // 按部门筛选（查找该部门下所有用户创建的工作流）
    if (departmentId) {
      const departmentUsers = await prisma.user.findMany({
        where: {
          organizationId,
          departmentId,
        },
        select: { id: true },
      })
      const userIds = departmentUsers.map(u => u.id)
      where.creatorId = { in: userIds }
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
        tags: [],
      },
    })

    return workflow
  }

  /**
   * Update an existing workflow (saves to draftConfig)
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

    // Check for version conflict
    if (
      data.expectedVersion !== undefined &&
      !data.forceOverwrite &&
      existing.version > data.expectedVersion
    ) {
      throw new ConflictError('工作流已被其他用户修改，请刷新后重试', {
        serverData: {
          name: existing.name,
          description: existing.description,
          config: existing.config,
          version: existing.version,
          manual: '', // Assuming manual is not available or empty here
        }
      })
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

    // Config updates go to draftConfig (Draft/Published mechanism)
    if (data.config !== undefined) {
      // Update both config (for backward compatibility) and draftConfig
      updateData.config = data.config
      updateData.draftConfig = data.config

      // Update publish status: if already published, mark as modified
      if (existing.publishStatus === 'PUBLISHED') {
        updateData.publishStatus = 'DRAFT_MODIFIED'
      }
    }

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
   * Publish a workflow (copy draftConfig to publishedConfig)
   *
   * @param id - Workflow ID
   * @param organizationId - Organization ID for access control
   * @param userId - User ID of the publisher
   * @param params - Publish parameters
   * @returns Updated workflow
   * @throws NotFoundError if workflow doesn't exist
   * @throws ValidationError if no draft config exists
   */
  async publish(
    id: string,
    organizationId: string,
    userId: string,
    params: WorkflowPublishParams = {}
  ): Promise<Workflow> {
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

    // Use draftConfig if exists, otherwise use config
    const configToPublish = existing.draftConfig || existing.config

    if (!configToPublish) {
      throw new ValidationError('没有可发布的配置')
    }

    // Update workflow with published config
    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        publishedConfig: configToPublish as Prisma.InputJsonValue,
        publishedAt: new Date(),
        publishedBy: userId,
        publishStatus: 'PUBLISHED',
        version: { increment: 1 },
      },
    })

    // Optionally create a version record
    if (params.createVersion !== false) {
      const latestVersion = await prisma.workflowVersion.findFirst({
        where: { workflowId: id },
        orderBy: { versionNumber: 'desc' },
      })

      await prisma.workflowVersion.create({
        data: {
          workflowId: id,
          versionNumber: (latestVersion?.versionNumber || 0) + 1,
          versionTag: `v${workflow.version}`,
          commitMessage: params.commitMessage || '发布工作流',
          config: configToPublish as Prisma.InputJsonValue,
          versionType: 'MANUAL',
          isPublished: true,
          isActive: true,
          createdById: userId,
        },
      })
    }

    return workflow
  }

  /**
   * Get effective config for execution (published for production, draft for testing)
   *
   * @param id - Workflow ID
   * @param organizationId - Organization ID
   * @param mode - 'production' uses publishedConfig, 'draft' uses draftConfig
   * @returns Workflow config to execute
   */
  async getConfigForExecution(
    id: string,
    organizationId: string,
    mode: 'production' | 'draft' = 'production'
  ): Promise<WorkflowConfig | null> {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      select: {
        config: true,
        draftConfig: true,
        publishedConfig: true,
        publishStatus: true,
      },
    })

    if (!workflow) {
      return null
    }

    if (mode === 'production') {
      // For production: prefer publishedConfig, fallback to config
      return (workflow.publishedConfig || workflow.config) as unknown as WorkflowConfig
    } else {
      // For draft/testing: prefer draftConfig, fallback to config
      return (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
    }
  }

  /**
   * Check if workflow has unpublished changes
   *
   * @param id - Workflow ID
   * @param organizationId - Organization ID
   * @returns Whether there are unpublished changes
   */
  async hasUnpublishedChanges(id: string, organizationId: string): Promise<boolean> {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      select: {
        publishStatus: true,
      },
    })

    return workflow?.publishStatus === 'DRAFT_MODIFIED'
  }

  /**
   * Discard draft changes and revert to published config
   *
   * @param id - Workflow ID
   * @param organizationId - Organization ID
   * @returns Updated workflow
   */
  async discardDraft(id: string, organizationId: string): Promise<Workflow> {
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

    if (!existing.publishedConfig) {
      throw new ValidationError('没有已发布的版本可以恢复')
    }

    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        config: existing.publishedConfig as Prisma.InputJsonValue,
        draftConfig: existing.publishedConfig as Prisma.InputJsonValue,
        publishStatus: 'PUBLISHED',
      },
    })

    return workflow
  }

  /**
   * Get comparison between draft and published configs
   *
   * @param id - Workflow ID
   * @param organizationId - Organization ID
   * @returns Comparison result with added, removed, and modified items
   */
  async getVersionComparison(
    id: string,
    organizationId: string
  ): Promise<{
    draftConfig: WorkflowConfig | null
    publishedConfig: WorkflowConfig | null
    changes: {
      nodes: {
        added: Array<{ id: string; name: string; type: string }>
        removed: Array<{ id: string; name: string; type: string }>
        modified: Array<{ id: string; name: string; type: string; changes: string[] }>
      }
      edges: {
        added: Array<{ id: string; source: string; target: string }>
        removed: Array<{ id: string; source: string; target: string }>
      }
      settings: {
        changed: boolean
        oldValue?: Record<string, unknown>
        newValue?: Record<string, unknown>
      }
    }
    summary: {
      totalChanges: number
      hasChanges: boolean
    }
  }> {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      select: {
        draftConfig: true,
        publishedConfig: true,
        config: true,
        publishStatus: true,
      },
    })

    if (!workflow) {
      throw new NotFoundError('工作流不存在')
    }

    const draftConfig = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig | null
    const publishedConfig = workflow.publishedConfig as unknown as WorkflowConfig | null

    // If no published config, return draft only
    if (!publishedConfig) {
      const nodeCount = draftConfig?.nodes?.length || 0
      const edgeCount = draftConfig?.edges?.length || 0
      return {
        draftConfig,
        publishedConfig: null,
        changes: {
          nodes: {
            added: draftConfig?.nodes?.map(n => ({ id: n.id, name: n.name, type: n.type })) || [],
            removed: [],
            modified: [],
          },
          edges: {
            added: draftConfig?.edges?.map(e => ({ id: e.id, source: e.source, target: e.target })) || [],
            removed: [],
          },
          settings: {
            changed: false,
          },
        },
        summary: {
          totalChanges: nodeCount + edgeCount,
          hasChanges: nodeCount > 0 || edgeCount > 0,
        },
      }
    }

    // Compare nodes
    const draftNodes = new Map((draftConfig?.nodes || []).map(n => [n.id, n]))
    const publishedNodes = new Map((publishedConfig?.nodes || []).map(n => [n.id, n]))

    const addedNodes: Array<{ id: string; name: string; type: string }> = []
    const removedNodes: Array<{ id: string; name: string; type: string }> = []
    const modifiedNodes: Array<{ id: string; name: string; type: string; changes: string[] }> = []

    // Find added and modified nodes
    for (const [nodeId, draftNode] of draftNodes) {
      const publishedNode = publishedNodes.get(nodeId)
      if (!publishedNode) {
        addedNodes.push({ id: nodeId, name: draftNode.name, type: draftNode.type })
      } else {
        // Check for modifications
        const changes: string[] = []
        if (draftNode.name !== publishedNode.name) {
          changes.push(`名称: "${publishedNode.name}" → "${draftNode.name}"`)
        }
        if (JSON.stringify(draftNode.position) !== JSON.stringify(publishedNode.position)) {
          changes.push('位置已更改')
        }
        if (JSON.stringify(draftNode.config) !== JSON.stringify(publishedNode.config)) {
          changes.push('配置已更改')
        }
        if (draftNode.comment !== publishedNode.comment) {
          changes.push('备注已更改')
        }
        if (changes.length > 0) {
          modifiedNodes.push({ id: nodeId, name: draftNode.name, type: draftNode.type, changes })
        }
      }
    }

    // Find removed nodes
    for (const [nodeId, publishedNode] of publishedNodes) {
      if (!draftNodes.has(nodeId)) {
        removedNodes.push({ id: nodeId, name: publishedNode.name, type: publishedNode.type })
      }
    }

    // Compare edges
    const draftEdges = new Map((draftConfig?.edges || []).map(e => [e.id, e]))
    const publishedEdges = new Map((publishedConfig?.edges || []).map(e => [e.id, e]))

    const addedEdges: Array<{ id: string; source: string; target: string }> = []
    const removedEdges: Array<{ id: string; source: string; target: string }> = []

    for (const [edgeId, draftEdge] of draftEdges) {
      if (!publishedEdges.has(edgeId)) {
        addedEdges.push({ id: edgeId, source: draftEdge.source, target: draftEdge.target })
      }
    }

    for (const [edgeId, publishedEdge] of publishedEdges) {
      if (!draftEdges.has(edgeId)) {
        removedEdges.push({ id: edgeId, source: publishedEdge.source, target: publishedEdge.target })
      }
    }

    // Compare settings
    const settingsChanged = JSON.stringify(draftConfig?.settings) !== JSON.stringify(publishedConfig?.settings)

    const totalChanges = addedNodes.length + removedNodes.length + modifiedNodes.length +
      addedEdges.length + removedEdges.length + (settingsChanged ? 1 : 0)

    return {
      draftConfig,
      publishedConfig,
      changes: {
        nodes: {
          added: addedNodes,
          removed: removedNodes,
          modified: modifiedNodes,
        },
        edges: {
          added: addedEdges,
          removed: removedEdges,
        },
        settings: {
          changed: settingsChanged,
          oldValue: settingsChanged ? (publishedConfig?.settings as Record<string, unknown>) : undefined,
          newValue: settingsChanged ? (draftConfig?.settings as Record<string, unknown>) : undefined,
        },
      },
      summary: {
        totalChanges,
        hasChanges: totalChanges > 0,
      },
    }
  }

  /**
   * Sync trigger from workflow config to WorkflowTrigger table
   * 
   * Note: TRIGGER nodes have been deprecated. Trigger configuration is now
   * stored within INPUT nodes as triggerConfig property.
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
    interface TriggerNodeConfigData {
      triggerType?: 'MANUAL' | 'WEBHOOK' | 'SCHEDULE'
      enabled?: boolean
      webhookPath?: string
      hasWebhookSecret?: boolean
      cronExpression?: string
      timezone?: string
      inputTemplate?: Record<string, unknown>
      retryOnFail?: boolean
      maxRetries?: number
    }

    const inputNode = config.nodes?.find(
      (node) => node.type === 'INPUT'
    ) as NodeConfig | undefined

    const existingTrigger = await prisma.workflowTrigger.findFirst({
      where: { workflowId },
    })

    const inputConfig = inputNode?.config as Record<string, unknown> | undefined
    const triggerConfig = inputConfig?.triggerConfig as TriggerNodeConfigData | undefined

    if (!triggerConfig || !triggerConfig.triggerType || triggerConfig.triggerType === 'MANUAL') {
      if (existingTrigger) {
        await prisma.workflowTrigger.delete({
          where: { id: existingTrigger.id },
        })
      }
      return
    }

    const triggerType = triggerConfig.triggerType as TriggerType

    const triggerData: Prisma.WorkflowTriggerCreateInput = {
      name: inputNode?.name || '触发器',
      type: triggerType,
      enabled: triggerConfig.enabled ?? true,
      webhookPath: triggerConfig.webhookPath || null,
      webhookSecret: existingTrigger?.webhookSecret || null,
      cronExpression: triggerConfig.cronExpression || null,
      timezone: triggerConfig.timezone || 'Asia/Shanghai',
      inputTemplate: triggerConfig.inputTemplate as Prisma.InputJsonValue || Prisma.DbNull,
      retryOnFail: triggerConfig.retryOnFail ?? false,
      maxRetries: triggerConfig.maxRetries ?? 3,
      workflow: { connect: { id: workflowId } },
      createdById: creatorId,
    }

    if (triggerType === 'WEBHOOK' && triggerConfig.hasWebhookSecret && !existingTrigger?.webhookSecret) {
      triggerData.webhookSecret = crypto.randomBytes(32).toString('hex')
    }

    if (!triggerConfig.hasWebhookSecret) {
      triggerData.webhookSecret = null
    }

    if (existingTrigger) {
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
