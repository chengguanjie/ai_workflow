/**
 * BullMQ 工作流执行队列
 *
 * 使用 Redis + BullMQ 实现持久化任务队列
 * 支持：
 * - 任务持久化（服务重启不丢失）
 * - 分布式执行
 * - 任务重试
 * - 任务优先级
 * - 任务进度追踪
 * - 延迟执行
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq'
import { getRedisConnection, isRedisConfigured } from '@/lib/redis'
import { executeWorkflow } from './engine'
import { prisma } from '@/lib/db'

/**
 * 任务数据
 */
export interface WorkflowJobData {
  workflowId: string
  organizationId: string
  userId: string
  input?: Record<string, unknown>
  triggerId?: string // 关联的触发器 ID
}

/**
 * 任务结果
 */
export interface WorkflowJobResult {
  executionId: string
  status: string // ExecutionStatus: PENDING | RUNNING | COMPLETED | FAILED
  output?: unknown
  error?: string
  duration?: number
}

/**
 * 队列名称
 */
const QUEUE_NAME = 'workflow-execution'

/**
 * 队列配置
 */
const QUEUE_OPTIONS = {
  defaultJobOptions: {
    attempts: 3, // 失败重试次数
    backoff: {
      type: 'exponential' as const,
      delay: 2000, // 初始延迟 2 秒
    },
    removeOnComplete: {
      age: 3600 * 24, // 保留 24 小时
      count: 1000, // 最多保留 1000 个
    },
    removeOnFail: {
      age: 3600 * 24 * 7, // 失败任务保留 7 天
    },
  },
}

/**
 * BullMQ 队列管理器
 */
class BullMQQueueManager {
  private queue: Queue<WorkflowJobData, WorkflowJobResult> | null = null
  private worker: Worker<WorkflowJobData, WorkflowJobResult> | null = null
  private queueEvents: QueueEvents | null = null
  private initialized = false

  /**
   * 初始化队列
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true

    const connection = getRedisConnection()
    if (!connection) {
      console.log('[BullMQ] Redis not configured, skipping initialization')
      return false
    }

    try {
      // 创建队列
      this.queue = new Queue<WorkflowJobData, WorkflowJobResult>(QUEUE_NAME, {
        connection,
        ...QUEUE_OPTIONS,
      })

      // 创建队列事件监听器
      this.queueEvents = new QueueEvents(QUEUE_NAME, { connection })

      // 创建 Worker
      this.worker = new Worker<WorkflowJobData, WorkflowJobResult>(
        QUEUE_NAME,
        async (job) => this.processJob(job),
        {
          connection,
          concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
          limiter: {
            max: 10,
            duration: 1000, // 每秒最多 10 个任务
          },
        }
      )

      // 监听 Worker 事件
      this.worker.on('completed', (job) => {
        console.log(`[BullMQ] Job ${job.id} completed`)
      })

      this.worker.on('failed', (job, err) => {
        console.error(`[BullMQ] Job ${job?.id} failed:`, err.message)
      })

      this.worker.on('error', (err) => {
        console.error('[BullMQ] Worker error:', err)
      })

      this.initialized = true
      console.log('[BullMQ] Queue initialized successfully')
      return true
    } catch (error) {
      console.error('[BullMQ] Failed to initialize:', error)
      return false
    }
  }

  /**
   * 处理任务
   */
  private async processJob(job: Job<WorkflowJobData, WorkflowJobResult>): Promise<WorkflowJobResult> {
    const { workflowId, organizationId, userId, input, triggerId } = job.data
    const startTime = Date.now()

    console.log(`[BullMQ] Processing job ${job.id}: workflow=${workflowId}`)

    try {
      // 更新任务进度
      await job.updateProgress(10)

      // 执行工作流
      const result = await executeWorkflow(workflowId, organizationId, userId, input)

      await job.updateProgress(100)

      // 更新触发器统计（如果有关联触发器）
      if (triggerId) {
        await this.updateTriggerStats(triggerId, result.status === 'COMPLETED')
      }

      return {
        executionId: result.executionId,
        status: result.status,
        output: result.output,
        error: result.error,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      // 更新触发器统计
      if (triggerId) {
        await this.updateTriggerStats(triggerId, false)
      }

      throw error // 让 BullMQ 处理重试
    }
  }

  /**
   * 更新触发器统计
   */
  private async updateTriggerStats(triggerId: string, success: boolean): Promise<void> {
    try {
      await prisma.workflowTrigger.update({
        where: { id: triggerId },
        data: success
          ? { lastSuccessAt: new Date() }
          : { lastFailureAt: new Date() },
      })
    } catch {
      // 忽略统计更新失败
    }
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
    }
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('Queue not initialized')
    }

    const job = await this.queue.add(
      'execute',
      { workflowId, organizationId, userId, input, triggerId: options?.triggerId },
      {
        priority: options?.priority,
        delay: options?.delay,
      }
    )

    return job.id || `job_${Date.now()}`
  }

  /**
   * 获取任务状态
   */
  async getJobStatus(jobId: string): Promise<{
    status: 'pending' | 'running' | 'completed' | 'failed' | 'delayed' | 'unknown'
    progress?: number
    result?: WorkflowJobResult
    error?: string
    failedReason?: string
  }> {
    if (!this.queue) {
      return { status: 'unknown' }
    }

    const job = await this.queue.getJob(jobId)
    if (!job) {
      return { status: 'unknown' }
    }

    const state = await job.getState()
    const statusMap: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'delayed'> = {
      waiting: 'pending',
      'waiting-children': 'pending',
      active: 'running',
      completed: 'completed',
      failed: 'failed',
      delayed: 'delayed',
    }

    return {
      status: statusMap[state] || 'pending',
      progress: job.progress as number | undefined,
      result: job.returnvalue as WorkflowJobResult | undefined,
      failedReason: job.failedReason,
    }
  }

  /**
   * 取消任务
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.queue) return false

    const job = await this.queue.getJob(jobId)
    if (!job) return false

    const state = await job.getState()
    if (state === 'waiting' || state === 'delayed') {
      await job.remove()
      return true
    }

    return false
  }

  /**
   * 获取队列状态
   */
  async getQueueStatus(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  }> {
    if (!this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ])

    return { waiting, active, completed, failed, delayed }
  }

  /**
   * 获取最近的任务
   */
  async getRecentJobs(count = 10): Promise<Array<{
    id: string
    status: string
    data: WorkflowJobData
    progress: number
    result?: WorkflowJobResult
    createdAt: Date
    processedAt?: Date
    finishedAt?: Date
  }>> {
    if (!this.queue) return []

    const jobs = await this.queue.getJobs(['completed', 'failed', 'active', 'waiting'], 0, count - 1)

    return Promise.all(
      jobs.map(async (job) => ({
        id: job.id || '',
        status: await job.getState(),
        data: job.data,
        progress: (job.progress as number) || 0,
        result: job.returnvalue as WorkflowJobResult | undefined,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      }))
    )
  }

  /**
   * 暂停队列
   */
  async pause(): Promise<void> {
    await this.queue?.pause()
  }

  /**
   * 恢复队列
   */
  async resume(): Promise<void> {
    await this.queue?.resume()
  }

  /**
   * 清空队列
   */
  async drain(): Promise<void> {
    await this.queue?.drain()
  }

  /**
   * 关闭队列
   */
  async close(): Promise<void> {
    await this.worker?.close()
    await this.queueEvents?.close()
    await this.queue?.close()
    this.initialized = false
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// 全局单例
const globalForBullMQ = globalThis as unknown as {
  bullmqManager: BullMQQueueManager | undefined
}

export const bullmqManager = globalForBullMQ.bullmqManager ?? new BullMQQueueManager()

if (process.env.NODE_ENV !== 'production') {
  globalForBullMQ.bullmqManager = bullmqManager
}

export { isRedisConfigured }
