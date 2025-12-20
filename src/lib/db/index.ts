import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma Client 配置
 *
 * 解决连接池问题：
 * 1. 使用全局单例避免连接泄漏
 * 2. 配置日志以便调试
 * 3. 开发环境启用查询日志
 *
 * 注意：如果遇到连接池超时，请在 DATABASE_URL 中添加参数：
 * ?connection_limit=20&pool_timeout=30
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['error', 'warn']
    : ['error'],
})

// 确保在开发和生产环境都使用单例
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

/**
 * 优雅关闭数据库连接
 */
async function gracefulShutdown() {
  console.log('Gracefully shutting down Prisma connection...')
  await prisma.$disconnect()
}

// 处理进程退出时关闭连接
process.on('beforeExit', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

export default prisma
