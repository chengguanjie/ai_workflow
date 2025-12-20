/**
 * Cache utilities for performance optimization
 * 
 * Provides Redis-based caching with fallback to in-memory cache
 */

import { getRedisConnection, isRedisConfigured } from '@/lib/redis'

const CACHE_PREFIX = 'ai_workflow:'

const memoryCache = new Map<string, { value: string; expiresAt: number }>()

function cleanExpiredMemoryCache() {
  const now = Date.now()
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key)
    }
  }
}

setInterval(cleanExpiredMemoryCache, 60000)

export async function cacheGet<T>(key: string): Promise<T | null> {
  const fullKey = CACHE_PREFIX + key
  
  if (isRedisConfigured()) {
    const redis = getRedisConnection()
    if (redis) {
      try {
        const value = await redis.get(fullKey)
        if (value) {
          return JSON.parse(value) as T
        }
      } catch (error) {
        console.error('[Cache] Redis get error:', error)
      }
    }
  }
  
  const entry = memoryCache.get(fullKey)
  if (entry && entry.expiresAt > Date.now()) {
    return JSON.parse(entry.value) as T
  }
  
  return null
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  const fullKey = CACHE_PREFIX + key
  const serialized = JSON.stringify(value)
  
  if (isRedisConfigured()) {
    const redis = getRedisConnection()
    if (redis) {
      try {
        await redis.setex(fullKey, ttlSeconds, serialized)
        return
      } catch (error) {
        console.error('[Cache] Redis set error:', error)
      }
    }
  }
  
  memoryCache.set(fullKey, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export async function cacheDel(key: string): Promise<void> {
  const fullKey = CACHE_PREFIX + key
  
  if (isRedisConfigured()) {
    const redis = getRedisConnection()
    if (redis) {
      try {
        await redis.del(fullKey)
      } catch (error) {
        console.error('[Cache] Redis del error:', error)
      }
    }
  }
  
  memoryCache.delete(fullKey)
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const fullPattern = CACHE_PREFIX + pattern
  
  if (isRedisConfigured()) {
    const redis = getRedisConnection()
    if (redis) {
      try {
        const keys = await redis.keys(fullPattern)
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } catch (error) {
        console.error('[Cache] Redis del pattern error:', error)
      }
    }
  }
  
  const regexPattern = new RegExp(
    '^' + fullPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  )
  for (const key of memoryCache.keys()) {
    if (regexPattern.test(key)) {
      memoryCache.delete(key)
    }
  }
}

export function permissionCacheKey(userId: string, workflowId: string): string {
  return `perm:${userId}:${workflowId}`
}

export function permissionPatternByWorkflow(workflowId: string): string {
  return `perm:*:${workflowId}`
}

export function permissionPatternByUser(userId: string): string {
  return `perm:${userId}:*`
}

export const CACHE_TTL = {
  PERMISSION: 300,
  TEMPLATE_LIST: 60,
  USER_INFO: 600,
} as const
