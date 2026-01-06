/**
 * 工作流异步执行队列
 *
 * 统一队列接口，支持两种后端：
 * - BullMQ + Redis（推荐生产环境）
 * - 内存队列（开发/测试环境）
 *
 * 自动根据 Redis 配置选择后端
 */

import { executeWorkflow, ExecutionResult, ExecutionOptions } from './engine'
import { prisma } from '@/lib/db'
import { bullmqManager, isRedisConfigured } from './bullmq-queue'
import { ExecutionType } from '@prisma/client'

/**
 * 执行模式类型
 */
export type ExecutionMode = 'production' | 'draft'

/**
 * 队列任务
 */
export interface QueueTask {
  id: string
  workflowId: string
  organizationId: string
  userId: string
  input?: Record<string, unknown>
  mode?: ExecutionMode // 执行模式：production 使用已发布配置，draft 使用草稿配置
  executionType?: ExecutionType // 执行类型：NORMAL 正常执行，TEST 测试执行
  isAIGeneratedInput?: boolean // 是否为 AI 生成的测试数据
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: ExecutionResult
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

/**
 * 队列配置
 */
interface QueueConfig {
  maxConcurrent: number
  taskTimeout: number
  cleanupInterval: number
  taskRetention: number
}

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 5,
  taskTimeout: 5 * 60 * 1000,
  cleanupInterval: 60 * 1000,
  taskRetention: 30 * 60 * 1000,
}

/**
 * 内存队列实现（备用）
 */
class InMemoryQueue {
  private tasks: Map<string, QueueTask> = new Map()
  private runningCount = 0
  private config: QueueConfig
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startCleanup()
  }

  async enqueue(
    workflowId: string,
    organizationId: string,
    userId: string,
    input?: Record<string, unknown>,
    options?: { 
      mode?: ExecutionMode
      executionType?: ExecutionType
      isAIGeneratedInput?: boolean
    }
  ): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const task: QueueTask = {
      id: taskId,
      workflowId,
      organizationId,
      userId,
      input,
      mode: options?.mode ?? 'production',
      executionType: options?.executionType ?? 'NORMAL',
      isAIGeneratedInput: options?.isAIGeneratedInput ?? false,
      status: 'pending',
      createdAt: new Date(),
    }

    this.tasks.set(taskId, task)
    this.processQueue()

    return taskId
  }

  getTask(taskId: string): QueueTask | undefined {
    return this.tasks.get(taskId)
  }

  async getTaskWithDetails(taskId: string): Promise<{
    task: QueueTask | null
    execution?: {
      id: string
      status: string
      output: unknown
      error?: string
      duration?: number
      totalTokens?: number
      organizationId?: string
      logs?: Array<{
        nodeId: string
        nodeName: string
        nodeType: string
        status: string
        error?: string | null
        startedAt: Date
        completedAt?: Date | null
      }>
    }
  }> {
    const task = this.tasks.get(taskId)

    if (!task) {
      return { task: null }
    }

    // 无论任务状态如何，都尝试获取执行记录（用于 SSE 实时监控）
    const execution = await prisma.execution.findFirst({
      where: {
        workflowId: task.workflowId,
        userId: task.userId,
        createdAt: { gte: task.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        output: true,
        error: true,
        duration: true,
        totalTokens: true,
        organizationId: true,
        logs: {
          select: {
            nodeId: true,
            nodeName: true,
            nodeType: true,
            status: true,
            error: true,
            startedAt: true,
            completedAt: true,
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    })

    return {
      task,
      execution: execution
        ? {
          id: execution.id,
          status: execution.status,
          output: execution.output,
          error: execution.error || undefined,
          duration: execution.duration || undefined,
          totalTokens: execution.totalTokens,
          organizationId: execution.organizationId,
          logs: execution.logs,
        }
        : undefined,
    }
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)

    if (!task || task.status !== 'pending') {
      return false
    }

    task.status = 'failed'
    task.error = '任务已取消'
    task.completedAt = new Date()

    return true
  }

  private async processQueue(): Promise<void> {
    if (this.runningCount >= this.config.maxConcurrent) {
      return
    }

    for (const [, task] of this.tasks) {
      if (task.status === 'pending') {
        this.runningCount++
        task.status = 'running'
        task.startedAt = new Date()

        this.executeTask(task)
          .catch((error) => {
            console.error(`Task ${task.id} failed:`, error)
          })
          .finally(() => {
            this.runningCount--
            this.processQueue()
          })

        if (this.runningCount >= this.config.maxConcurrent) {
          break
        }
      }
    }
  }

  private async executeTask(task: QueueTask): Promise<void> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('任务执行超时')), this.config.taskTimeout)
      })

      const options: ExecutionOptions = {
        mode: task.mode ?? 'production',
        executionType: task.executionType ?? 'NORMAL',
        isAIGeneratedInput: task.isAIGeneratedInput ?? false,
      }

      const resultPromise = executeWorkflow(
        task.workflowId,
        task.organizationId,
        task.userId,
        task.input,
        options
      )

      const result = await Promise.race([resultPromise, timeoutPromise])

      task.status = result.status === 'COMPLETED' ? 'completed' : 'failed'
      task.result = result
      task.error = result.error
      task.completedAt = new Date()
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : '执行失败'
      task.completedAt = new Date()
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  private cleanup(): void {
    const now = Date.now()
    const expireTime = now - this.config.taskRetention

    for (const [taskId, task] of this.tasks) {
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        task.completedAt &&
        task.completedAt.getTime() < expireTime
      ) {
        this.tasks.delete(taskId)
      }
    }
  }

  getQueueStatus(): {
    pending: number
    running: number
    completed: number
    failed: number
    total: number
  } {
    let pending = 0
    let running = 0
    let completed = 0
    let failed = 0

    for (const [, task] of this.tasks) {
      switch (task.status) {
        case 'pending':
          pending++
          break
        case 'running':
          running++
          break
        case 'completed':
          completed++
          break
        case 'failed':
          failed++
          break
      }
    }

    return { pending, running, completed, failed, total: this.tasks.size }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}

/**
 * 统一执行队列类
 * 根据 Redis 配置自动选择 BullMQ 或内存队列
 */
class ExecutionQueue {
  private memoryQueue: InMemoryQueue
  private useBullMQ = false
  private initialized = false

  constructor() {
    this.memoryQueue = new InMemoryQueue()
  }

  /**
   * 初始化队列
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    if (isRedisConfigured()) {
      const success = await bullmqManager.initialize()
      if (success) {
        this.useBullMQ = true
        console.log('[Queue] Using BullMQ + Redis')
      } else {
        console.log('[Queue] BullMQ init failed, falling back to memory queue')
      }
    } else {
      console.log('[Queue] Redis not configured, using memory queue')
    }

    this.initialized = true
  }

  /**
   * 添加任务到队列
   */
  async enqueue(
    workflowId: string,
    organizationId: string,
    userId: string,
    input?: Record<string, unknown>,
    options?: {
      triggerId?: string
      priority?: number
      delay?: number
      mode?: ExecutionMode
      executionType?: ExecutionType
      isAIGeneratedInput?: boolean
    }
  ): Promise<string> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize()
    }

    if (this.useBullMQ) {
      return bullmqManager.enqueue(workflowId, organizationId, userId, input, options)
    }

    return this.memoryQueue.enqueue(workflowId, organizationId, userId, input, { 
      mode: options?.mode,
      executionType: options?.executionType,
      isAIGeneratedInput: options?.isAIGeneratedInput,
    })
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): QueueTask | undefined {
    if (this.useBullMQ) {
      // BullMQ 使用异步方法
      return undefined
    }
    return this.memoryQueue.getTask(taskId)
  }

  /**
   * 获取任务状态（包含执行详情）
   */
  async getTaskWithDetails(taskId: string): Promise<{
    task: QueueTask | null
    execution?: {
      id: string
      status: string
      output: unknown
      error?: string
      duration?: number
      totalTokens?: number
      organizationId?: string
    }
  }> {
    if (this.useBullMQ) {
      const jobStatus = await bullmqManager.getJobStatus(taskId)

      if (jobStatus.status === 'unknown') {
        return { task: null }
      }

      // 优先使用执行结果中的状态（因为 BullMQ 的 completed 可能包含 FAILED 的执行）
      let taskStatus: QueueTask['status'] = 'pending'
      let taskError: string | undefined = jobStatus.failedReason

      if (jobStatus.result) {
        // 使用执行引擎返回的真实状态
        if (jobStatus.result.status === 'COMPLETED') {
          taskStatus = 'completed'
        } else if (jobStatus.result.status === 'FAILED') {
          taskStatus = 'failed'
          // 优先使用执行结果中的错误信息
          taskError = jobStatus.result.error || jobStatus.failedReason || '执行失败'
        } else {
          taskStatus = 'running'
        }
      } else {
        // 没有执行结果，使用 BullMQ 的任务状态
        const statusMap: Record<string, QueueTask['status']> = {
          pending: 'pending',
          delayed: 'pending',
          running: 'running',
          completed: 'completed',
          failed: 'failed',
        }
        taskStatus = statusMap[jobStatus.status] || 'pending'

        // 如果是失败状态但没有错误信息，设置默认错误信息
        if (taskStatus === 'failed' && !taskError) {
          taskError = '执行失败，请查看执行历史获取详细信息'
        }
      }

      const task: QueueTask = {
        id: taskId,
        workflowId: jobStatus.jobData?.workflowId || '',
        organizationId: jobStatus.jobData?.organizationId || '',
        userId: jobStatus.jobData?.userId || '',
        status: taskStatus,
        createdAt: new Date(),
        error: taskError,
      }

      // 如果有执行结果，直接返回
      if (jobStatus.result) {
        return {
          task,
          execution: {
            id: jobStatus.result.executionId,
            status: jobStatus.result.status,
            output: jobStatus.result.output,
            error: jobStatus.result.error || taskError,
            duration: jobStatus.result.duration,
            organizationId: task.organizationId,
          },
        }
      }

      // 任务运行中但没有结果时，尝试从数据库查询执行记录（用于 SSE 实时监控）
      if (jobStatus.jobData && (taskStatus === 'running' || taskStatus === 'pending')) {
        const execution = await prisma.execution.findFirst({
          where: {
            workflowId: jobStatus.jobData.workflowId,
            userId: jobStatus.jobData.userId,
            status: { in: ['PENDING', 'RUNNING'] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            output: true,
            error: true,
            duration: true,
            totalTokens: true,
            organizationId: true,
          },
        })

        if (execution) {
          return {
            task,
            execution: {
              id: execution.id,
              status: execution.status,
              output: execution.output,
              error: execution.error || undefined,
              duration: execution.duration || undefined,
              totalTokens: execution.totalTokens,
              organizationId: execution.organizationId,
            },
          }
        }
      }

      return { task }
    }

    return this.memoryQueue.getTaskWithDetails(taskId)
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    if (this.useBullMQ) {
      return bullmqManager.cancelJob(taskId)
    }
    return this.memoryQueue.cancelTask(taskId)
  }

  /**
   * 获取队列状态
   */
  async getQueueStatus(): Promise<{
    pending: number
    running: number
    completed: number
    failed: number
    total: number
    backend: 'bullmq' | 'memory'
  }> {
    if (this.useBullMQ) {
      const status = await bullmqManager.getQueueStatus()
      return {
        pending: status.waiting + status.delayed,
        running: status.active,
        completed: status.completed,
        failed: status.failed,
        total: status.waiting + status.delayed + status.active + status.completed + status.failed,
        backend: 'bullmq',
      }
    }

    const status = this.memoryQueue.getQueueStatus()
    return { ...status, backend: 'memory' }
  }

  /**
   * 检查是否使用 BullMQ
   */
  isUsingBullMQ(): boolean {
    return this.useBullMQ
  }

  /**
   * 停止队列
   */
  async stop(): Promise<void> {
    this.memoryQueue.stop()
    if (this.useBullMQ) {
      await bullmqManager.close()
    }
  }
}

// 使用 globalThis 防止热重载时丢失状态
const globalForQueue = globalThis as unknown as {
  executionQueue: ExecutionQueue | undefined
}

export const executionQueue = globalForQueue.executionQueue ?? new ExecutionQueue()

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.executionQueue = executionQueue
}

// 导出类型
export type { QueueConfig }
