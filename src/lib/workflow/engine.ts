/**
 * 工作流执行引擎
 */

import { prisma } from '@/lib/db'
import type { WorkflowConfig, NodeConfig } from '@/types/workflow'
import type {
  ExecutionContext,
  ExecutionResult,
  NodeOutput,
  ExecutionStatus,
} from './types'
import { getExecutionOrder } from './utils'
import { getProcessor, outputNodeProcessor } from './processors'

/**
 * 工作流执行引擎
 */
export class WorkflowEngine {
  private workflowId: string
  private organizationId: string
  private userId: string
  private config: WorkflowConfig

  constructor(
    workflowId: string,
    organizationId: string,
    userId: string,
    config: WorkflowConfig
  ) {
    this.workflowId = workflowId
    this.organizationId = organizationId
    this.userId = userId
    this.config = config
  }

  /**
   * 执行工作流
   */
  async execute(
    initialInput?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now()

    // 创建执行记录
    const execution = await prisma.execution.create({
      data: {
        status: 'PENDING',
        input: initialInput ? JSON.parse(JSON.stringify(initialInput)) : {},
        workflowId: this.workflowId,
        userId: this.userId,
      },
    })

    // 创建执行上下文
    const context: ExecutionContext = {
      executionId: execution.id,
      workflowId: this.workflowId,
      organizationId: this.organizationId,
      userId: this.userId,
      nodeOutputs: new Map(),
      globalVariables: this.config.globalVariables || {},
      aiConfigs: new Map(),
    }

    try {
      // 更新状态为执行中
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      // 获取执行顺序
      const executionOrder = getExecutionOrder(
        this.config.nodes,
        this.config.edges
      )

      // 应用初始输入到输入节点
      if (initialInput) {
        this.applyInitialInput(executionOrder, initialInput)
      }

      // 按顺序执行节点
      let totalTokens = 0
      let promptTokens = 0
      let completionTokens = 0
      let lastOutput: Record<string, unknown> = {}

      for (const node of executionOrder) {
        const result = await this.executeNode(node, context)

        // 保存执行日志
        await this.saveNodeLog(execution.id, node, result)

        // 如果节点执行失败，终止执行
        if (result.status === 'error') {
          throw new Error(`节点 "${node.name}" 执行失败: ${result.error}`)
        }

        // 累计 token 使用
        if (result.tokenUsage) {
          totalTokens += result.tokenUsage.totalTokens
          promptTokens += result.tokenUsage.promptTokens
          completionTokens += result.tokenUsage.completionTokens
        }

        // 保存最后一个节点的输出
        if (node.type === 'OUTPUT') {
          lastOutput = result.data
        }
      }

      const duration = Date.now() - startTime

      // 获取输出文件
      const outputFiles = outputNodeProcessor.getGeneratedFiles()

      // 更新执行记录为完成
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          output: lastOutput ? JSON.parse(JSON.stringify(lastOutput)) : undefined,
          completedAt: new Date(),
          duration,
          totalTokens,
          promptTokens,
          completionTokens,
        },
      })

      return {
        status: 'COMPLETED',
        output: lastOutput,
        duration,
        totalTokens,
        promptTokens,
        completionTokens,
        outputFiles,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : '执行失败'

      // 更新执行记录为失败
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          error: errorMessage,
          errorDetail: error instanceof Error ? { stack: error.stack } : {},
          completedAt: new Date(),
          duration,
        },
      })

      return {
        status: 'FAILED',
        error: errorMessage,
        errorDetail: error instanceof Error ? { stack: error.stack } : {},
        duration,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
      }
    }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const processor = getProcessor(node.type)

    if (!processor) {
      // 对于不支持的节点类型，返回跳过状态
      console.warn(`未找到节点处理器: ${node.type}`)
      const output: NodeOutput = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'skipped',
        data: {},
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      }
      context.nodeOutputs.set(node.id, output)
      return output
    }

    // 执行节点
    const result = await processor.process(node, context)

    // 保存到上下文
    context.nodeOutputs.set(node.id, result)

    return result
  }

  /**
   * 应用初始输入到输入节点
   */
  private applyInitialInput(
    nodes: NodeConfig[],
    input: Record<string, unknown>
  ): void {
    for (const node of nodes) {
      if (node.type === 'INPUT' && node.config?.fields) {
        const fields = node.config.fields as Array<{
          id: string
          name: string
          value: string
        }>

        for (const field of fields) {
          if (input[field.name] !== undefined) {
            field.value = String(input[field.name])
          }
        }
      }
    }
  }

  /**
   * 保存节点执行日志
   */
  private async saveNodeLog(
    executionId: string,
    node: NodeConfig,
    result: NodeOutput
  ): Promise<void> {
    // 确定节点类型（映射到数据库枚举）
    const nodeTypeMap: Record<string, 'INPUT' | 'PROCESS' | 'CODE' | 'OUTPUT'> = {
      INPUT: 'INPUT',
      PROCESS: 'PROCESS',
      CODE: 'CODE',
      OUTPUT: 'OUTPUT',
      DATA: 'INPUT',
      IMAGE: 'INPUT',
      VIDEO: 'INPUT',
      AUDIO: 'INPUT',
    }

    const dbNodeType = nodeTypeMap[node.type] || 'PROCESS'

    await prisma.executionLog.create({
      data: {
        executionId,
        nodeId: node.id,
        nodeName: node.name,
        nodeType: dbNodeType,
        input: node.config ? JSON.parse(JSON.stringify(node.config)) : {},
        output: result.data ? JSON.parse(JSON.stringify(result.data)) : undefined,
        status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
        promptTokens: result.tokenUsage?.promptTokens,
        completionTokens: result.tokenUsage?.completionTokens,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        duration: result.duration,
        error: result.error,
      },
    })
  }
}

/**
 * 创建并执行工作流
 */
export async function executeWorkflow(
  workflowId: string,
  organizationId: string,
  userId: string,
  initialInput?: Record<string, unknown>
): Promise<ExecutionResult> {
  // 获取工作流配置
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!workflow) {
    throw new Error('工作流不存在或无权访问')
  }

  const config = workflow.config as unknown as WorkflowConfig

  if (!config || !config.nodes || !config.edges) {
    throw new Error('工作流配置无效')
  }

  // 创建引擎并执行
  const engine = new WorkflowEngine(
    workflowId,
    organizationId,
    userId,
    config
  )

  return engine.execute(initialInput)
}

export type { ExecutionResult, ExecutionContext }
