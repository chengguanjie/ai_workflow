import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma Client 配置
 *
 * 优化措施：
 * 1. 使用全局单例避免连接泄漏
 * 2. 配置日志以便调试
 * 3. 开发环境启用查询日志
 * 4. 配置连接超时和重试策略
 *
 * 注意：如果遇到连接池超时，请在 DATABASE_URL 中添加参数：
 * ?connection_limit=20&pool_timeout=30&connect_timeout=10
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { level: "error", emit: "stdout" },
            { level: "warn", emit: "stdout" },
            // 开发环境下可启用查询日志来调试慢查询
            // { level: 'query', emit: 'event' },
          ]
        : [{ level: "error", emit: "stdout" }],
    // 数据源配置（可选，主要通过 DATABASE_URL 控制）
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// 确保在开发和生产环境都使用单例
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * 数据库连接健康检查
 * 用于诊断连接问题
 */
export async function checkDatabaseHealth(): Promise<{
  status: "healthy" | "unhealthy";
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    // 执行简单查询测试连接
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;
    return {
      status: "healthy",
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      status: "unhealthy",
      latency,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 带超时的数据库查询包装器
 * 用于防止查询无限等待
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
  operationName: string = "数据库操作",
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName}超时（${timeoutMs}ms）`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 带重试的数据库操作包装器
 * 用于处理临时性连接问题
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    operationName?: string;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    operationName = "数据库操作",
  } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 检查是否是可重试的错误
      const isRetryable =
        lastError.message.includes("Connection") ||
        lastError.message.includes("timeout") ||
        lastError.message.includes("ECONNREFUSED") ||
        lastError.message.includes("Too many connections");

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      console.warn(
        `[Database] ${operationName} 失败 (尝试 ${attempt}/${maxRetries}): ${lastError.message}，${delayMs}ms 后重试...`,
      );

      // 指数退避
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError || new Error(`${operationName}失败`);
}

/**
 * 优雅关闭数据库连接
 */
async function gracefulShutdown() {
  console.log("[Database] 正在关闭 Prisma 连接...");
  try {
    await prisma.$disconnect();
    console.log("[Database] Prisma 连接已关闭");
  } catch (error) {
    console.error("[Database] 关闭连接时出错:", error);
  }
}

// 处理进程退出时关闭连接
process.on("beforeExit", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default prisma;
