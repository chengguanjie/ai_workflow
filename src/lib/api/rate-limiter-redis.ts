/**
 * Redis-based Rate Limiter for API endpoints
 * 
 * Implements a sliding window rate limiting algorithm using Redis storage.
 * This allows rate limiting to work across multiple server instances in a
 * distributed deployment.
 * 
 * Falls back to in-memory storage if Redis is not available.
 * 
 * @module api/rate-limiter-redis
 */

import { RateLimitConfig, RateLimitResult } from './rate-limiter'
import { getRedisConnection } from '@/lib/redis'
import { RateLimiter } from './rate-limiter'

/**
 * Redis-based rate limiter that supports distributed deployments
 */
export class RedisRateLimiter {
  private readonly config: RateLimitConfig
  private readonly redisKeyPrefix: string
  private readonly fallbackLimiter: RateLimiter
  private redis: ReturnType<typeof getRedisConnection> | null = null

  /**
   * Creates a new Redis-based rate limiter
   * 
   * @param config - Rate limit configuration
   * @param keyPrefix - Prefix for Redis keys (default: 'ratelimit:')
   */
  constructor(config: Partial<RateLimitConfig> = {}, keyPrefix = 'ratelimit:') {
    this.config = {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60,     // 60 requests per minute
      ...config,
    }
    this.redisKeyPrefix = keyPrefix
    this.fallbackLimiter = new RateLimiter(this.config)
    
    // Try to get Redis connection
    try {
      this.redis = getRedisConnection()
    } catch (error) {
      // Redis not available, will use fallback
      this.redis = null
    }
  }

  /**
   * Checks if a request is allowed for the given identifier
   * 
   * @param identifier - Unique identifier for the client (e.g., IP, user ID)
   * @returns RateLimitResult indicating if request is allowed and limit info
   */
  async check(identifier: string): Promise<RateLimitResult> {
    // If Redis is not available, use in-memory fallback
    if (!this.redis) {
      return this.fallbackLimiter.check(identifier)
    }

    try {
      return await this.checkWithRedis(identifier)
    } catch (error) {
      // If Redis fails, fall back to in-memory storage
      console.warn('[RateLimiter] Redis check failed, using fallback:', error)
      return this.fallbackLimiter.check(identifier)
    }
  }

  /**
   * Checks rate limit using Redis
   */
  private async checkWithRedis(identifier: string): Promise<RateLimitResult> {
    if (!this.redis) {
      throw new Error('Redis not available')
    }

    const now = Date.now()
    const windowStart = now - this.config.windowMs
    const resetTime = Math.ceil((now + this.config.windowMs) / 1000)
    const key = `${this.redisKeyPrefix}${identifier}`

    // Get all timestamps for this identifier
    const timestamps = await this.redis.zrangebyscore(
      key,
      windowStart,
      '+inf',
      'WITHSCORES'
    )

    // Parse timestamps (Redis returns [value, score, value, score, ...])
    const requestTimestamps: number[] = []
    for (let i = 1; i < timestamps.length; i += 2) {
      requestTimestamps.push(parseInt(timestamps[i] as string, 10))
    }

    // Filter timestamps within the current window
    const validTimestamps = requestTimestamps.filter(ts => ts > windowStart)
    const currentCount = validTimestamps.length
    const remaining = Math.max(0, this.config.maxRequests - currentCount)
    const allowed = currentCount < this.config.maxRequests

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline()

    if (allowed) {
      // Add current request timestamp
      pipeline.zadd(key, now, `${now}-${Math.random()}`)
    }

    // Remove old timestamps outside the window
    pipeline.zremrangebyscore(key, '-inf', windowStart)

    // Set expiration to window duration + 1 second (cleanup buffer)
    pipeline.expire(key, Math.ceil(this.config.windowMs / 1000) + 1)

    // Execute pipeline
    await pipeline.exec()

    return {
      allowed,
      limit: this.config.maxRequests,
      remaining: allowed ? remaining - 1 : 0,
      resetTime,
    }
  }

  /**
   * Resets the rate limit for a specific identifier
   * 
   * @param identifier - The identifier to reset
   */
  async reset(identifier: string): Promise<void> {
    if (this.redis) {
      try {
        const key = `${this.redisKeyPrefix}${identifier}`
        await this.redis.del(key)
      } catch (error) {
        console.warn('[RateLimiter] Redis reset failed:', error)
      }
    }
    this.fallbackLimiter.reset(identifier)
  }

  /**
   * Clears all rate limit records
   */
  async clear(): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.redisKeyPrefix}*`)
        if (keys.length > 0) {
          await this.redis.del(...keys)
        }
      } catch (error) {
        console.warn('[RateLimiter] Redis clear failed:', error)
      }
    }
    this.fallbackLimiter.clear()
  }

  /**
   * Gets the current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config }
  }

  /**
   * Checks if Redis is being used
   */
  isUsingRedis(): boolean {
    return this.redis !== null
  }
}

/**
 * Creates a Redis-based rate limiter
 * 
 * @param config - Rate limit configuration
 * @param keyPrefix - Prefix for Redis keys
 * @returns RedisRateLimiter instance
 */
export function createRedisRateLimiter(
  config?: Partial<RateLimitConfig>,
  keyPrefix?: string
): RedisRateLimiter {
  return new RedisRateLimiter(config, keyPrefix)
}

/**
 * Pre-configured Redis rate limiters for common use cases
 */
export const redisRateLimiters = {
  /** Standard API rate limit: 60 requests per minute */
  standard: () => createRedisRateLimiter({ windowMs: 60000, maxRequests: 60 }),
  
  /** Strict rate limit: 10 requests per minute (for sensitive endpoints) */
  strict: () => createRedisRateLimiter({ windowMs: 60000, maxRequests: 10 }),
  
  /** Relaxed rate limit: 200 requests per minute (for high-traffic endpoints) */
  relaxed: () => createRedisRateLimiter({ windowMs: 60000, maxRequests: 200 }),
  
  /** Auth rate limit: 5 requests per minute (for login/register) */
  auth: () => createRedisRateLimiter({ windowMs: 60000, maxRequests: 5 }),
}
