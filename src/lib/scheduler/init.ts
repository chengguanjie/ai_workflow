/**
 * 调度器初始化模块
 *
 * 用于在应用启动时自动初始化调度器
 */

import { scheduler } from './index'

let initPromise: Promise<void> | null = null

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
