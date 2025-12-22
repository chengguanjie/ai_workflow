/**
 * 代码执行队列
 * 控制并发执行数量，防止系统过载
 */

import type {
  ExecutionLanguage,
  ExecutionContext,
  ExecutionResult,
  ResourceLimits,
} from './types'
import { getRunnerFactory } from './runner-factory'

/**
 * 队列任务
 */
interface QueuedTask {
  id: string
  code: string
  language: ExecutionLanguage
  context: ExecutionContext
  limits?: Partial<ResourceLimits>
  priority: number
  createdAt: Date
  resolve: (result: ExecutionResult) => void
  reject: (error: Error) => void
}

/**
 * 队列配置
 */
export interface ExecutionQueueConfig {
  /** 最大并发数 */
  maxConcurrency?: number
  /** 最大队列长度 */
  maxQueueSize?: number
  /** 队列超时时间 (ms) */
  queueTimeout?: number
  /** 是否启用优先级队列 */
  enablePriority?: boolean
}

/**
 * 执行队列统计
 */
export interface QueueStats {
  /** 当前运行任务数 */
  running: number
  /** 队列中等待任务数 */
  queued: number
  /** 总执行次数 */
  totalExecutions: number
  /** 成功次数 */
  successCount: number
  /** 失败次数 */
  errorCount: number
  /** 超时次数 */
  timeoutCount: number
  /** 平均执行时间 */
  avgExecutionTime: number
}

/**
 * 代码执行队列
 */
export class ExecutionQueue {
  private queue: QueuedTask[] = []
  private running: Map<string, QueuedTask> = new Map()
  private config: Required<ExecutionQueueConfig>
  private stats: QueueStats = {
    running: 0,
    queued: 0,
    totalExecutions: 0,
    successCount: 0,
    errorCount: 0,
    timeoutCount: 0,
    avgExecutionTime: 0,
  }
  private executionTimes: number[] = []

  constructor(config?: ExecutionQueueConfig) {
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 5,
      maxQueueSize: config?.maxQueueSize ?? 100,
      queueTimeout: config?.queueTimeout ?? 60000,
      enablePriority: config?.enablePriority ?? true,
    }
  }

  /**
   * 提交执行任务
   */
  async execute(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>,
    priority: number = 0
  ): Promise<ExecutionResult> {
    // 检查队列是否已满
    if (this.queue.length >= this.config.maxQueueSize) {
      return {
        success: false,
        output: null,
        formattedOutput: 'Error: 执行队列已满，请稍后重试',
        outputType: 'error',
        logs: [],
        metrics: {
          executionTime: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        },
        error: '执行队列已满，请稍后重试',
      }
    }

    return new Promise<ExecutionResult>((resolve, reject) => {
      const task: QueuedTask = {
        id: context.executionId,
        code,
        language,
        context,
        limits,
        priority,
        createdAt: new Date(),
        resolve,
        reject,
      }

      // 设置队列超时
      const timeoutId = setTimeout(() => {
        this.removeFromQueue(task.id)
        this.stats.timeoutCount++
        resolve({
          success: false,
          output: null,
          formattedOutput: 'Error: 等待执行超时',
          outputType: 'error',
          logs: [],
          metrics: {
            executionTime: 0,
            startedAt: task.createdAt,
            completedAt: new Date(),
          },
          error: '等待执行超时',
        })
      }, this.config.queueTimeout)

      // 修改 resolve 和 reject 以清除超时
      const originalResolve = task.resolve
      task.resolve = (result: ExecutionResult) => {
        clearTimeout(timeoutId)
        originalResolve(result)
      }

      const originalReject = task.reject
      task.reject = (error: Error) => {
        clearTimeout(timeoutId)
        originalReject(error)
      }

      // 添加到队列
      this.addToQueue(task)

      // 尝试处理队列
      this.processQueue()
    })
  }

  /**
   * 添加任务到队列
   */
  private addToQueue(task: QueuedTask): void {
    if (this.config.enablePriority) {
      // 优先级队列：高优先级任务排前面
      const index = this.queue.findIndex(t => t.priority < task.priority)
      if (index === -1) {
        this.queue.push(task)
      } else {
        this.queue.splice(index, 0, task)
      }
    } else {
      this.queue.push(task)
    }
    this.stats.queued = this.queue.length
  }

  /**
   * 从队列中移除任务
   */
  private removeFromQueue(taskId: string): boolean {
    const index = this.queue.findIndex(t => t.id === taskId)
    if (index !== -1) {
      this.queue.splice(index, 1)
      this.stats.queued = this.queue.length
      return true
    }
    return false
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    // 检查是否有空闲槽位
    while (this.running.size < this.config.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) break

      this.stats.queued = this.queue.length
      this.running.set(task.id, task)
      this.stats.running = this.running.size

      // 异步执行任务
      this.executeTask(task)
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: QueuedTask): Promise<void> {
    const startTime = Date.now()

    try {
      // 获取执行器
      const factory = getRunnerFactory()
      await factory.initialize()

      const runner = factory.getRunnerForLanguage(task.language)
      if (!runner) {
        task.resolve({
          success: false,
          output: null,
          formattedOutput: `Error: 没有可用的执行器支持 ${task.language} 语言`,
          outputType: 'error',
          logs: [],
          metrics: {
            executionTime: Date.now() - startTime,
            startedAt: new Date(startTime),
            completedAt: new Date(),
          },
          error: `没有可用的执行器支持 ${task.language} 语言`,
        })
        this.stats.errorCount++
        return
      }

      // 执行代码
      const result = await runner.execute(
        task.code,
        task.language,
        task.context,
        task.limits
      )

      // 更新统计
      this.stats.totalExecutions++
      if (result.success) {
        this.stats.successCount++
      } else {
        this.stats.errorCount++
      }

      // 更新平均执行时间
      const executionTime = Date.now() - startTime
      this.executionTimes.push(executionTime)
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift()
      }
      this.stats.avgExecutionTime = this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length

      task.resolve(result)
    } catch (error) {
      this.stats.errorCount++
      task.reject(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.running.delete(task.id)
      this.stats.running = this.running.size

      // 继续处理队列
      this.processQueue()
    }
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): boolean {
    // 先尝试从队列中移除
    if (this.removeFromQueue(taskId)) {
      return true
    }

    // 如果正在运行，尝试终止
    const runningTask = this.running.get(taskId)
    if (runningTask) {
      // 通过工厂获取执行器并终止
      const factory = getRunnerFactory()
      const runner = factory.getRunnerForLanguage(runningTask.language)
      if (runner) {
        runner.terminate(taskId)
      }
      return true
    }

    return false
  }

  /**
   * 获取队列统计
   */
  getStats(): QueueStats {
    return { ...this.stats }
  }

  /**
   * 获取队列中的任务列表
   */
  getQueuedTasks(): Array<{
    id: string
    language: ExecutionLanguage
    priority: number
    waitTime: number
  }> {
    const now = Date.now()
    return this.queue.map(task => ({
      id: task.id,
      language: task.language,
      priority: task.priority,
      waitTime: now - task.createdAt.getTime(),
    }))
  }

  /**
   * 获取运行中的任务列表
   */
  getRunningTasks(): Array<{
    id: string
    language: ExecutionLanguage
    runTime: number
  }> {
    const now = Date.now()
    return Array.from(this.running.values()).map(task => ({
      id: task.id,
      language: task.language,
      runTime: now - task.createdAt.getTime(),
    }))
  }

  /**
   * 清空队列
   */
  clear(): void {
    for (const task of this.queue) {
      task.reject(new Error('队列已清空'))
    }
    this.queue = []
    this.stats.queued = 0
  }

  /**
   * 暂停队列处理
   */
  private paused = false

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.processQueue()
  }

  isPaused(): boolean {
    return this.paused
  }
}

// 全局队列实例
let queueInstance: ExecutionQueue | null = null

/**
 * 获取全局执行队列
 */
export function getExecutionQueue(config?: ExecutionQueueConfig): ExecutionQueue {
  if (!queueInstance) {
    queueInstance = new ExecutionQueue(config)
  }
  return queueInstance
}

/**
 * 便捷执行函数
 */
export async function executeCode(
  code: string,
  language: ExecutionLanguage,
  context: ExecutionContext,
  limits?: Partial<ResourceLimits>,
  priority?: number
): Promise<ExecutionResult> {
  const queue = getExecutionQueue()
  return queue.execute(code, language, context, limits, priority)
}
