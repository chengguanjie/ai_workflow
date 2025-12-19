/**
 * Rate Limiter for API endpoints
 * 
 * Implements a sliding window rate limiting algorithm using in-memory storage.
 * Provides configurable limits per endpoint or endpoint group.
 */

import { NextResponse } from 'next/server'
import { RateLimitError, ApiErrorResponse } from '@/lib/errors'

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number
  /** Maximum number of requests allowed in the window */
  maxRequests: number
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Maximum requests allowed in the window */
  limit: number
  /** Remaining requests in the current window */
  remaining: number
  /** Unix timestamp (seconds) when the window resets */
  resetTime: number
}

/**
 * Rate limit headers to include in responses
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string
  'X-RateLimit-Remaining': string
  'X-RateLimit-Reset': string
}

/**
 * Internal record for tracking requests
 */
interface RequestRecord {
  /** Timestamps of requests within the window */
  timestamps: number[]
}

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,     // 60 requests per minute
}

/**
 * RateLimiter class implementing sliding window rate limiting
 * 
 * Uses an in-memory store to track request timestamps per identifier.
 * The sliding window algorithm counts requests within the last windowMs
 * milliseconds, providing smoother rate limiting than fixed windows.
 */
export class RateLimiter {
  private readonly config: RateLimitConfig
  private readonly store: Map<string, RequestRecord>
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Creates a new RateLimiter instance
   * 
   * @param config - Rate limit configuration
   */
  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...config,
    }
    this.store = new Map()
    
    // Start periodic cleanup to prevent memory leaks
    this.startCleanup()
  }

  /**
   * Checks if a request is allowed for the given identifier
   * 
   * @param identifier - Unique identifier for the client (e.g., IP, user ID)
   * @returns RateLimitResult indicating if request is allowed and limit info
   */
  check(identifier: string): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    const resetTime = Math.ceil((now + this.config.windowMs) / 1000)

    // Get or create record for this identifier
    let record = this.store.get(identifier)
    
    if (!record) {
      record = { timestamps: [] }
      this.store.set(identifier, record)
    }

    // Remove timestamps outside the current window (sliding window)
    record.timestamps = record.timestamps.filter(ts => ts > windowStart)

    // Calculate remaining requests
    const currentCount = record.timestamps.length
    const remaining = Math.max(0, this.config.maxRequests - currentCount)
    const allowed = currentCount < this.config.maxRequests

    // If allowed, record this request
    if (allowed) {
      record.timestamps.push(now)
    }

    return {
      allowed,
      limit: this.config.maxRequests,
      remaining: allowed ? remaining - 1 : 0,
      resetTime,
    }
  }

  /**
   * Generates rate limit headers from a check result
   * 
   * @param result - The rate limit check result
   * @returns Headers object with rate limit information
   */
  static getHeaders(result: RateLimitResult): RateLimitHeaders {
    return {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(result.resetTime),
    }
  }

  /**
   * Applies rate limit headers to a NextResponse
   * 
   * @param response - The response to add headers to
   * @param result - The rate limit check result
   * @returns The response with rate limit headers added
   */
  static applyHeaders<T>(
    response: NextResponse<T>,
    result: RateLimitResult
  ): NextResponse<T> {
    const headers = RateLimiter.getHeaders(result)
    
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    
    return response
  }

  /**
   * Creates a 429 Too Many Requests response with rate limit headers
   * 
   * @param result - The rate limit check result
   * @returns NextResponse with 429 status and rate limit headers
   */
  static createRateLimitResponse(result: RateLimitResult): NextResponse<ApiErrorResponse> {
    const error = new RateLimitError()
    const response = NextResponse.json(error.toJSON(), { status: 429 })
    
    return RateLimiter.applyHeaders(response, result)
  }

  /**
   * Resets the rate limit for a specific identifier
   * 
   * @param identifier - The identifier to reset
   */
  reset(identifier: string): void {
    this.store.delete(identifier)
  }

  /**
   * Clears all rate limit records
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * Gets the current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config }
  }

  /**
   * Gets the number of tracked identifiers
   */
  get size(): number {
    return this.store.size
  }

  /**
   * Starts periodic cleanup of expired records
   */
  private startCleanup(): void {
    // Clean up every window duration
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, this.config.windowMs)
  }

  /**
   * Removes expired records from the store
   */
  private cleanup(): void {
    const now = Date.now()
    const windowStart = now - this.config.windowMs

    for (const [identifier, record] of this.store.entries()) {
      // Filter out old timestamps
      record.timestamps = record.timestamps.filter(ts => ts > windowStart)
      
      // Remove empty records
      if (record.timestamps.length === 0) {
        this.store.delete(identifier)
      }
    }
  }

  /**
   * Stops the cleanup interval (for testing/cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clear()
  }
}

/**
 * Creates a rate limiter middleware for API routes
 * 
 * @param config - Rate limit configuration
 * @param getIdentifier - Function to extract identifier from request
 * @returns Middleware function that checks rate limits
 * 
 * @example
 * ```typescript
 * const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 })
 * 
 * export const GET = async (request: NextRequest) => {
 *   const identifier = request.ip || 'anonymous'
 *   const result = rateLimiter.check(identifier)
 *   
 *   if (!result.allowed) {
 *     return RateLimiter.createRateLimitResponse(result)
 *   }
 *   
 *   const response = ApiResponse.success({ data: 'ok' })
 *   return RateLimiter.applyHeaders(response, result)
 * }
 * ```
 */
export function createRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter(config)
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  /** Standard API rate limit: 60 requests per minute */
  standard: () => createRateLimiter({ windowMs: 60000, maxRequests: 60 }),
  
  /** Strict rate limit: 10 requests per minute (for sensitive endpoints) */
  strict: () => createRateLimiter({ windowMs: 60000, maxRequests: 10 }),
  
  /** Relaxed rate limit: 200 requests per minute (for high-traffic endpoints) */
  relaxed: () => createRateLimiter({ windowMs: 60000, maxRequests: 200 }),
  
  /** Auth rate limit: 5 requests per minute (for login/register) */
  auth: () => createRateLimiter({ windowMs: 60000, maxRequests: 5 }),
}
