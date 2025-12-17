/**
 * 工作流异步执行队列
 *
 * 简单的内存队列实现，支持：
 * - 后台异步执行
 * - 执行状态轮询
 * - 并发控制
 * - 超时处理
 *
 * 注意：生产环境建议使用 Redis + Bull 或类似方案
 */

import { executeWorkflow, ExecutionResult } from './engine'
import { prisma } from '@/lib/db'

/**
 * 队列任务
 */
interface QueueTask {
  id: string
  workflowId: string
  organizationId: string
  userId: string
  input?: Record<string, unknown>
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
  maxConcurrent: number      // 最大并发数
  taskTimeout: number        // 任务超时时间（毫秒）
  cleanupInterval: number    // 清理间隔（毫秒）
  taskRetention: number      // 任务保留时间（毫秒）
}

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 5,
  taskTimeout: 5 * 60 * 1000,      // 5 分钟
  cleanupInterval: 60 * 1000,       // 1 分钟
  taskRetention: 30 * 60 * 1000,    // 30 分钟
}

/**
 * 执行队列类
 */
class ExecutionQueue {
  private tasks: Map<string, QueueTask> = new Map()
  private runningCount = 0
  private config: QueueConfig
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startCleanup()
  }

  /**
   * 添加任务到队列
   */
  async enqueue(
    workflowId: string,
    organizationId: string,
    userId: string,
    input?: Record<string, unknown>
  ): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const task: QueueTask = {
      id: taskId,
      workflowId,
      organizationId,
      userId,
      input,
      status: 'pending',
      createdAt: new Date(),
    }

    this.tasks.set(taskId, task)

    // 尝试处理队列
    this.processQueue()

    return taskId
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): QueueTask | undefined {
    return this.tasks.get(taskId)
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
    }
  }> {
    const task = this.tasks.get(taskId)

    if (!task) {
      return { task: null }
    }

    // 如果任务已完成，尝试从数据库获取执行详情
    if (task.status === 'completed' || task.status === 'failed') {
      const execution = await prisma.execution.findFirst({
        where: {
          workflowId: task.workflowId,
          userId: task.userId,
          createdAt: {
            gte: task.createdAt,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          output: true,
          error: true,
          duration: true,
          totalTokens: true,
        },
      })

      return {
        task,
        execution: execution ? {
          id: execution.id,
          status: execution.status,
          output: execution.output,
          error: execution.error || undefined,
          duration: execution.duration || undefined,
          totalTokens: execution.totalTokens,
        } : undefined,
      }
    }

    return { task }
  }

  /**
   * 取消任务
   */
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

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    // 检查并发限制
    if (this.runningCount >= this.config.maxConcurrent) {
      return
    }

    // 找到下一个待处理任务
    for (const [, task] of this.tasks) {
      if (task.status === 'pending') {
        this.runningCount++
        task.status = 'running'
        task.startedAt = new Date()

        // 异步执行任务
        this.executeTask(task)
          .catch((error) => {
            console.error(`Task ${task.id} failed:`, error)
          })
          .finally(() => {
            this.runningCount--
            // 继续处理队列
            this.processQueue()
          })

        // 检查是否还能处理更多任务
        if (this.runningCount >= this.config.maxConcurrent) {
          break
        }
      }
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: QueueTask): Promise<void> {
    try {
      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('任务执行超时')), this.config.taskTimeout)
      })

      // 执行工作流
      const resultPromise = executeWorkflow(
        task.workflowId,
        task.organizationId,
        task.userId,
        task.input
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

  /**
   * 启动清理定时器
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  /**
   * 清理过期任务
   */
  private cleanup(): void {
    const now = Date.now()
    const expireTime = now - this.config.taskRetention

    for (const [taskId, task] of this.tasks) {
      // 删除已完成且超过保留时间的任务
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        task.completedAt &&
        task.completedAt.getTime() < expireTime
      ) {
        this.tasks.delete(taskId)
      }
    }
  }

  /**
   * 获取队列状态
   */
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

    return {
      pending,
      running,
      completed,
      failed,
      total: this.tasks.size,
    }
  }

  /**
   * 停止队列
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
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
export type { QueueTask, QueueConfig }
