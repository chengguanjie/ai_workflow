/**
 * Workflow Scheduler Service
 *
 * 管理工作流的定时触发任务
 * 使用 node-cron 实现 Cron 表达式调度
 */

import cron, { ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'

interface ScheduledJob {
  triggerId: string
  workflowId: string
  organizationId: string
  createdById: string
  task: ScheduledTask
  cronExpression: string
  timezone: string
  retryOnFail: boolean
  maxRetries: number
  inputTemplate?: Record<string, unknown> | null
}

class WorkflowScheduler {
  private jobs: Map<string, ScheduledJob> = new Map()
  private initialized: boolean = false

  /**
   * 初始化调度器，加载所有启用的定时任务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[Scheduler] Already initialized')
      return
    }

    console.log('[Scheduler] Initializing...')

    try {
      // 加载所有启用的定时触发器
      const triggers = await prisma.workflowTrigger.findMany({
        where: {
          type: 'SCHEDULE',
          enabled: true,
          cronExpression: { not: null },
          workflow: {
            isActive: true,
            deletedAt: null,
          },
        },
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
              organizationId: true,
            },
          },
        },
      })

      console.log(`[Scheduler] Found ${triggers.length} scheduled triggers`)

      for (const trigger of triggers) {
        try {
          this.scheduleJob(
            trigger.id,
            trigger.cronExpression!,
            trigger.workflow.id,
            trigger.workflow.organizationId,
            trigger.createdById,
            {
              inputTemplate: trigger.inputTemplate as Record<string, unknown> | null,
              timezone: trigger.timezone || 'Asia/Shanghai',
              retryOnFail: trigger.retryOnFail,
              maxRetries: trigger.maxRetries,
            }
          )
        } catch (error) {
          console.error(`[Scheduler] Failed to schedule trigger ${trigger.id}:`, error)
        }
      }

      this.initialized = true
      console.log(`[Scheduler] Initialized with ${this.jobs.size} jobs`)
    } catch (error) {
      console.error('[Scheduler] Initialization failed:', error)
      throw error
    }
  }

  /**
   * 创建定时任务
   */
  scheduleJob(
    triggerId: string,
    cronExpression: string,
    workflowId: string,
    organizationId: string,
    createdById: string,
    options: {
      inputTemplate?: Record<string, unknown> | null
      timezone?: string
      retryOnFail?: boolean
      maxRetries?: number
    } = {}
  ): void {
    const {
      inputTemplate,
      timezone = 'Asia/Shanghai',
      retryOnFail = false,
      maxRetries = 3,
    } = options

    // 如果已存在，先停止
    if (this.jobs.has(triggerId)) {
      this.removeJob(triggerId)
    }

    // 验证 cron 表达式
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`)
    }

    // 创建定时任务
    const task = cron.schedule(
      cronExpression,
      async () => {
        await this.executeScheduledJob(triggerId)
      },
      {
        timezone, // 使用触发器配置的时区
      }
    )

    const job: ScheduledJob = {
      triggerId,
      workflowId,
      organizationId,
      createdById,
      task,
      cronExpression,
      timezone,
      retryOnFail,
      maxRetries,
      inputTemplate,
    }

    this.jobs.set(triggerId, job)
    console.log(`[Scheduler] Job scheduled: ${triggerId} (${cronExpression}, tz=${timezone})`)
  }

  /**
   * 执行定时任务（带重试机制）
   */
  private async executeScheduledJob(triggerId: string): Promise<void> {
    const job = this.jobs.get(triggerId)
    if (!job) {
      console.error(`[Scheduler] Job not found: ${triggerId}`)
      return
    }

    const { workflowId, organizationId, createdById, inputTemplate, retryOnFail, maxRetries } = job
    const startTime = Date.now()
    console.log(`[Scheduler] Executing scheduled job: ${triggerId}`)

    // 创建触发日志
    const triggerLog = await prisma.triggerLog.create({
      data: {
        triggerId,
        status: 'RUNNING',
        triggeredAt: new Date(),
      },
    })

    // 执行函数（可重试）
    const executeOnce = async (): Promise<string> => {
      // 检查工作流是否仍然有效
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          isActive: true,
          deletedAt: null,
        },
      })

      if (!workflow) {
        throw new Error('工作流未激活或已删除')
      }

      // 构建输入
      const workflowInput = {
        ...(inputTemplate || {}),
        _schedule: {
          triggerId,
          triggeredAt: new Date().toISOString(),
        },
      }

      // 异步执行工作流
      return executionQueue.enqueue(
        workflowId,
        organizationId,
        createdById,
        workflowInput
      )
    }

    // 重试执行
    let lastError: Error | null = null
    let taskId: string | null = null
    const actualMaxRetries = retryOnFail ? maxRetries : 1

    for (let attempt = 1; attempt <= actualMaxRetries; attempt++) {
      try {
        taskId = await executeOnce()
        lastError = null
        break // 成功则退出循环
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('执行失败')
        console.warn(`[Scheduler] Job ${triggerId} attempt ${attempt}/${actualMaxRetries} failed:`, lastError.message)

        if (attempt < actualMaxRetries) {
          // 指数退避等待：1s, 2s, 4s...
          const delay = Math.pow(2, attempt - 1) * 1000
          console.log(`[Scheduler] Retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // 更新触发器统计
    await prisma.workflowTrigger.update({
      where: { id: triggerId },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    })

    if (taskId && !lastError) {
      // 成功
      await prisma.triggerLog.update({
        where: { id: triggerLog.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          duration: Date.now() - startTime,
        },
      })

      await prisma.workflowTrigger.update({
        where: { id: triggerId },
        data: { lastSuccessAt: new Date() },
      })

      console.log(`[Scheduler] Job ${triggerId} queued successfully: ${taskId}`)
    } else {
      // 失败
      const errorMessage = lastError?.message || '执行失败'
      const isSkipped = errorMessage.includes('未激活') || errorMessage.includes('已删除')

      await prisma.triggerLog.update({
        where: { id: triggerLog.id },
        data: {
          status: isSkipped ? 'SKIPPED' : 'FAILED',
          errorMessage,
          completedAt: new Date(),
          duration: Date.now() - startTime,
        },
      })

      if (!isSkipped) {
        await prisma.workflowTrigger.update({
          where: { id: triggerId },
          data: { lastFailureAt: new Date() },
        })
      }

      console.error(`[Scheduler] Job ${triggerId} failed after ${actualMaxRetries} attempts:`, errorMessage)
    }
  }

  /**
   * 移除定时任务
   */
  removeJob(triggerId: string): void {
    const job = this.jobs.get(triggerId)
    if (job) {
      job.task.stop()
      this.jobs.delete(triggerId)
      console.log(`[Scheduler] Job removed: ${triggerId}`)
    }
  }

  /**
   * 更新定时任务
   */
  updateJob(
    triggerId: string,
    cronExpression: string,
    workflowId: string,
    organizationId: string,
    createdById: string,
    options: {
      inputTemplate?: Record<string, unknown> | null
      timezone?: string
      retryOnFail?: boolean
      maxRetries?: number
    } = {}
  ): void {
    this.removeJob(triggerId)
    this.scheduleJob(triggerId, cronExpression, workflowId, organizationId, createdById, options)
  }

  /**
   * 启用/禁用任务
   */
  async toggleJob(triggerId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      // 从数据库加载触发器信息
      const trigger = await prisma.workflowTrigger.findUnique({
        where: { id: triggerId },
        include: {
          workflow: {
            select: { id: true, organizationId: true },
          },
        },
      })

      if (trigger && trigger.cronExpression) {
        this.scheduleJob(
          trigger.id,
          trigger.cronExpression,
          trigger.workflow.id,
          trigger.workflow.organizationId,
          trigger.createdById,
          {
            inputTemplate: trigger.inputTemplate as Record<string, unknown> | null,
            timezone: trigger.timezone || 'Asia/Shanghai',
            retryOnFail: trigger.retryOnFail,
            maxRetries: trigger.maxRetries,
          }
        )
      }
    } else {
      this.removeJob(triggerId)
    }
  }

  /**
   * 获取所有活动任务
   */
  getActiveJobs(): Array<{ triggerId: string; cronExpression: string; workflowId: string }> {
    return Array.from(this.jobs.values()).map((job) => ({
      triggerId: job.triggerId,
      cronExpression: job.cronExpression,
      workflowId: job.workflowId,
    }))
  }

  /**
   * 获取任务数量
   */
  getJobCount(): number {
    return this.jobs.size
  }

  /**
   * 检查任务是否存在
   */
  hasJob(triggerId: string): boolean {
    return this.jobs.has(triggerId)
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    console.log('[Scheduler] Stopping all jobs...')
    for (const job of this.jobs.values()) {
      job.task.stop()
    }
    this.jobs.clear()
    this.initialized = false
    console.log('[Scheduler] All jobs stopped')
  }

  /**
   * 手动触发一次定时任务
   */
  async triggerNow(triggerId: string): Promise<void> {
    const job = this.jobs.get(triggerId)
    if (!job) {
      throw new Error('Job not found or not scheduled')
    }

    await this.executeScheduledJob(triggerId)
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    initialized: boolean
    jobCount: number
    jobs: Array<{
      triggerId: string
      cronExpression: string
      workflowId: string
      timezone: string
    }>
  } {
    return {
      initialized: this.initialized,
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.values()).map((job) => ({
        triggerId: job.triggerId,
        cronExpression: job.cronExpression,
        workflowId: job.workflowId,
        timezone: job.timezone,
      })),
    }
  }
}

// 使用 globalThis 防止热重载时创建多个实例
const globalForScheduler = globalThis as unknown as {
  scheduler: WorkflowScheduler | undefined
}

export const scheduler = globalForScheduler.scheduler ?? new WorkflowScheduler()

if (process.env.NODE_ENV !== 'production') {
  globalForScheduler.scheduler = scheduler
}
