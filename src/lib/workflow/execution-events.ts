/**
 * 工作流执行事件管理器
 *
 * 使用 EventEmitter 模式管理执行进度事件
 * 支持 SSE (Server-Sent Events) 实时推送
 */

import { EventEmitter } from 'events'
import { getRedisConnection, type Redis } from '@/lib/redis'
import { type Prisma } from '@prisma/client' // Assuming Prisma is used and needs to be imported for InputJsonValue

// 执行进度事件类型
export interface ExecutionProgressEvent {
  executionId: string
  type: 'node_start' | 'node_complete' | 'node_error' | 'execution_complete' | 'execution_error' | 'execution_paused'
  nodeId?: string
  nodeName?: string
  nodeType?: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused'
  progress: number // 0-100
  completedNodes: string[]
  totalNodes: number
  currentNodeIndex: number
  error?: string
  output?: Record<string, unknown>
  timestamp: Date
  /** Approval request ID when execution is paused for approval */
  approvalRequestId?: string
  /** 详细的错误信息（包含友好提示和建议） */
  errorDetail?: {
    friendlyMessage: string
    suggestions: string[]
    code?: string
    isRetryable?: boolean
    stack?: string
    analysis?: Prisma.InputJsonValue // Added Prisma.InputJsonValue here
  }
  /** 输入状态 */
  inputStatus?: 'pending' | 'valid' | 'invalid' | 'missing'
  /** 输出状态 - 扩展支持 'invalid' 和 'incomplete' */
  outputStatus?: 'pending' | 'valid' | 'error' | 'empty' | 'invalid' | 'incomplete'
  /** 输入错误信息 */
  inputError?: string
  /** 输出错误信息 */
  outputError?: string
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
  inputStatus?: 'pending' | 'valid' | 'invalid' | 'missing'
  outputStatus?: 'pending' | 'valid' | 'error' | 'empty' | 'invalid' | 'incomplete'
  inputError?: string
  outputError?: string
  triggered?: boolean
}

// 执行状态
export interface ExecutionState {
  executionId: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  progress: number
  totalNodes: number
  completedNodes: string[]
  currentNodeId?: string
  nodeStatuses: Map<string, NodeStatus>
  startedAt: Date
  completedAt?: Date
  error?: string
  /** Approval request ID when execution is paused */
  approvalRequestId?: string
}

class ExecutionEventManager extends EventEmitter {
  private executionStates: Map<string, ExecutionState> = new Map()

  constructor() {
    super()
    // 增加监听器上限
    this.setMaxListeners(100)
  }

  /**
   * 广播事件到本地监听器和 Redis
   */
  private async broadcast(executionId: string, event: ExecutionProgressEvent) {
    // 1. 本地广播
    this.emit(`execution:${executionId}`, event)

    // 2. Redis 广播 (Fire and forget to avoid blocking)
    try {
      const redis = getRedisConnection()
      if (redis) {
        await redis.publish(`execution:${executionId}`, JSON.stringify(event))
      }
    } catch (error: unknown) { // Changed error to unknown
      console.warn('[ExecutionEvents] Failed to publish to Redis:', error)
    }
  }

  /**
   * 获取执行状态
   */
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.executionStates.get(executionId)
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

    this.broadcast(executionId, {
      executionId,
      type: 'node_start', // Initial event might be tailored
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
  nodeStart(
    executionId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    inputStatus?: 'valid' | 'invalid' | 'missing',
    inputError?: string
  ): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    const nodeStatus = state.nodeStatuses.get(nodeId)
    if (nodeStatus) {
      nodeStatus.status = 'running'
      nodeStatus.startedAt = new Date()
      nodeStatus.triggered = true
      nodeStatus.inputStatus = inputStatus || 'valid'
      nodeStatus.inputError = inputError
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
      inputStatus: inputStatus || 'valid',
      inputError,
    }

    this.broadcast(executionId, event)
  }

  /**
   * 节点执行完成
   */
  nodeComplete(
    executionId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    output?: Record<string, unknown>,
    outputStatus?: 'valid' | 'empty' | 'invalid' | 'incomplete',
    outputError?: string
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
      nodeStatus.outputStatus = outputStatus || 'valid'
      nodeStatus.outputError = outputError
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
      outputStatus: outputStatus || 'valid',
      outputError,
      timestamp: new Date(),
    }

    this.broadcast(executionId, event)
  }

  /**
   * 节点执行失败
   */
  nodeError(
    executionId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    error: string,
    errorDetail?: { friendlyMessage: string; suggestions: string[]; code?: string; isRetryable?: boolean; stack?: string; analysis?: Prisma.InputJsonValue },
    errorPhase?: 'input' | 'output'
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
      if (errorPhase === 'input') {
        nodeStatus.inputStatus = 'invalid'
        nodeStatus.inputError = error
      } else {
        nodeStatus.outputStatus = 'error'
        nodeStatus.outputError = error
      }
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
      errorDetail,
      inputStatus: errorPhase === 'input' ? 'invalid' : undefined,
      outputStatus: errorPhase === 'output' ? 'error' : undefined,
      inputError: errorPhase === 'input' ? error : undefined,
      outputError: errorPhase === 'output' ? error : undefined,
      timestamp: new Date(),
    }

    this.broadcast(executionId, event)
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

    this.broadcast(executionId, event)

    // 延迟清理状态
    setTimeout(() => {
      this.executionStates.delete(executionId)
    }, 60000) // 1 分钟后清理
  }

  /**
   * 执行失败
   */
  executionError(
    executionId: string,
    error: string,
    errorDetail?: { friendlyMessage: string; suggestions: string[]; code?: string; isRetryable?: boolean; stack?: string; analysis?: Prisma.InputJsonValue } // Updated errorDetail type
  ): void {
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
      errorDetail,
      timestamp: new Date(),
    }

    this.broadcast(executionId, event)

    // 延迟清理状态
    setTimeout(() => {
      this.executionStates.delete(executionId)
    }, 60000)
  }

  /**
   * 执行暂停（等待人工审批）
   */
  executionPaused(executionId: string, nodeId: string, approvalRequestId: string): void {
    const state = this.executionStates.get(executionId)
    if (!state) return

    state.status = 'paused'
    state.currentNodeId = nodeId
    state.approvalRequestId = approvalRequestId

    const nodeStatus = state.nodeStatuses.get(nodeId)

    const event: ExecutionProgressEvent = {
      executionId,
      type: 'execution_paused',
      nodeId,
      nodeName: nodeStatus?.nodeName,
      nodeType: nodeStatus?.nodeType,
      status: 'paused',
      progress: state.progress,
      completedNodes: state.completedNodes,
      totalNodes: state.totalNodes,
      currentNodeIndex: state.completedNodes.length,
      approvalRequestId,
      timestamp: new Date(),
    }

    this.broadcast(executionId, event)

    // 不清理状态，因为执行将在审批后恢复
  }

  private redisSubscriber: Redis | null = null

  /**
   * 订阅执行进度
   */
  subscribe(
    executionId: string,
    callback: (event: ExecutionProgressEvent) => void
  ): () => void {
    const eventName = `execution:${executionId}`
    this.on(eventName, callback)

    // 如果配置了 Redis，确保订阅了该频道
    this.ensureRedisSubscription(executionId)

    // 返回取消订阅函数
    return () => {
      this.off(eventName, callback)
      // 如果没有任何监听器了，取消 Redis 订阅以释放资源
      if (this.listenerCount(eventName) === 0 && this.redisSubscriber) {
        this.redisSubscriber.unsubscribe(`execution:${executionId}`).catch((err: unknown) => {
          console.warn(`[ExecutionEvents] Failed to unsubscribe from execution:${executionId}`, err)
        })
      }
    }
  }

  /**
   * 确保订阅了 Redis 频道
   */
  private async ensureRedisSubscription(executionId: string) {
    try {
      if (!this.redisSubscriber) {
        const redis = getRedisConnection()
        if (redis) {
          // 需要创建一个新的连接用于订阅，因为订阅模式下不能执行其他命令
          // 这里简单起见复用 getRedisConnection 的配置创建新连接
          // 或者假设 getRedisConnection 返回的实例如果被用于 subscribe 就进入订阅模式
          // 但 ioredis 最佳实践是专用一个 connection for sub.
          // 由于 getRedisConnection 是单例，我们不能直接用它来 subscribe (否则会阻塞其他命令)
          // 所以我们需要 duplicate 一个连接
          this.redisSubscriber = redis.duplicate()

          this.redisSubscriber.on('message', (channel: string, message: string) => {
            if (channel.startsWith('execution:')) {
              try {
                const event = JSON.parse(message)
                // 触发本地事件，但要避免死循环（如果收到自己发的）
                // 因为我们在 emit 本地事件时也会 publish 到 Redis
                // 但 broadcast 是 emit -> publish
                // 这里是 on Redis -> emit
                // 这会导致 emit -> publish -> on Redis -> emit -> ... 循环吗？
                // 是的，会产生环。
                // 解决方案：
                // 1. 区分事件来源。
                // 2. 或者让 local listener 只处理 logical handling，而 broadcast 只负责 outgoing。
                // 3. 实际上，SSE endpoint 只需要 listen。Engine 只需 emit (broadcast).
                //    如果 SSE endpoint 和 Engine 在不同进程，SSE endpoint 不会调用 broadcast，只会 listen。
                //    如果 SSE endpoint 和 Engine 在同一进程，
                //      Engine 调用 broadcast -> emit (local) + publish (redis)
                //      SSE endpoint (via subscribe) -> on (local) -> 收到事件 ✅
                //      Redis client -> on message -> emit (local) -> 收到重复事件 ❌

                // 所以我们需要判断：如果我们已经通过本地 emit 收到了，就不应该再处理 Redis 消息？
                // 或者：broadcast 的时候只 publish 到 Redis，不 emit 本地？
                // 不行，本地监听器（在同一进程）需要立即收到。

                // 简单Hack：给事件加个标记 "fromRedis"? 或者检查是否是本进程发出的？
                // 但 Redis pub/sub 不带 source info。

                // 更好的方案：
                // SSE 端只订阅 Redis。Engine 端只 Publish Redis。
                // 但我们想保持 API 兼容性 (EventEmitter)。

                // 我们可以检查一下：如果是在本进程 broadcast 的，我们肯定已经 emit 了。
                // 只有通过 Redis 收到的消息，我们才 emit。
                // 但是 `this.emit` 会触发所有 listeners。
                // 如果我们在 broadcast里做了 emit，然后又从 Redis 收到消息再次 emit，就会重复。

                // 解决办法：
                // broadcast 方法里：
                // 1. publish to Redis
                // 2. emit locally

                // Redis listener 里：
                // 1. 收到消息
                // 2. emit locally

                // 这样一定会重复。
                // 除非我们能区分。
                // 或者，我们在 broadcast 里，只 publish to Redis。
                // 然后我们在 Redis listener 里 emit locally。
                // 这样本地进程也会通过 Redis 收到消息然后 emit。
                // 缺点：增加了 Redis RTT 延迟。
                // 优点：逻辑简单，无重复，且所有进程一致。

                // 让我们采用这种 "All via Redis" 的策略，或者优化一下。
                // 如果没有 Redis 连接，则只本地 emit (fallback)。

                // 修改 broadcast 逻辑：
                // if (redis) { allow redis loopback to handle emit } else { emit locally }
                this.emit(channel, event)
              } catch (e: unknown) { // Changed e to unknown
                console.error('Failed to parse redis message', e)
              }
            }
          })
        }
      }

      if (this.redisSubscriber) {
        await this.redisSubscriber.subscribe(`execution:${executionId}`)
      }
    } catch (error) {
      console.warn('[ExecutionEvents] Failed to subscribe Redis:', error)
    }
  }

  /**
   * 计算执行进度百分比
   */
  private calculateProgress(state: ExecutionState): number {
    if (state.totalNodes === 0) return 0
    return Math.round((state.completedNodes.length / state.totalNodes) * 100)
  }
}

// 单例导出
export const executionEvents = new ExecutionEventManager()
