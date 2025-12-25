/**
 * 调度器初始化模块
 *
 * 用于在应用启动时自动初始化调度器
 */

import cron, { ScheduledTask } from 'node-cron'
import { scheduler } from './index'
import { processAllPendingNotifications } from '@/lib/notifications'

let initPromise: Promise<void> | null = null
let notificationTask: ScheduledTask | null = null

/**
 * 初始化调度器（单例模式）
 * 确保只初始化一次
 */
export async function initializeScheduler(): Promise<void> {
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      console.log('[Scheduler] Starting initialization...')
      await scheduler.initialize()

      initializeSystemJobs()

      console.log('[Scheduler] Initialization completed successfully')
    } catch (error) {
      console.error('[Scheduler] Initialization failed:', error)
      initPromise = null
    }
  })()

  return initPromise
}

/**
 * 初始化系统定时任务
 */
function initializeSystemJobs(): void {
  if (!notificationTask) {
    notificationTask = cron.schedule(
      '*/30 * * * * *',
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
