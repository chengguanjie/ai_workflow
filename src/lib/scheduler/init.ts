/**
 * 调度器初始化模块
 *
 * 用于在应用启动时自动初始化调度器
 */

import cron, { ScheduledTask } from 'node-cron'
import { scheduler } from './index'
import { processExpiredApprovals } from '@/lib/workflow/processors/approval-timeout'
import { processAllPendingNotifications } from '@/lib/notifications'

let initPromise: Promise<void> | null = null
let approvalTimeoutTask: ScheduledTask | null = null
let notificationTask: ScheduledTask | null = null

/**
 * 初始化调度器（单例模式）
 * 确保只初始化一次
 */
export async function initializeScheduler(): Promise<void> {
  // 如果已经在初始化中，等待完成
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      console.log('[Scheduler] Starting initialization...')
      await scheduler.initialize()

      // 初始化系统定时任务
      initializeSystemJobs()

      console.log('[Scheduler] Initialization completed successfully')
    } catch (error) {
      // 记录错误但不阻止应用启动
      console.error('[Scheduler] Initialization failed:', error)
      // 重置 promise 以便可以重试
      initPromise = null
    }
  })()

  return initPromise
}

/**
 * 初始化系统定时任务
 */
function initializeSystemJobs(): void {
  // 审批超时检查任务 - 每分钟运行一次
  if (!approvalTimeoutTask) {
    approvalTimeoutTask = cron.schedule(
      '* * * * *', // 每分钟
      async () => {
        try {
          const result = await processExpiredApprovals()
          if (result.processed > 0) {
            console.log(
              `[SystemJob] Approval timeout check: ${result.processed} processed, ` +
                `${result.approved} approved, ${result.rejected} rejected, ` +
                `${result.escalated} escalated, ${result.failed} failed`
            )
          }
        } catch (error) {
          console.error('[SystemJob] Approval timeout check failed:', error)
        }
      },
      {
        timezone: 'Asia/Shanghai',
      }
    )
    console.log('[SystemJob] Approval timeout checker scheduled (every minute)')
  }

  // 通知发送任务 - 每30秒运行一次
  if (!notificationTask) {
    notificationTask = cron.schedule(
      '*/30 * * * * *', // 每30秒
      async () => {
        try {
          const result = await processAllPendingNotifications()
          if (result.processed > 0) {
            console.log(
              `[SystemJob] Notification send: ${result.processed} processed, ` +
                `${result.sent} sent, ${result.failed} failed`
            )
          }
        } catch (error) {
          console.error('[SystemJob] Notification send failed:', error)
        }
      },
      {
        timezone: 'Asia/Shanghai',
      }
    )
    console.log('[SystemJob] Notification sender scheduled (every 30 seconds)')
  }
}

/**
 * 停止系统定时任务
 */
export function stopSystemJobs(): void {
  if (approvalTimeoutTask) {
    approvalTimeoutTask.stop()
    approvalTimeoutTask = null
    console.log('[SystemJob] Approval timeout checker stopped')
  }

  if (notificationTask) {
    notificationTask.stop()
    notificationTask = null
    console.log('[SystemJob] Notification sender stopped')
  }
}

/**
 * 获取调度器实例
 */
export function getScheduler() {
  return scheduler
}

/**
 * 检查调度器是否已初始化
 */
export function isSchedulerInitialized(): boolean {
  return initPromise !== null
}
