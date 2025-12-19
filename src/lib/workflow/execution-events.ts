/**
 * 工作流执行事件管理器
 *
 * 使用 EventEmitter 模式管理执行进度事件
 * 支持 SSE (Server-Sent Events) 实时推送
 */

import { EventEmitter } from 'events'

// 执行进度事件类型
export interface ExecutionProgressEvent {
  executionId: string
  type: 'node_start' | 'node_complete' | 'node_error' | 'execution_complete' | 'execution_error'
  nodeId?: string
  nodeName?: string
  nodeType?: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  progress: number // 0-100
  completedNodes: string[]
  totalNodes: number
  currentNodeIndex: number
  error?: string
  output?: Record<string, unknown>
  timestamp: Date
}

// 节点状态
export interface NodeStatus {
  nodeId: string
  nodeName: string
  nodeType: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: Date
  completedAt?: Date
  duration?: number
  output?: Record<string, unknown>
  error?: string
}

// 执行状态
export interface ExecutionState {
  executionId: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  totalNodes: number
  completedNodes: string[]
  currentNodeId?: string
  nodeStatuses: Map<string, NodeStatus>
  startedAt: Date
  completedAt?: Date
  error?: string
}

class ExecutionEventManager extends EventEmitter {
  private executionStates: Map<string, ExecutionState> = new Map()

  constructor() {
    super()
    // 增加监听器上限
    this.setMaxListeners(100)
  }

  /**
   * 初始化执行状态
   */
  initExecution(
    executionId: string,
    workflowId: string,
    nodeIds: string[],
    nodeConfigs: { id: string; name: string; type: string }[]
  ): void {
    const nodeStatuses = new Map<string, NodeStatus>()

    for (const config of nodeConfigs) {
      nodeStatuses.set(config.id, {
        nodeId: config.id,
        nodeName: config.name,
        nodeType: config.type,
        status: 'pending',
      })
    }

    const state: ExecutionState = {
      executionId,
      workflowId,
      status: 'running',
      progress: 0,
      totalNodes: nodeIds.length,
      completedNodes: [],
      nodeStatuses,
      startedAt: new Date(),
    }

    this.executionStates.set(executionId, state)

    this.emit(`execution:${executionId}`, {
      executionId,
      type: 'node_start',
      progress: 0,
      completedNodes: [],
      totalNodes: nodeIds.length,
      currentNodeIndex: 0,
      timestamp: new Date(),
    } as ExecutionProgressEvent)
  }

  /**
   * 节点开始执行
   */
  nodeStart(executionId: string, nodeId: string, nodeName: string, nodeType: string): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    const nodeStatus = state.nodeStatuses.get(nodeId)
    if (nodeStatus) {
      nodeStatus.status = 'running'
      nodeStatus.startedAt = new Date()
    }

    state.currentNodeId = nodeId

    const event: ExecutionProgressEvent = {
      executionId,
      type: 'node_start',
      nodeId,
      nodeName,
      nodeType,
      status: 'running',
      progress: this.calculateProgress(state),
      completedNodes: state.completedNodes,
      totalNodes: state.totalNodes,
      currentNodeIndex: state.completedNodes.length,
      timestamp: new Date(),
    }

    this.emit(`execution:${executionId}`, event)
  }

  /**
   * 节点执行完成
   */
  nodeComplete(
    executionId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    output?: Record<string, unknown>
  ): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    const nodeStatus = state.nodeStatuses.get(nodeId)
    if (nodeStatus) {
      nodeStatus.status = 'completed'
      nodeStatus.completedAt = new Date()
      nodeStatus.duration = nodeStatus.startedAt
        ? nodeStatus.completedAt.getTime() - nodeStatus.startedAt.getTime()
        : 0
      nodeStatus.output = output
    }

    if (!state.completedNodes.includes(nodeId)) {
      state.completedNodes.push(nodeId)
    }

    state.progress = this.calculateProgress(state)

    const event: ExecutionProgressEvent = {
      executionId,
      type: 'node_complete',
      nodeId,
      nodeName,
      nodeType,
      status: 'completed',
      progress: state.progress,
      completedNodes: state.completedNodes,
      totalNodes: state.totalNodes,
      currentNodeIndex: state.completedNodes.length,
      output,
      timestamp: new Date(),
    }

    this.emit(`execution:${executionId}`, event)
  }

  /**
   * 节点执行失败
   */
  nodeError(
    executionId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    error: string
  ): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    const nodeStatus = state.nodeStatuses.get(nodeId)
    if (nodeStatus) {
      nodeStatus.status = 'failed'
      nodeStatus.completedAt = new Date()
      nodeStatus.duration = nodeStatus.startedAt
        ? nodeStatus.completedAt.getTime() - nodeStatus.startedAt.getTime()
        : 0
      nodeStatus.error = error
    }

    const event: ExecutionProgressEvent = {
      executionId,
      type: 'node_error',
      nodeId,
      nodeName,
      nodeType,
      status: 'failed',
      progress: state.progress,
      completedNodes: state.completedNodes,
      totalNodes: state.totalNodes,
      currentNodeIndex: state.completedNodes.length,
      error,
      timestamp: new Date(),
    }

    this.emit(`execution:${executionId}`, event)
  }

  /**
   * 执行完成
   */
  executionComplete(executionId: string): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    state.status = 'completed'
    state.progress = 100
    state.completedAt = new Date()

    const event: ExecutionProgressEvent = {
      executionId,
      type: 'execution_complete',
      progress: 100,
      completedNodes: state.completedNodes,
      totalNodes: state.totalNodes,
      currentNodeIndex: state.totalNodes,
      timestamp: new Date(),
    }

    this.emit(`execution:${executionId}`, event)

    // 延迟清理状态
    setTimeout(() => {
      this.executionStates.delete(executionId)
    }, 60000) // 1 分钟后清理
  }

  /**
   * 执行失败
   */
  executionError(executionId: string, error: string): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    state.status = 'failed'
    state.completedAt = new Date()
    state.error = error

    const event: ExecutionProgressEvent = {
      executionId,
      type: 'execution_error',
      progress: state.progress,
      completedNodes: state.completedNodes,
      totalNodes: state.totalNodes,
      currentNodeIndex: state.completedNodes.length,
      error,
      timestamp: new Date(),
    }

    this.emit(`execution:${executionId}`, event)

    // 延迟清理状态
    setTimeout(() => {
      this.executionStates.delete(executionId)
    }, 60000)
  }

  /**
   * 获取执行状态
   */
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.executionStates.get(executionId)
  }

  /**
   * 订阅执行进度
   */
  subscribe(
    executionId: string,
    callback: (event: ExecutionProgressEvent) => void
  ): () => void {
    const eventName = `execution:${executionId}`
    this.on(eventName, callback)

    // 返回取消订阅函数
    return () => {
      this.off(eventName, callback)
    }
  }

  /**
   * 计算进度百分比
   */
  private calculateProgress(state: ExecutionState): number {
    if (state.totalNodes === 0) return 100
    return Math.round((state.completedNodes.length / state.totalNodes) * 100)
  }
}

// 全局单例
export const executionEvents = new ExecutionEventManager()
