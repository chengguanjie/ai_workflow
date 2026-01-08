/**
 * Redis 连接管理
 *
 * 支持通过 REDIS_URL 或分开的配置项连接 Redis
 * 用于 BullMQ 任务队列
 */

import type RedisClient from 'ioredis'

/**
 * Redis 连接配置
 */
export interface RedisConfig {
  host: string
  port: number
  password?: string
  db?: number
  maxRetriesPerRequest?: number | null
}

function loadRedisCtor(): typeof import('ioredis') {
  // Avoid bundling/initializing ioredis at module load time (Next route compilation may choke on it).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('ioredis') as any
  return (mod?.default || mod) as typeof import('ioredis')
}

/**
 * 解析 Redis 配置
 */
function getRedisConfig(): RedisConfig | null {
  // 优先使用 REDIS_URL
  const redisUrl = process.env.REDIS_URL

  if (redisUrl) {
    try {
      const url = new URL(redisUrl)
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: url.pathname ? parseInt(url.pathname.slice(1)) || 0 : 0,
        maxRetriesPerRequest: null, // BullMQ 需要这个设置
      }
    } catch {
      console.warn('[Redis] Invalid REDIS_URL, trying individual config')
    }
  }

  // 尝试使用分开的配置
  const host = process.env.REDIS_HOST
  const port = process.env.REDIS_PORT

  if (host) {
    return {
      host,
      port: parseInt(port || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: null,
    }
  }

  return null
}

/**
 * 检查 Redis 是否已配置
 */
export function isRedisConfigured(): boolean {
  return getRedisConfig() !== null
}

/**
 * 创建 Redis 连接
 */
export function createRedisConnection(): Redis | null {
  const config = getRedisConfig()

  if (!config) {
    return null
  }

  const RedisCtor = loadRedisCtor() as any
  const redis = new RedisCtor({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryStrategy: (times: number) => {
      if (times > 10) {
        console.error('[Redis] Max retries reached, giving up')
        return null
      }
      // 指数退避，最多 30 秒
      return Math.min(times * 1000, 30000)
    },
    lazyConnect: true, // 延迟连接，直到第一次使用
  })

  redis.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message)
  })

  redis.on('connect', () => {
    console.log('[Redis] Connected successfully')
  })

  redis.on('close', () => {
    console.log('[Redis] Connection closed')
  })

  return redis
}

// 全局单例
const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined
}

/**
 * 获取 Redis 连接单例
 */
export function getRedisConnection(): Redis | null {
  if (globalForRedis.redis === undefined) {
    globalForRedis.redis = createRedisConnection()
  }
  return globalForRedis.redis
}

/**
 * 关闭 Redis 连接
 */
export async function closeRedisConnection(): Promise<void> {
  if (globalForRedis.redis) {
    await globalForRedis.redis.quit()
    globalForRedis.redis = null
  }
}

export type Redis = RedisClient
