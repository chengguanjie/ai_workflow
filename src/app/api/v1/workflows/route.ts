/**
 * V1 Workflow API Routes
 *
 * Provides public API endpoints for listing and creating workflows.
 * Uses API Token authentication with scope validation.
 *
 * Endpoints:
 * - GET /api/v1/workflows - List workflows
 * - POST /api/v1/workflows - Create workflow (with enhanced options)
 *
 * Enhanced creation supports:
 * - templateId: Create from template
 * - nodes + autoConnect: Build config from nodes array
 * - validateOnCreate: Validate configuration and return warnings
 * - triggers: Create initial triggers
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
import { ApiResponse } from '@/lib/api/api-response'
import {
  validateApiTokenWithScope,
  updateTokenUsage,
} from '@/lib/auth'
import { generateWebhookPath, generateWebhookSecret } from '@/lib/webhook/signature'
import { scheduler } from '@/lib/scheduler'
import { nodeDiagnosisService, type DiagnosisIssue } from '@/lib/services/node-diagnosis.service'
import cron from 'node-cron'
import type { WorkflowConfig, NodeConfig, EdgeConfig } from '@/types/workflow'

interface WorkflowListParams {
  page?: number
  pageSize?: number
  search?: string
  category?: string
}

/**
 * Trigger creation request interface
 */
interface CreateTriggerRequest {
  name: string
  type: 'WEBHOOK' | 'SCHEDULE'
  enabled?: boolean
  cronExpression?: string
  timezone?: string
  inputTemplate?: Record<string, unknown>
  retryOnFail?: boolean
  maxRetries?: number
}

/**
 * Extended workflow creation request interface
 */
interface CreateWorkflowRequest {
  name: string
  description?: string
  config?: WorkflowConfig
  category?: string
  tags?: string[]
  // Enhanced options
  templateId?: string
  nodes?: NodeConfig[]
  autoConnect?: boolean
  validateOnCreate?: boolean
  triggers?: CreateTriggerRequest[]
}

/**
 * Validation warning structure
 */
interface ValidationWarning {
  nodeId: string
  nodeName: string
  issues: DiagnosisIssue[]
}

/**
 * Validate cron expression format
 */
function isValidCronExpression(expression: string): boolean {
  return cron.validate(expression)
}

/**
 * Generate unique ID for nodes and edges
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Build workflow config from nodes array with optional auto-connect
 * Requirements: 10.2, 10.3
 */
function buildConfigFromNodes(nodes: NodeConfig[], autoConnect: boolean): WorkflowConfig {
  // Ensure all nodes have IDs
  const processedNodes = nodes.map((node, index) => ({
    ...node,
    id: node.id || generateId(node.type.toLowerCase()),
    position: node.position || { x: 250, y: 100 + index * 200 },
  }))

  // Generate edges if autoConnect is true
  const edges: EdgeConfig[] = []
  if (autoConnect && processedNodes.length > 1) {
    for (let i = 0; i < processedNodes.length - 1; i++) {
      edges.push({
        id: generateId('edge'),
        source: processedNodes[i].id,
        target: processedNodes[i + 1].id,
      })
    }
  }

  return {
    version: 1,
    nodes: processedNodes,
    edges,
  }
}

/**
 * Validate workflow configuration and return warnings
 * Requirements: 10.4
 */
function validateWorkflowConfig(config: WorkflowConfig): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  for (const node of config.nodes) {
    const diagnosis = nodeDiagnosisService.diagnoseNode(node, config)
    if (diagnosis.issues.length > 0) {
      warnings.push({
        nodeId: node.id,
        nodeName: node.name,
        issues: diagnosis.issues,
      })
    }
  }

  return warnings
}

/**
 * GET /api/v1/workflows
 * List workflows with pagination
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API token with 'workflows' scope
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const params: WorkflowListParams = {
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100),
      search: searchParams.get('search') || undefined,
      category: searchParams.get('category') || undefined,
    }

    // Build query conditions
    const where = {
      organizationId: token.organizationId,
      deletedAt: null,
      ...(params.search && {
        OR: [
          { name: { contains: params.search } },
          { description: { contains: params.search } },
        ],
      }),
      ...(params.category && { category: params.category }),
    }

    // Execute queries in parallel
    const [total, workflows] = await Promise.all([
      prisma.workflow.count({ where }),
      prisma.workflow.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          tags: true,
          isActive: true,
          publishStatus: true,
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
        orderBy: { updatedAt: 'desc' },
        skip: ((params.page || 1) - 1) * (params.pageSize || 20),
        take: params.pageSize || 20,
      }),
    ])

    // Update token usage
    await updateTokenUsage(token.id)

    return ApiResponse.paginated(workflows, {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      total,
    })
  } catch (error) {
    const { logError } = await import('@/lib/security/safe-logger')
    logError('V1 API list workflows error', error instanceof Error ? error : undefined)
    return ApiResponse.error(
      error instanceof Error ? error.message : '获取工作流列表失败',
      500
    )
  }
}

/**
 * POST /api/v1/workflows
 * Create a new workflow with enhanced options
 *
 * Supports:
 * - Basic creation with name and optional config
 * - Template-based creation with templateId (Requirement 10.1)
 * - Node array creation with nodes + autoConnect (Requirements 10.2, 10.3)
 * - Validation on create with validateOnCreate (Requirement 10.4)
 * - Initial triggers with triggers array (Requirement 10.5)
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API token with 'workflows' scope
    const authResult = await validateApiTokenWithScope(request, 'workflows')
    if (!authResult.success) {
      return authResult.response
    }

    const { token } = authResult

    // Parse request body
    const body = await request.json().catch(() => null)
    if (!body) {
      return ApiResponse.error('请求体不能为空', 400)
    }

    const {
      name,
      description,
      config,
      category,
      tags,
      templateId,
      nodes,
      autoConnect = false,
      validateOnCreate = false,
      triggers,
    } = body as CreateWorkflowRequest

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return ApiResponse.error('工作流名称不能为空', 400)
    }

    if (name.length > 100) {
      return ApiResponse.error('工作流名称不能超过100个字符', 400)
    }

    if (description && description.length > 500) {
      return ApiResponse.error('工作流描述不能超过500个字符', 400)
    }

    // Determine final config based on creation method
    let finalConfig: WorkflowConfig
    let templateUsed: { id: string; name: string } | null = null

    // Method 1: Create from template (Requirement 10.1)
    if (templateId) {
      const template = await prisma.workflowTemplate.findUnique({
        where: { id: templateId },
        select: {
          id: true,
          name: true,
          config: true,
          visibility: true,
          isOfficial: true,
          organizationId: true,
        },
      })

      if (!template) {
        return ApiResponse.error('模板不存在', 404)
      }

      // Check template access
      const canAccess =
        template.visibility === 'PUBLIC' ||
        template.isOfficial ||
        template.organizationId === token.organizationId

      if (!canAccess) {
        return ApiResponse.error('无权使用此模板', 403)
      }

      finalConfig = template.config as unknown as WorkflowConfig
      templateUsed = { id: template.id, name: template.name }

      // Increment template usage count
      await prisma.workflowTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      })
    }
    // Method 2: Build from nodes array (Requirements 10.2, 10.3)
    else if (nodes && Array.isArray(nodes) && nodes.length > 0) {
      // Validate nodes array
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node.type || !['INPUT', 'PROCESS', 'CODE', 'OUTPUT', 'LOGIC'].includes(node.type)) {
          return ApiResponse.error(`节点 ${i + 1} 的类型无效`, 400)
        }
        if (!node.name || typeof node.name !== 'string') {
          return ApiResponse.error(`节点 ${i + 1} 缺少名称`, 400)
        }
      }

      finalConfig = buildConfigFromNodes(nodes, autoConnect)
    }
    // Method 3: Use provided config or default
    else if (config) {
      finalConfig = config
    }
    // Default config
    else {
      finalConfig = {
        version: 1,
        nodes: [
          {
            id: 'input-1',
            type: 'INPUT',
            name: '用户输入',
            position: { x: 250, y: 100 },
            config: {
              fields: [
                {
                  id: 'field-1',
                  name: '输入',
                  value: '',
                  fieldType: 'text',
                },
              ],
            },
          },
          {
            id: 'process-1',
            type: 'PROCESS',
            name: 'AI处理',
            position: { x: 250, y: 300 },
            config: {
              systemPrompt: '',
              userPrompt: '{{用户输入.输入}}',
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'input-1',
            target: 'process-1',
          },
        ],
      }
    }

    // Validate configuration if requested (Requirement 10.4)
    let validationWarnings: ValidationWarning[] = []
    if (validateOnCreate) {
      validationWarnings = validateWorkflowConfig(finalConfig)
    }

    // Validate triggers if provided (Requirement 10.5)
    if (triggers && Array.isArray(triggers)) {
      for (let i = 0; i < triggers.length; i++) {
        const trigger = triggers[i]
        if (!trigger.name || typeof trigger.name !== 'string' || trigger.name.trim().length === 0) {
          return ApiResponse.error(`触发器 ${i + 1} 名称不能为空`, 400)
        }
        if (!trigger.type || !['WEBHOOK', 'SCHEDULE'].includes(trigger.type)) {
          return ApiResponse.error(`触发器 ${i + 1} 类型必须是 WEBHOOK 或 SCHEDULE`, 400)
        }
        if (trigger.type === 'SCHEDULE') {
          if (!trigger.cronExpression) {
            return ApiResponse.error(`触发器 ${i + 1} 定时任务必须配置 Cron 表达式`, 400, { code: 'invalid_cron' })
          }
          if (!isValidCronExpression(trigger.cronExpression)) {
            return ApiResponse.error(`触发器 ${i + 1} 的 Cron 表达式无效`, 400, { code: 'invalid_cron' })
          }
        }
        if (trigger.maxRetries !== undefined && (trigger.maxRetries < 1 || trigger.maxRetries > 10)) {
          return ApiResponse.error(`触发器 ${i + 1} 的 maxRetries 必须在 1-10 之间`, 400)
        }
      }
    }

    // Create workflow
    const workflow = await prisma.workflow.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        config: JSON.parse(JSON.stringify(finalConfig)),
        draftConfig: JSON.parse(JSON.stringify(finalConfig)),
        category: category || null,
        tags: tags || [],
        publishStatus: 'DRAFT',
        version: 1,
        organizationId: token.organizationId,
        creatorId: token.createdById,
      },
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        category: true,
        tags: true,
        isActive: true,
        publishStatus: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Create triggers if provided (Requirement 10.5)
    const createdTriggers: Array<{
      id: string
      name: string
      type: string
      enabled: boolean
      webhookUrl: string | null
      webhookSecret: string | null
      cronExpression: string | null
      timezone: string | null
    }> = []

    if (triggers && Array.isArray(triggers) && triggers.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

      for (const triggerReq of triggers) {
        let webhookPath: string | null = null
        let webhookSecret: string | null = null

        if (triggerReq.type === 'WEBHOOK') {
          webhookPath = generateWebhookPath()
          webhookSecret = generateWebhookSecret()
        }

        const trigger = await prisma.workflowTrigger.create({
          data: {
            name: triggerReq.name.trim(),
            type: triggerReq.type,
            enabled: triggerReq.enabled ?? true,
            webhookPath,
            webhookSecret,
            cronExpression: triggerReq.cronExpression || null,
            timezone: triggerReq.timezone || 'Asia/Shanghai',
            inputTemplate: triggerReq.inputTemplate
              ? JSON.parse(JSON.stringify(triggerReq.inputTemplate))
              : undefined,
            retryOnFail: triggerReq.retryOnFail ?? false,
            maxRetries: triggerReq.maxRetries ?? 3,
            workflowId: workflow.id,
            createdById: token.createdById,
          },
        })

        // Schedule job if it's an enabled schedule trigger
        if (triggerReq.type === 'SCHEDULE' && (triggerReq.enabled ?? true) && triggerReq.cronExpression) {
          try {
            scheduler.scheduleJob(
              trigger.id,
              triggerReq.cronExpression,
              workflow.id,
              token.organizationId,
              token.createdById,
              {
                inputTemplate: triggerReq.inputTemplate,
                timezone: triggerReq.timezone || 'Asia/Shanghai',
                retryOnFail: triggerReq.retryOnFail ?? false,
                maxRetries: triggerReq.maxRetries ?? 3,
              }
            )
          } catch (error) {
            const { logError } = await import('@/lib/security/safe-logger')
            logError('Failed to schedule job', error instanceof Error ? error : undefined)
          }
        }

        createdTriggers.push({
          id: trigger.id,
          name: trigger.name,
          type: trigger.type,
          enabled: trigger.enabled,
          webhookUrl: webhookPath ? `${baseUrl}/api/webhooks/${webhookPath}` : null,
          webhookSecret, // Only returned on creation
          cronExpression: trigger.cronExpression,
          timezone: trigger.timezone,
        })
      }
    }

    // Update token usage
    await updateTokenUsage(token.id)

    // Build response
    const response: Record<string, unknown> = {
      ...workflow,
    }

    // Include template info if used
    if (templateUsed) {
      response.templateUsed = templateUsed
    }

    // Include validation warnings if requested
    if (validateOnCreate && validationWarnings.length > 0) {
      response.validationWarnings = validationWarnings
    }

    // Include created triggers
    if (createdTriggers.length > 0) {
      response.triggers = createdTriggers
    }

    return ApiResponse.created(response)
  } catch (error) {
    const { logError } = await import('@/lib/security/safe-logger')
    logError('V1 API create workflow error', error instanceof Error ? error : undefined)
    return ApiResponse.error(
      error instanceof Error ? error.message : '创建工作流失败',
      500
    )
  }
}

// OPTIONS: Support CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
