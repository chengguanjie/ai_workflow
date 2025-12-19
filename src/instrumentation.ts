/**
 * Next.js Instrumentation
 *
 * 在服务器启动时执行初始化任务
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 仅在 Node.js 运行时执行（排除 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 动态导入以避免客户端打包问题
    const { initializeScheduler } = await import('@/lib/scheduler/init')
    const { executionQueue } = await import('@/lib/workflow/queue')

    // 初始化执行队列（自动检测 Redis 并选择后端）
    await executionQueue.initialize()

    // 初始化调度器
    await initializeScheduler()
  }
}
