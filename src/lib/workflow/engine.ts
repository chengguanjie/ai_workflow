/**
 * 工作流执行引擎
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { WorkflowConfig, NodeConfig, EdgeConfig, LoopNodeConfig, MergeNodeConfig, ParallelErrorStrategy } from '@/types/workflow'
import type {
  ExecutionContext,
  ExecutionResult,
  NodeOutput,
} from './types'
import { getExecutionOrder, isConditionNode, getLoopBodyNodes, isLoopNode, getParallelExecutionLayers, getPredecessorIds } from './utils'
import { outputNodeProcessor } from './processors'
import {
  type LoopState,
  initializeForLoop,
  initializeWhileLoop,
  advanceForLoop,
  advanceWhileLoop,
  getLoopContextVariables,
  shouldLoopContinue,
} from './processors/loop'
import { executionEvents } from './execution-events'
import {
  type CheckpointData,
  saveCheckpoint,
  loadCheckpoint,
  createWorkflowHash,
  clearCheckpoint,
} from './checkpoint'
import { createAnalyticsCollector, type AnalyticsCollector } from './analytics-collector'
import { ExecutionHooks } from './execution-hooks'

// 导入模块化的引擎组件
import {
  handleConditionBranching as moduleBranchingHandler,
  markDependentNodesForSkipping as moduleMarkDependentNodes,
} from './engine/branching'
import { saveNodeLog as moduleSaveNodeLog } from './engine/logger'
import {
  executeNode as moduleExecuteNode,
  applyInitialInput as moduleApplyInput,
} from './engine/executor'
import { WorkflowErrorHandler } from './error-handler'

/**
 * 检查节点是否为 MERGE 节点
 */
function isMergeNode(node: NodeConfig): node is MergeNodeConfig {
  return node.type === 'MERGE'
}

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
  private loopStates: Map<string, LoopState> = new Map()
  private loopBodyNodes: Map<string, string[]> = new Map()
  private loopIterationResults: Map<string, Record<string, unknown>[]> = new Map()
  private enableParallelExecution: boolean = false
  private parallelErrorStrategy: ParallelErrorStrategy = 'fail_fast'

  // 断点续执行支持
  private checkpoint: CheckpointData | null = null
  private workflowHash: string
  private lastFailedNodeId: string | null = null

  // 分析数据收集器
  private analyticsCollector: AnalyticsCollector | null = null

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

  /**
   * 保存检查点
   */
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

    // 保存已完成节点的输出
    for (const nodeId of this.completedNodes) {
      const output = context.nodeOutputs.get(nodeId)
      checkpointData.completedNodes[nodeId] = {
        output,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      }
      checkpointData.context.nodeResults[nodeId] = output
    }

    // 如果有失败的节点，记录它
    if (this.lastFailedNodeId) {
      checkpointData.failedNodeId = this.lastFailedNodeId
    }

    await saveCheckpoint(executionId, checkpointData)
  }

  /**
   * 从检查点恢复状态
   */
  private restoreFromCheckpoint(
    context: ExecutionContext
  ): void {
    if (!this.checkpoint) return

    // 恢复已完成节点
    for (const [nodeId, nodeData] of Object.entries(this.checkpoint.completedNodes)) {
      if (nodeData.status === 'COMPLETED') {
        this.completedNodes.add(nodeId)
        context.nodeOutputs.set(nodeId, nodeData.output as NodeOutput)
      }
    }

    // 恢复变量
    if (this.checkpoint.context?.variables) {
      Object.assign(context.globalVariables, this.checkpoint.context.variables)
    }

    console.log(`[Engine] Restored ${this.completedNodes.size} completed nodes from checkpoint`)
  }

  /**
   * 检查节点是否已从检查点恢复
   */
  private isNodeRestoredFromCheckpoint(nodeId: string): boolean {
    return this.checkpoint?.completedNodes[nodeId]?.status === 'COMPLETED'
  }

  /**
   * 执行工作流
   * @param initialInput - 初始输入参数
   * @param resumeFromExecutionId - 从指定执行恢复（可选）
   */
  async execute(
    initialInput?: Record<string, unknown>,
    resumeFromExecutionId?: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now()

    // 如果是恢复执行，加载检查点
    if (resumeFromExecutionId) {
      const checkpoint = await loadCheckpoint(resumeFromExecutionId)
      if (checkpoint) {
        if (checkpoint.workflowHash !== this.workflowHash) {
          throw new Error('工作流已变更，无法恢复执行')
        }
        this.checkpoint = checkpoint
        console.log(`[Engine] Resuming from execution ${resumeFromExecutionId}`)
      }
    }

    // 创建执行记录
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

    // 获取用户部门信息（用于分析数据）
    const user = await prisma.user.findUnique({
      where: { id: this.userId },
      select: { departmentId: true },
    })

    // 初始化分析数据收集器
    this.analyticsCollector = await createAnalyticsCollector(
      this.workflowId,
      this.userId,
      execution.id,
      user?.departmentId || undefined
    )

    // 创建执行上下文
    const context: ExecutionContext = {
      executionId: execution.id,
      workflowId: this.workflowId,
      organizationId: this.organizationId,
      userId: this.userId,
      nodeOutputs: new Map(),
      globalVariables: {
        ...this.config.globalVariables,
        // 将初始输入存储为 triggerInput，供触发器节点处理器使用
        triggerInput: initialInput || {},
      },
      aiConfigs: new Map(),
    }

    // 如果有检查点，恢复状态
    if (this.checkpoint) {
      this.restoreFromCheckpoint(context)
    }

    // Handle resume from approval - inject approval result into context
    if (initialInput?._resumeFromApproval) {
      const resumeData = initialInput._resumeFromApproval as {
        approvalRequestId: string
        approvalNodeId: string
        checkpoint: {
          completedNodes: Record<string, { output: NodeOutput }>
          context: { nodeResults: Record<string, unknown> }
          approvalResult: Record<string, unknown>
        }
      }

      // Find the approval node name
      const approvalNode = this.config.nodes.find(n => n.id === resumeData.approvalNodeId)
      const approvalNodeName = approvalNode?.name || 'approval'

      // Create the approval output
      const approvalOutput: NodeOutput = {
        nodeId: resumeData.approvalNodeId,
        nodeName: approvalNodeName,
        nodeType: 'APPROVAL',
        status: 'success',
        data: resumeData.checkpoint.approvalResult,
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      }

      // Inject approval result into node outputs
      context.nodeOutputs.set(resumeData.approvalNodeId, approvalOutput)

      // Also set by node name for variable replacement
      context.nodeOutputs.set(approvalNodeName, approvalOutput)

      // Mark the approval node as completed
      this.completedNodes.add(resumeData.approvalNodeId)

      // Mark all nodes before the approval node as completed (they were already executed)
      const executionOrder = getExecutionOrder(this.config.nodes, this.config.edges)
      for (const node of executionOrder) {
        if (node.id === resumeData.approvalNodeId) {
          break // Stop when we reach the approval node
        }
        this.completedNodes.add(node.id)
        // Create a placeholder output for skipped nodes if not already present
        if (!context.nodeOutputs.has(node.id)) {
          context.nodeOutputs.set(node.id, {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            status: 'success',
            data: {},
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 0,
          })
        }
      }

      console.log(`[Engine] Resuming from approval node: ${approvalNodeName} (${resumeData.approvalNodeId})`)
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

      // 初始化执行事件（用于 SSE 实时推送）
      const nodeConfigs = this.config.nodes.map((n: NodeConfig) => ({
        id: n.id,
        name: n.name,
        type: n.type,
      }))
      executionEvents.initExecution(
        execution.id,
        this.workflowId,
        this.config.nodes.map((n: NodeConfig) => n.id),
        nodeConfigs
      )

      // 应用初始输入到输入节点
      if (initialInput) {
        this.applyInitialInput(executionOrder, initialInput)
      }

      // 执行节点
      let totalTokens = 0
      let promptTokens = 0
      let completionTokens = 0
      let lastOutput: Record<string, unknown> = {}

      if (this.enableParallelExecution) {
        // 并行执行模式：按层级并行执行
        const result = await this.executeParallel(context, execution.id)
        totalTokens = result.totalTokens
        promptTokens = result.promptTokens
        completionTokens = result.completionTokens
        lastOutput = result.lastOutput
      } else {
        // 串行执行模式：按拓扑顺序依次执行
        const result = await this.executeSequential(executionOrder, context, execution.id)
        totalTokens = result.totalTokens
        promptTokens = result.promptTokens
        completionTokens = result.completionTokens
        lastOutput = result.lastOutput
      }

      const duration = Date.now() - startTime

      // 获取输出文件
      const outputFiles = outputNodeProcessor.getGeneratedFiles()

      // 清除检查点（执行成功）
      await clearCheckpoint(execution.id)

      // 收集执行元数据用于分析
      if (this.analyticsCollector) {
        await this.analyticsCollector.collectExecutionMeta(
          duration,
          totalTokens,
          'COMPLETED'
        )
      }

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
          canResume: false,
        },
      })

      // 发送执行完成事件
      executionEvents.executionComplete(execution.id)

      // 触发执行完成钩子
      const hookContext = {
        execution: await prisma.execution.findUnique({ where: { id: execution.id } }),
        workflowId: this.workflowId,
        userId: this.userId,
        departmentId: user?.departmentId
      }
      if (hookContext.execution) {
        await ExecutionHooks.onExecutionComplete(hookContext)
      }

      return {
        executionId: execution.id,
        status: 'COMPLETED',
        output: lastOutput,
        duration,
        totalTokens,
        promptTokens,
        completionTokens,
        outputFiles,
      }
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : '执行失败'

      // 分析错误
      const analysis = WorkflowErrorHandler.analyzeError(error as Error)

      // 保存检查点（用于断点续执行）
      try {
        await this.saveExecutionCheckpoint(execution.id, context)
      } catch (checkpointError) {
        console.error('[Engine] Failed to save checkpoint:', checkpointError)
      }

      // 收集执行元数据用于分析
      if (this.analyticsCollector) {
        await this.analyticsCollector.collectExecutionMeta(
          duration,
          0, // Failed executions have 0 total tokens
          'FAILED'
        )
      }

      // 更新执行记录为失败
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          error: errorMessage,
          errorDetail: {
            stack: error instanceof Error ? error.stack : undefined,
            analysis: analysis as unknown as Prisma.InputJsonValue, // 保存完整的分析结果
          },
          completedAt: new Date(),
          duration,
          canResume: this.completedNodes.size > 0, // 如果有已完成的节点，可以恢复
        },
      })

      // 发送执行失败事件
      executionEvents.executionError(
        execution.id,
        errorMessage,
        {
          friendlyMessage: analysis.friendlyMessage,
          suggestions: analysis.suggestions,
          code: analysis.code,
          isRetryable: analysis.isRetryable
        }
      )

      // 触发执行完成钩子（失败也要触发）
      const hookContext = {
        execution: await prisma.execution.findUnique({ where: { id: execution.id } }),
        workflowId: this.workflowId,
        userId: this.userId,
        departmentId: user?.departmentId
      }
      if (hookContext.execution) {
        await ExecutionHooks.onExecutionComplete(hookContext)
      }

      return {
        executionId: execution.id,
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
   * 处理条件分支
   * 根据条件节点的执行结果，标记需要跳过的分支节点
   */
  private handleConditionBranching(
    conditionNode: NodeConfig,
    result: NodeOutput
  ): void {
    // 使用模块化的分支处理函数
    moduleBranchingHandler(conditionNode, result, this.config.edges, this.skippedNodes)
  }

  /**
   * 处理循环节点
   * 执行循环体直到循环条件不满足
   */
  private async executeLoopNode(
    loopNode: LoopNodeConfig,
    context: ExecutionContext,
    executionId: string
  ): Promise<{ totalTokens: number; promptTokens: number; completionTokens: number }> {
    const bodyNodeIds = getLoopBodyNodes(loopNode.id, this.config.edges, this.config.nodes)
    const bodyNodes = this.config.nodes.filter((n: NodeConfig) => bodyNodeIds.includes(n.id))
    const bodyExecutionOrder = getExecutionOrder(bodyNodes, this.config.edges.filter(
      (e: EdgeConfig) => bodyNodeIds.includes(e.source) && bodyNodeIds.includes(e.target)
    ))

    let state: LoopState
    const { loopType, whileConfig } = loopNode.config

    if (loopType === 'FOR') {
      state = initializeForLoop(loopNode, context)
    } else {
      state = initializeWhileLoop(loopNode, context)
    }

    this.loopStates.set(loopNode.id, state)
    this.loopIterationResults.set(loopNode.id, [])

    let totalTokens = 0
    let promptTokens = 0
    let completionTokens = 0

    while (shouldLoopContinue(state)) {
      const loopVars = getLoopContextVariables(state)
      context.nodeOutputs.set('loop', {
        nodeId: 'loop',
        nodeName: 'loop',
        nodeType: 'LOOP',
        status: 'success',
        data: loopVars,
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const iterationOutputs: Record<string, unknown> = {}

      for (const bodyNode of bodyExecutionOrder) {
        // 发送循环体节点开始事件
        executionEvents.nodeStart(executionId, bodyNode.id, bodyNode.name, bodyNode.type)

        const result = await this.executeNode(bodyNode, context)
        await this.saveNodeLog(executionId, bodyNode, result)

        if (result.status === 'error' && !loopNode.config.continueOnError) {
          // 发送节点错误事件
          executionEvents.nodeError(executionId, bodyNode.id, bodyNode.name, bodyNode.type, result.error || '未知错误')
          throw new Error(`循环体节点 "${bodyNode.name}" 执行失败: ${result.error}`)
        }

        if (result.tokenUsage) {
          totalTokens += result.tokenUsage.totalTokens
          promptTokens += result.tokenUsage.promptTokens
          completionTokens += result.tokenUsage.completionTokens
        }

        iterationOutputs[bodyNode.name] = result.data

        // 发送循环体节点完成事件
        executionEvents.nodeComplete(executionId, bodyNode.id, bodyNode.name, bodyNode.type, result.data)
      }

      this.loopIterationResults.get(loopNode.id)!.push({
        iteration: state.iterationsCompleted + 1,
        outputs: iterationOutputs,
        success: true,
      })

      if (loopType === 'FOR') {
        state = advanceForLoop(state)
      } else {
        if (!whileConfig) {
          throw new Error('WHILE 循环缺少 whileConfig 配置')
        }
        state = advanceWhileLoop(state, whileConfig.condition, context)
      }

      this.loopStates.set(loopNode.id, state)
    }

    const iterationResults = this.loopIterationResults.get(loopNode.id) || []
    context.nodeOutputs.set(loopNode.id, {
      nodeId: loopNode.id,
      nodeName: loopNode.name,
      nodeType: 'LOOP',
      status: 'success',
      data: {
        iterations: iterationResults.length,
        results: iterationResults,
        allSucceeded: iterationResults.every(r => r.success !== false),
      },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    for (const bodyNodeId of bodyNodeIds) {
      this.skippedNodes.add(bodyNodeId)
    }

    return { totalTokens, promptTokens, completionTokens }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    // 使用模块化执行器
    return moduleExecuteNode(node, context, this.analyticsCollector)
  }

  /**
   * 应用初始输入到输入节点
   */
  private applyInitialInput(
    nodes: NodeConfig[],
    input: Record<string, unknown>
  ): void {
    // 使用模块化函数
    moduleApplyInput(nodes, input)
  }

  /**
   * 保存节点执行日志
   * @deprecated 使用模块化的 saveNodeLog 函数
   */
  private async saveNodeLog(
    executionId: string,
    node: NodeConfig,
    result: NodeOutput
  ): Promise<void> {
    // 委托给模块化函数
    await moduleSaveNodeLog(executionId, node, result)
  }

  /**
   * 串行执行模式
   * 按拓扑顺序依次执行每个节点
   */
  private async executeSequential(
    nodes: NodeConfig[],
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

    for (const node of nodes) {
      if (this.skippedNodes.has(node.id)) {
        continue
      }

      // 检查是否已从检查点恢复（跳过已完成的节点）
      if (this.isNodeRestoredFromCheckpoint(node.id)) {
        console.log(`[Engine] Skipping restored node: ${node.name}`)
        // 发送节点完成事件（显示为已恢复）
        executionEvents.nodeComplete(executionId, node.id, node.name, node.type,
          context.nodeOutputs.get(node.id))
        continue
      }

      // 检查是否已完成（例如从审批恢复时的节点）
      if (this.completedNodes.has(node.id)) {
        console.log(`[Engine] Skipping already completed node: ${node.name}`)
        // 发送节点完成事件
        executionEvents.nodeComplete(executionId, node.id, node.name, node.type,
          context.nodeOutputs.get(node.id))
        continue
      }

      // 发送节点开始事件
      executionEvents.nodeStart(executionId, node.id, node.name, node.type)

      if (isLoopNode(node)) {
        const loopResult = await this.executeLoopNode(
          node as LoopNodeConfig,
          context,
          executionId
        )
        totalTokens += loopResult.totalTokens
        promptTokens += loopResult.promptTokens
        completionTokens += loopResult.completionTokens
        // 发送循环节点完成事件
        executionEvents.nodeComplete(executionId, node.id, node.name, node.type)
        this.completedNodes.add(node.id)
        continue
      }

      const result = await this.executeNode(node, context)
      await this.saveNodeLog(executionId, node, result)

      if (result.status === 'error') {
        // 记录失败节点用于检查点
        this.lastFailedNodeId = node.id

        // 分析错误
        const analysis = WorkflowErrorHandler.analyzeError(result.error, node.type)

        // 发送节点错误事件（包含详细分析）
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
          }
        )
        throw new Error(`节点 "${node.name}" 执行失败: ${result.error}`)
      }

      // Handle APPROVAL node pause - workflow needs to wait for human approval
      if (result.status === 'paused' && result.approvalRequestId) {
        // 发送执行暂停事件
        executionEvents.executionPaused(executionId, node.id, result.approvalRequestId)
        // Return partial result - the workflow is paused
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

      if (isConditionNode(node)) {
        this.handleConditionBranching(node, result)
      }

      if (node.type === 'OUTPUT') {
        lastOutput = result.data || {}
      }

      // 发送节点完成事件
      executionEvents.nodeComplete(executionId, node.id, node.name, node.type, result.data)
      this.completedNodes.add(node.id)
    }

    return { totalTokens, promptTokens, completionTokens, lastOutput }
  }

  /**
   * 并行执行模式
   * 按层级并行执行节点，同一层的节点可以同时执行
   * 支持三种错误处理策略：fail_fast、continue、collect
   */
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
      // 过滤掉已跳过和已失败（在 continue 模式下）的节点
      const nodesToExecute = layer.nodes.filter((node: NodeConfig) =>
        !this.skippedNodes.has(node.id) && !this.failedNodes.has(node.id)
      )

      if (nodesToExecute.length === 0) {
        continue
      }

      // 使用 Promise.allSettled 以便在 continue/collect 模式下继续执行
      const settledResults = await Promise.allSettled(
        nodesToExecute.map(async node => {
          // 检查前置节点是否有失败的（在 continue 模式下）
          if (this.parallelErrorStrategy !== 'fail_fast') {
            const predecessorIds = getPredecessorIds(node.id, this.config.edges)
            const hasFailedPredecessor = predecessorIds.some(id => this.failedNodes.has(id))
            if (hasFailedPredecessor && !isMergeNode(node)) {
              // 跳过依赖于失败节点的节点（除非是 MERGE 节点）
              this.skippedNodes.add(node.id)
              return { node, result: null, loopResult: null, skipped: true }
            }
          }

          // 发送节点开始事件
          executionEvents.nodeStart(executionId, node.id, node.name, node.type)

          if (isLoopNode(node)) {
            const loopResult = await this.executeLoopNode(
              node as LoopNodeConfig,
              context,
              executionId
            )
            return { node, loopResult, result: null, skipped: false }
          }

          const result = await this.executeNode(node, context)
          await this.saveNodeLog(executionId, node, result)
          return { node, result, loopResult: null, skipped: false }
        })
      )

      // 处理执行结果
      for (const settledResult of settledResults) {
        if (settledResult.status === 'rejected') {
          // Promise 被拒绝（未预期的错误）
          const error = settledResult.reason instanceof Error
            ? settledResult.reason.message
            : String(settledResult.reason)

          if (this.parallelErrorStrategy === 'fail_fast') {
            throw new Error(`并行执行失败: ${error}`)
          }
          collectedErrors.push({ nodeId: 'unknown', nodeName: 'unknown', error })
          continue
        }

        const { node, result, loopResult, skipped } = settledResult.value

        if (skipped) {
          continue
        }

        if (loopResult) {
          totalTokens += loopResult.totalTokens
          promptTokens += loopResult.promptTokens
          completionTokens += loopResult.completionTokens
          // 发送循环节点完成事件
          executionEvents.nodeComplete(executionId, node.id, node.name, node.type)
          this.completedNodes.add(node.id)
          continue
        }

        if (!result) continue

        if (result.status === 'error') {
          this.failedNodes.add(node.id)
          // 发送节点错误事件
          executionEvents.nodeError(executionId, node.id, node.name, node.type, result.error || '未知错误')

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
              // 标记依赖此节点的下游节点为跳过
              this.markDependentNodesForSkipping(node.id)
              continue
          }
        }

        if (result.tokenUsage) {
          totalTokens += result.tokenUsage.totalTokens
          promptTokens += result.tokenUsage.promptTokens
          completionTokens += result.tokenUsage.completionTokens
        }

        if (isConditionNode(node)) {
          this.handleConditionBranching(node, result)
        }

        if (node.type === 'OUTPUT') {
          lastOutput = result.data || {}
        }

        // 发送节点完成事件
        executionEvents.nodeComplete(executionId, node.id, node.name, node.type, result.data)
        this.completedNodes.add(node.id)
      }
    }

    // 在 collect 模式下，如果有错误，将错误信息添加到输出
    if (this.parallelErrorStrategy === 'collect' && collectedErrors.length > 0) {
      lastOutput._parallelErrors = collectedErrors
    }

    return { totalTokens, promptTokens, completionTokens, lastOutput }
  }

  /**
   * 标记依赖于失败节点的下游节点为跳过
   */
  private markDependentNodesForSkipping(failedNodeId: string): void {
    // 使用模块化函数
    moduleMarkDependentNodes(
      failedNodeId,
      this.config.nodes,
      this.config.edges,
      this.failedNodes,
      this.skippedNodes,
      isMergeNode,
      getPredecessorIds
    )
  }
}

/**
 * 创建并执行工作流
 */
/**
 * Execution mode for Draft/Published mechanism
 * - 'production': Uses publishedConfig (for production runs, webhooks, scheduled triggers)
 * - 'draft': Uses draftConfig (for testing in editor)
 */
export type ExecutionMode = 'production' | 'draft'

export async function executeWorkflow(
  workflowId: string,
  organizationId: string,
  userId: string,
  initialInput?: Record<string, unknown>,
  options?: {
    resumeFromExecutionId?: string
    /** Execution mode: 'production' uses publishedConfig, 'draft' uses draftConfig */
    mode?: ExecutionMode
  }
): Promise<ExecutionResult> {
  const mode = options?.mode ?? 'production'

  // 获取工作流配置
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

  // Select config based on execution mode (Draft/Published mechanism)
  let config: WorkflowConfig

  if (mode === 'production') {
    // Production mode: prefer publishedConfig, fallback to config
    const rawConfig = workflow.publishedConfig || workflow.config
    config = rawConfig as unknown as WorkflowConfig
  } else {
    // Draft mode: prefer draftConfig, fallback to config
    const rawConfig = workflow.draftConfig || workflow.config
    config = rawConfig as unknown as WorkflowConfig
  }

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

  return engine.execute(initialInput, options?.resumeFromExecutionId)
}

export type { ExecutionResult, ExecutionContext }
