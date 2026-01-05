/**
 * Next.js Instrumentation
 *
 * 在服务器启动时执行初始化任务
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 仅在 Node.js 运行时执行（排除 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 配置全局 HTTP 代理（如果环境变量中有设置）
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
                     process.env.HTTP_PROXY || process.env.http_proxy
    if (proxyUrl) {
      try {
        const { setGlobalDispatcher, ProxyAgent } = await import('undici')
        const agent = new ProxyAgent(proxyUrl)
        setGlobalDispatcher(agent)
        console.log(`[Proxy] 全局代理已配置: ${proxyUrl}`)
      } catch (error) {
        console.error('[Proxy] 代理配置失败:', error)
      }
    }

    // 动态导入以避免客户端打包问题
    const { initializeScheduler } = await import('@/lib/scheduler/init')
    const { executionQueue } = await import('@/lib/workflow/queue')

    // 初始化执行队列（自动检测 Redis 并选择后端）
    await executionQueue.initialize()

    // 初始化调度器
    await initializeScheduler()
  }
}
