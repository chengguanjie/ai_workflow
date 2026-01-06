/**
 * 工作流执行引擎（简化版）
 * 只支持 INPUT 和 PROCESS 两种节点类型
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { WorkflowConfig, NodeConfig, EdgeConfig, ParallelErrorStrategy } from '@/types/workflow'
import type {
  ExecutionContext,
  ExecutionResult,
  NodeOutput,
} from './types'
import { getExecutionOrder, getParallelExecutionLayers, getPredecessorIds, isOutputValid } from './utils'
import { shouldExecuteNode, type LogicRoutingContext } from './engine/logic-routing'
import { executionEvents } from './execution-events'
import { validateNodeInput } from './validation/input-validator'
import { validateNodeOutput } from './validation/output-validator'
import {
  type CheckpointData,
  saveCheckpoint,
  loadCheckpoint,
  createWorkflowHash,
  clearCheckpoint,
} from './checkpoint'
import { createAnalyticsCollector, type AnalyticsCollector } from './analytics-collector'
import { saveNodeLog as moduleSaveNodeLog } from './engine/logger'
import { NodeDebugArtifactCollector } from './engine/debug-artifacts'
import {
  executeNode as moduleExecuteNode,
  applyInitialInput as moduleApplyInput,
} from './engine/executor'
import { WorkflowErrorHandler } from './error-handler'
import { calculateTokenCostUSD } from '@/lib/ai/cost'

/**
 * 工作流执行引擎
 */
export class WorkflowEngine {
  private workflowId: string
  private organizationId: string
  private userId: string
  private config: WorkflowConfig
  private skippedNodes: Set<string> = new Set()
  private completedNodes: Set<string> = new Set()
  private failedNodes: Set<string> = new Set()
  private enableParallelExecution: boolean = false
  private parallelErrorStrategy: ParallelErrorStrategy = 'fail_fast'
  private checkpoint: CheckpointData | null = null
  private workflowHash: string
  private lastFailedNodeId: string | null = null
  private analyticsCollector: AnalyticsCollector | null = null
  private debugCollector: NodeDebugArtifactCollector | null = null
  private pendingPersistence: Promise<unknown>[] = []

  private enqueuePersistence(promise: Promise<unknown>): void {
    // Avoid unhandled rejections; we still await via flushPersistence().
    this.pendingPersistence.push(
      promise.catch((err) => {
        console.warn('[WorkflowEngine] Persistence task failed:', err)
      })
    )
  }

  private async flushPersistence(): Promise<void> {
    const pending = this.pendingPersistence.splice(0)
    if (pending.length === 0) return
    await Promise.allSettled(pending)
  }

  private computeExecutionTotals(context: ExecutionContext): {
    totalTokens: number
    promptTokens: number
    completionTokens: number
    estimatedCost: number
  } {
    let totalTokens = 0
    let promptTokens = 0
    let completionTokens = 0
    let estimatedCost = 0

    for (const [, output] of context.nodeOutputs) {
      if (!output.tokenUsage) continue
      totalTokens += output.tokenUsage.totalTokens
      promptTokens += output.tokenUsage.promptTokens
      completionTokens += output.tokenUsage.completionTokens

      if (output.aiModel) {
        estimatedCost += calculateTokenCostUSD(
          output.aiModel,
          output.tokenUsage.promptTokens,
          output.tokenUsage.completionTokens
        )
      }
    }

    return { totalTokens, promptTokens, completionTokens, estimatedCost }
  }

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
    this.enableParallelExecution = config.settings?.enableParallelExecution ?? false
    this.parallelErrorStrategy = config.settings?.parallelErrorStrategy ?? 'fail_fast'
    this.workflowHash = createWorkflowHash(config.nodes, config.edges)
  }

  private async saveExecutionCheckpoint(
    executionId: string,
    context: ExecutionContext
  ): Promise<void> {
    const checkpointData: CheckpointData = {
      completedNodes: {},
      context: {
        nodeResults: {},
        variables: context.globalVariables,
      },
      version: 1,
      workflowHash: this.workflowHash,
    }

    for (const nodeId of this.completedNodes) {
      const output = context.nodeOutputs.get(nodeId)
      checkpointData.completedNodes[nodeId] = {
        output,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      }
      checkpointData.context.nodeResults[nodeId] = output
    }

    if (this.lastFailedNodeId) {
      checkpointData.failedNodeId = this.lastFailedNodeId
    }

    await saveCheckpoint(executionId, checkpointData)
  }

  private restoreFromCheckpoint(context: ExecutionContext): void {
    if (!this.checkpoint) return

    for (const [nodeId, nodeData] of Object.entries(this.checkpoint.completedNodes)) {
      if (nodeData.status === 'COMPLETED') {
        this.completedNodes.add(nodeId)
        context.nodeOutputs.set(nodeId, nodeData.output as NodeOutput)
      }
    }

    if (this.checkpoint.context?.variables) {
      Object.assign(context.globalVariables, this.checkpoint.context.variables)
    }
  }

  private isNodeRestoredFromCheckpoint(nodeId: string): boolean {
    return this.checkpoint?.completedNodes[nodeId]?.status === 'COMPLETED'
  }

  async execute(
    initialInput?: Record<string, unknown>,
    resumeFromExecutionId?: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now()

    if (resumeFromExecutionId) {
      const checkpoint = await loadCheckpoint(resumeFromExecutionId)
      if (checkpoint) {
        if (checkpoint.workflowHash !== this.workflowHash) {
          throw new Error('工作流已变更，无法恢复执行')
        }
        this.checkpoint = checkpoint
      }
    }

    const execution = await prisma.execution.create({
      data: {
        status: 'PENDING',
        input: initialInput ? JSON.parse(JSON.stringify(initialInput)) : {},
        workflowId: this.workflowId,
        userId: this.userId,
        organizationId: this.organizationId,
        resumedFromId: resumeFromExecutionId || null,
      } as Prisma.ExecutionUncheckedCreateInput,
    })

    // 节点调试过程持久化：以 OutputFile(JSON) 形式保存（本地 + DB 记录）
    // 可通过环境变量关闭：PERSIST_NODE_DEBUG=false
    if (process.env.PERSIST_NODE_DEBUG !== 'false') {
      this.debugCollector = new NodeDebugArtifactCollector(execution.id, this.organizationId)
    }

    const user = await prisma.user.findUnique({
      where: { id: this.userId },
      select: { departmentId: true },
    })

    this.analyticsCollector = await createAnalyticsCollector(
      this.workflowId,
      this.userId,
      execution.id,
      user?.departmentId || undefined
    )

    const context: ExecutionContext = {
      executionId: execution.id,
      workflowId: this.workflowId,
      organizationId: this.organizationId,
      userId: this.userId,
      nodeOutputs: new Map(),
      globalVariables: {
        ...this.config.globalVariables,
        triggerInput: initialInput || {},
      },
      aiConfigs: new Map(),
    }

    if (this.checkpoint) {
      this.restoreFromCheckpoint(context)
    }

    try {
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      executionEvents.initExecution(
        execution.id,
        this.workflowId,
        this.config.nodes.map(n => n.id),
        this.config.nodes.map(n => ({ id: n.id, name: n.name, type: n.type }))
      )

      this.applyInitialInput(context, initialInput)

      let result: {
        totalTokens: number
        promptTokens: number
        completionTokens: number
        lastOutput: Record<string, unknown>
        paused?: boolean
        pausedNodeId?: string
        approvalRequestId?: string
      }

      if (this.enableParallelExecution) {
        result = await this.executeParallel(context, execution.id)
      } else {
        result = await this.executeSequential(context, execution.id)
      }

      if (result.paused) {
        await this.flushPersistence()
        const duration = Date.now() - startTime
        const totals = this.computeExecutionTotals(context)

        await prisma.execution.update({
          where: { id: execution.id },
          data: {
            status: 'PAUSED',
            output: result.lastOutput as Prisma.InputJsonValue,
            duration,
            totalTokens: totals.totalTokens,
            promptTokens: totals.promptTokens,
            completionTokens: totals.completionTokens,
            estimatedCost: new Prisma.Decimal(totals.estimatedCost),
          },
        })

        return {
          status: 'PAUSED' as const,
          output: result.lastOutput,
          totalTokens: totals.totalTokens,
          promptTokens: totals.promptTokens,
          completionTokens: totals.completionTokens,
          duration,
          executionId: execution.id,
        }
      }

      const duration = Date.now() - startTime
      const totals = this.computeExecutionTotals(context)

      await this.analyticsCollector?.collectExecutionMeta(
        duration,
        totals.totalTokens,
        'COMPLETED'
      )

      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          output: result.lastOutput as Prisma.InputJsonValue,
          duration,
          totalTokens: totals.totalTokens,
          promptTokens: totals.promptTokens,
          completionTokens: totals.completionTokens,
          estimatedCost: new Prisma.Decimal(totals.estimatedCost),
        },
      })

      await this.flushPersistence()
      await clearCheckpoint(execution.id)

      executionEvents.executionComplete(execution.id)

      return {
        status: 'COMPLETED' as const,
        output: result.lastOutput,
        totalTokens: totals.totalTokens,
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
        duration,
        executionId: execution.id,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      const duration = Date.now() - startTime
      const totals = this.computeExecutionTotals(context)

      await this.saveExecutionCheckpoint(execution.id, context)

      await this.analyticsCollector?.collectExecutionMeta(
        duration,
        totals.totalTokens,
        'FAILED'
      )

      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: errorMessage,
          duration,
          totalTokens: totals.totalTokens,
          promptTokens: totals.promptTokens,
          completionTokens: totals.completionTokens,
          estimatedCost: new Prisma.Decimal(totals.estimatedCost),
        },
      })

      await this.flushPersistence()
      executionEvents.executionError(execution.id, errorMessage)

      return {
        status: 'FAILED' as const,
        error: errorMessage,
        duration,
        executionId: execution.id,
        totalTokens: totals.totalTokens,
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
      }
    }
  }

  private applyInitialInput(
    context: ExecutionContext,
    initialInput?: Record<string, unknown>
  ): void {
    if (initialInput) {
      moduleApplyInput(this.config.nodes, initialInput)
    }
  }

  private async executeNode(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    return moduleExecuteNode(node, context, this.analyticsCollector)
  }

  private async saveNodeLog(
    executionId: string,
    node: NodeConfig,
    result: NodeOutput
  ): Promise<void> {
    this.enqueuePersistence(moduleSaveNodeLog(executionId, node, result))
  }

  private async executeSequential(
    context: ExecutionContext,
    executionId: string
  ): Promise<{
    totalTokens: number
    promptTokens: number
    completionTokens: number
    lastOutput: Record<string, unknown>
    paused?: boolean
    pausedNodeId?: string
    approvalRequestId?: string
  }> {
    let totalTokens = 0
    let promptTokens = 0
    let completionTokens = 0
    let lastOutput: Record<string, unknown> = {}

    const executionOrder = getExecutionOrder(this.config.nodes, this.config.edges)

    for (const node of executionOrder) {
      if (this.skippedNodes.has(node.id)) {
        continue
      }

      if (this.isNodeRestoredFromCheckpoint(node.id)) {
        continue
      }

      const routingCtx: LogicRoutingContext = {
        nodes: this.config.nodes,
        edges: this.config.edges,
        nodeOutputs: context.nodeOutputs,
      }
      if (!shouldExecuteNode(node.id, routingCtx)) {
        this.skippedNodes.add(node.id)
        continue
      }

      // 绑定当前节点日志收集器（processors 内部会调用 context.addLog）
      if (this.debugCollector) {
        context.addLog = this.debugCollector.createNodeScopedAddLog(node)
      }

      // 执行输入验证
      const inputValidation = validateNodeInput({
        node,
        context,
        edges: this.config.edges,
        nodes: this.config.nodes,
      })

      executionEvents.nodeStart(
        executionId,
        node.id,
        node.name,
        node.type,
        inputValidation.status,
        inputValidation.error
      )

      // 如果输入验证失败，抛出错误
      if (inputValidation.status !== 'valid') {
        this.lastFailedNodeId = node.id
        executionEvents.nodeError(
          executionId,
          node.id,
          node.name,
          node.type,
          inputValidation.error || '输入验证失败',
          {
            friendlyMessage: inputValidation.error || '输入验证失败',
            suggestions: ['检查前置节点是否正常执行', '检查变量引用是否正确', '检查必填字段是否已填写'],
            isRetryable: false
          },
          'input'
        )
        throw new Error(`节点 "${node.name}" 输入验证失败: ${inputValidation.error}`)
      }

      const result = await this.executeNode(node, context)
      await this.saveNodeLog(executionId, node, result)
      if (this.debugCollector) {
        this.enqueuePersistence(this.debugCollector.persistNodeDebugFile(node, result))
      }

      if (result.status === 'error') {
        this.lastFailedNodeId = node.id
        const analysis = WorkflowErrorHandler.analyzeError(result.error, node.type)
        executionEvents.nodeError(
          executionId,
          node.id,
          node.name,
          node.type,
          result.error || '未知错误',
          {
            friendlyMessage: analysis.friendlyMessage,
            suggestions: analysis.suggestions,
            code: analysis.code,
            isRetryable: analysis.isRetryable
          },
          'output'
        )
        throw new Error(`节点 "${node.name}" 执行失败: ${result.error}`)
      }

      if (result.status === 'paused' && result.approvalRequestId) {
        // PAUSED 也保留调试过程文件
        executionEvents.executionPaused(executionId, node.id, result.approvalRequestId)
        return {
          totalTokens,
          promptTokens,
          completionTokens,
          lastOutput: {
            _paused: true,
            _pausedNodeId: node.id,
            _approvalRequestId: result.approvalRequestId,
            ...result.data,
          },
          paused: true,
          pausedNodeId: node.id,
          approvalRequestId: result.approvalRequestId,
        }
      }

      if (result.tokenUsage) {
        totalTokens += result.tokenUsage.totalTokens
        promptTokens += result.tokenUsage.promptTokens
        completionTokens += result.tokenUsage.completionTokens
      }

      if (node.type === 'PROCESS') {
        lastOutput = result.data || {}
      }

      // 执行输出验证
      const outputValidation = validateNodeOutput({
        nodeConfig: node,
        output: result.data || {},
      })

      executionEvents.nodeComplete(
        executionId,
        node.id,
        node.name,
        node.type,
        result.data,
        outputValidation.status,
        outputValidation.error
      )
      this.completedNodes.add(node.id)
    }

    return { totalTokens, promptTokens, completionTokens, lastOutput }
  }

  private async executeParallel(
    context: ExecutionContext,
    executionId: string
  ): Promise<{
    totalTokens: number
    promptTokens: number
    completionTokens: number
    lastOutput: Record<string, unknown>
  }> {
    let totalTokens = 0
    let promptTokens = 0
    let completionTokens = 0
    let lastOutput: Record<string, unknown> = {}
    const collectedErrors: Array<{ nodeId: string; nodeName: string; error: string }> = []

    const layers = getParallelExecutionLayers(this.config.nodes, this.config.edges)

    for (const layer of layers) {
      const nodesToExecute = layer.nodes.filter((node: NodeConfig) =>
        !this.skippedNodes.has(node.id) && !this.failedNodes.has(node.id)
      )

      if (nodesToExecute.length === 0) {
        continue
      }

      const settledResults = await Promise.allSettled(
        nodesToExecute.map(async (node: NodeConfig) => {
          if (this.parallelErrorStrategy !== 'fail_fast') {
            const predecessorIds = getPredecessorIds(node.id, this.config.edges)
            const hasFailedPredecessor = predecessorIds.some(id => this.failedNodes.has(id))
            if (hasFailedPredecessor) {
              this.skippedNodes.add(node.id)
              return { node, result: null, skipped: true }
            }
          }

          // 执行输入验证
          const inputValidation = validateNodeInput({
            node,
            context,
            edges: this.config.edges,
            nodes: this.config.nodes,
          })

          executionEvents.nodeStart(
            executionId,
            node.id,
            node.name,
            node.type,
            inputValidation.status,
            inputValidation.error
          )

          // 如果输入验证失败，返回错误结果
          if (inputValidation.status !== 'valid') {
            return {
              node,
              result: {
                status: 'error' as const,
                data: {},
                error: inputValidation.error || '输入验证失败',
              },
              skipped: false,
              inputValidationFailed: true,
            }
          }

          // 并行执行时为每个节点使用独立的 addLog，避免日志串扰
          const nodeContext: ExecutionContext = this.debugCollector
            ? { ...context, addLog: this.debugCollector.createNodeScopedAddLog(node) }
            : context

          const result = await this.executeNode(node, nodeContext)
          await this.saveNodeLog(executionId, node, result)
          if (this.debugCollector) {
            this.enqueuePersistence(this.debugCollector.persistNodeDebugFile(node, result))
          }
          return { node, result, skipped: false }
        })
      )

      for (const settledResult of settledResults) {
        if (settledResult.status === 'rejected') {
          const error = settledResult.reason instanceof Error
            ? settledResult.reason.message
            : String(settledResult.reason)

          if (this.parallelErrorStrategy === 'fail_fast') {
            throw new Error(`并行执行失败: ${error}`)
          }
          collectedErrors.push({ nodeId: 'unknown', nodeName: 'unknown', error })
          continue
        }

        const { node, result, skipped } = settledResult.value as { 
          node: NodeConfig
          result: NodeOutput | null
          skipped: boolean
          inputValidationFailed?: boolean 
        }

        if (skipped || !result) continue

        // 处理输入验证失败的情况
        const inputValidationFailed = (settledResult.value as { inputValidationFailed?: boolean }).inputValidationFailed

        if (result.status === 'error') {
          this.failedNodes.add(node.id)
          
          // 根据是输入验证失败还是执行失败，使用不同的错误阶段
          const errorPhase = inputValidationFailed ? 'input' : 'output'
          executionEvents.nodeError(
            executionId,
            node.id,
            node.name,
            node.type,
            result.error || '未知错误',
            inputValidationFailed ? {
              friendlyMessage: result.error || '输入验证失败',
              suggestions: ['检查前置节点是否正常执行', '检查变量引用是否正确', '检查必填字段是否已填写'],
              isRetryable: false
            } : undefined,
            errorPhase
          )

          switch (this.parallelErrorStrategy) {
            case 'fail_fast':
              throw new Error(`节点 "${node.name}" 执行失败: ${result.error}`)
            case 'continue':
            case 'collect':
              collectedErrors.push({
                nodeId: node.id,
                nodeName: node.name,
                error: result.error || '未知错误',
              })
              this.markDependentNodesForSkipping(node.id)
              continue
          }
        }

        if (result.tokenUsage) {
          totalTokens += result.tokenUsage.totalTokens
          promptTokens += result.tokenUsage.promptTokens
          completionTokens += result.tokenUsage.completionTokens
        }

        if (node.type === 'PROCESS') {
          lastOutput = result.data || {}
        }

        // 执行输出验证
        const outputValidation = validateNodeOutput({
          nodeConfig: node,
          output: result.data || {},
        })

        executionEvents.nodeComplete(
          executionId,
          node.id,
          node.name,
          node.type,
          result.data,
          outputValidation.status,
          outputValidation.error
        )
        this.completedNodes.add(node.id)
      }
    }

    if (this.parallelErrorStrategy === 'collect' && collectedErrors.length > 0) {
      lastOutput._parallelErrors = collectedErrors
    }

    return { totalTokens, promptTokens, completionTokens, lastOutput }
  }

  private markDependentNodesForSkipping(failedNodeId: string): void {
    const queue = [failedNodeId]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      const successors = this.config.edges
        .filter(e => e.source === nodeId)
        .map(e => e.target)

      for (const successorId of successors) {
        if (!this.completedNodes.has(successorId) && !this.failedNodes.has(successorId)) {
          this.skippedNodes.add(successorId)
          queue.push(successorId)
        }
      }
    }
  }
}

export type ExecutionMode = 'production' | 'draft'

export async function executeWorkflow(
  workflowId: string,
  organizationId: string,
  userId: string,
  initialInput?: Record<string, unknown>,
  options?: {
    resumeFromExecutionId?: string
    mode?: ExecutionMode
  }
): Promise<ExecutionResult> {
  const mode = options?.mode ?? 'production'

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      config: true,
      draftConfig: true,
      publishedConfig: true,
      publishStatus: true,
    },
  })

  if (!workflow) {
    throw new Error('工作流不存在或无权访问')
  }

  let config: WorkflowConfig

  if (mode === 'production') {
    const rawConfig = workflow.publishedConfig || workflow.config
    config = rawConfig as unknown as WorkflowConfig
  } else {
    const rawConfig = workflow.draftConfig || workflow.config
    config = rawConfig as unknown as WorkflowConfig
  }

  if (!config || !config.nodes || !config.edges) {
    throw new Error('工作流配置无效')
  }

  const engine = new WorkflowEngine(
    workflowId,
    organizationId,
    userId,
    config
  )

  return engine.execute(initialInput, options?.resumeFromExecutionId)
}

export type { ExecutionResult, ExecutionContext }
