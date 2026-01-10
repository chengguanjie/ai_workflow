/**
 * Global Rate Limiting Middleware
 * 
 * Implements rate limiting for all API endpoints using the existing RateLimiter class.
 * Different endpoints have different rate limits based on sensitivity.
 * 
 * Requirements: 5.1, 5.2, 5.5
 */

import { NextResponse, type NextRequest } from 'next/server'
import { RateLimiter, RateLimitConfig, RateLimitResult } from '@/lib/api/rate-limiter'

/**
 * Rate limit configuration for different endpoint types
 */
export interface EndpointRateLimitConfig {
  /** Pattern to match the endpoint path */
  pattern: RegExp
  /** Rate limit configuration for this endpoint */
  config: RateLimitConfig
  /** Optional name for logging/debugging */
  name?: string
}

/**
 * Middleware configuration
 */
export interface RateLimitMiddlewareConfig {
  /** Endpoint-specific rate limit configurations */
  endpoints: EndpointRateLimitConfig[]
  /** Default rate limit configuration */
  defaultConfig: RateLimitConfig
  /** Paths to skip rate limiting (whitelist) */
  whitelist: (string | RegExp)[]
  /** Whether rate limiting is enabled */
  enabled: boolean
}

/**
 * Default middleware configuration
 * 
 * Rate limits per Requirements 5.2:
 * - Auth endpoints: 5 requests per minute
 * - Standard API endpoints: 60 requests per minute
 * - Relaxed endpoints (health, public): 200 requests per minute
 */
const DEFAULT_MIDDLEWARE_CONFIG: RateLimitMiddlewareConfig = {
  enabled: true,
  endpoints: [
    // Task/execution polling - relaxed rate limiting (180/min)
    // These endpoints are frequently polled by the UI during workflow runs.
    {
      pattern: /^\/api\/(tasks|executions)(\/|$)/,
      config: { windowMs: 60000, maxRequests: 180 },
      name: 'polling',
    },
    // Settings endpoints - relaxed rate limiting (180/min)
    // Settings pages may load multiple resources (members/departments/org) concurrently.
    {
      pattern: /^\/api\/settings(\/|$)/,
      config: { windowMs: 60000, maxRequests: 180 },
      name: 'settings',
    },
    // Auth endpoints - strict rate limiting (5/min)
    {
      pattern: /^\/api\/auth\/(register|change-password)/,
      config: { windowMs: 60000, maxRequests: 5 },
      name: 'auth',
    },
    // Console auth endpoints - strict rate limiting (5/min)
    {
      pattern: /^\/api\/console\/auth\//,
      config: { windowMs: 60000, maxRequests: 5 },
      name: 'console-auth',
    },
    // AI endpoints - moderate rate limiting (30/min)
    {
      pattern: /^\/api\/(ai|ai-assistant)\//,
      config: { windowMs: 60000, maxRequests: 30 },
      name: 'ai',
    },
    // Code execution - strict rate limiting (10/min)
    {
      pattern: /^\/api\/code\/execute/,
      config: { windowMs: 60000, maxRequests: 10 },
      name: 'code-execution',
    },
    // File upload - moderate rate limiting (20/min)
    {
      pattern: /^\/api\/files/,
      config: { windowMs: 60000, maxRequests: 20 },
      name: 'files',
    },
    // Health check - relaxed rate limiting (200/min)
    {
      pattern: /^\/api\/health/,
      config: { windowMs: 60000, maxRequests: 200 },
      name: 'health',
    },
    // Public endpoints - relaxed rate limiting (200/min)
    {
      pattern: /^\/api\/public\//,
      config: { windowMs: 60000, maxRequests: 200 },
      name: 'public',
    },
    // Webhooks - relaxed rate limiting (200/min)
    {
      pattern: /^\/api\/webhooks\//,
      config: { windowMs: 60000, maxRequests: 200 },
      name: 'webhooks',
    },
  ],
  defaultConfig: {
    windowMs: 60000,  // 1 minute
    maxRequests: 60,  // 60 requests per minute
  },
  whitelist: [
    // NextAuth.js session/auth routes should not be rate limited
    // These are called frequently by the client for session management
    /^\/api\/auth\/(session|csrf|providers|signin|signout|callback|error|verify-request)/,
    // Static assets
    /^\/_next\//,
    /^\/favicon\.ico$/,
    /^\/icon\.svg$/,
  ],
}

// Store rate limiters per endpoint type to maintain state
// Use Redis-based limiter if available, otherwise fall back to in-memory
const rateLimiters = new Map<string, RateLimiter | import('@/lib/api/rate-limiter-redis').RedisRateLimiter>()

/**
 * Gets or creates a rate limiter for the given configuration
 * Uses Redis-based limiter if Redis is available, otherwise falls back to in-memory
 */
async function getRateLimiter(
  name: string,
  config: RateLimitConfig
): Promise<RateLimiter | import('@/lib/api/rate-limiter-redis').RedisRateLimiter> {
  const key = `${name}-${config.windowMs}-${config.maxRequests}`
  
  if (!rateLimiters.has(key)) {
    // Try to use Redis-based limiter if Redis is available
    try {
      const { isRedisConfigured } = await import('@/lib/redis')
      const { createRedisRateLimiter } = await import('@/lib/api/rate-limiter-redis')
      
      if (isRedisConfigured()) {
        const redisLimiter = createRedisRateLimiter(config, `ratelimit:${name}:`)
        rateLimiters.set(key, redisLimiter)
        return redisLimiter
      }
    } catch (_error) {
      // Redis not available, fall back to in-memory
      // Silently fail - in-memory limiter will be used
    }
    
    // Fall back to in-memory limiter
    rateLimiters.set(key, new RateLimiter(config))
  }
  
  return rateLimiters.get(key)!
}

/**
 * Extracts client IP address from the request
 * 
 * Checks multiple headers in order of preference:
 * 1. x-forwarded-for (standard proxy header)
 * 2. x-real-ip (nginx)
 * 3. cf-connecting-ip (Cloudflare)
 * 4. Falls back to 'anonymous' if no IP found
 * 
 * Requirements: 5.5
 */
export function getClientIP(request: NextRequest): string {
  // Prefer Next.js-provided IP when available (works in more environments than headers alone)
  if (request.ip) return request.ip

  // Check x-forwarded-for header (may contain multiple IPs)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take the first IP (original client)
    const firstIP = forwardedFor.split(',')[0].trim()
    if (firstIP) return firstIP
  }
  
  // Check x-real-ip header
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP.trim()
  
  // Check Cloudflare header
  const cfIP = request.headers.get('cf-connecting-ip')
  if (cfIP) return cfIP.trim()
  
  // Fallback to anonymous
  return 'anonymous'
}

/**
 * Checks if a path matches any pattern in the whitelist
 */
function isWhitelisted(pathname: string, whitelist: (string | RegExp)[]): boolean {
  return whitelist.some(pattern => {
    if (typeof pattern === 'string') {
      return pathname === pattern || pathname.startsWith(pattern)
    }
    return pattern.test(pathname)
  })
}

/**
 * Finds the matching endpoint configuration for a path
 */
function findEndpointConfig(
  pathname: string,
  endpoints: EndpointRateLimitConfig[]
): EndpointRateLimitConfig | null {
  return endpoints.find(endpoint => endpoint.pattern.test(pathname)) || null
}

/**
 * Creates rate limit headers for the response
 */
function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers()
  headers.set('X-RateLimit-Limit', String(result.limit))
  headers.set('X-RateLimit-Remaining', String(result.remaining))
  headers.set('X-RateLimit-Reset', String(result.resetTime))
  return headers
}

/**
 * Creates a 429 Too Many Requests response
 */
function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const headers = createRateLimitHeaders(result)
  
  return new NextResponse(
    JSON.stringify({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': headers.get('X-RateLimit-Limit')!,
        'X-RateLimit-Remaining': headers.get('X-RateLimit-Remaining')!,
        'X-RateLimit-Reset': headers.get('X-RateLimit-Reset')!,
        'Retry-After': String(Math.ceil((result.resetTime * 1000 - Date.now()) / 1000)),
      },
    }
  )
}

/**
 * Applies rate limit headers to an existing response
 */
function applyRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(result.limit))
  response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  response.headers.set('X-RateLimit-Reset', String(result.resetTime))
  return response
}

/**
 * Main middleware function
 * 
 * Implements global rate limiting for API endpoints.
 * 
 * Requirements:
 * - 5.1: Check rate limits before processing requests
 * - 5.2: Apply different limits based on endpoint sensitivity
 * - 5.5: Use client IP as identifier
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const config = DEFAULT_MIDDLEWARE_CONFIG
  
  // Skip rate limiting if disabled
  if (!config.enabled) {
    return NextResponse.next()
  }
  
  // Skip non-API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  
  // Skip whitelisted paths
  if (isWhitelisted(pathname, config.whitelist)) {
    return NextResponse.next()
  }
  
  // Get client identifier (IP address)
  const clientIP = getClientIP(request)
  
  // Find matching endpoint configuration
  const endpointConfig = findEndpointConfig(pathname, config.endpoints)
  
  // Use endpoint-specific or default rate limit
  const rateLimitConfig = endpointConfig?.config || config.defaultConfig
  const rateLimiterName = endpointConfig?.name || 'default'
  
  // Get or create rate limiter (may be async if using Redis)
  const rateLimiter = await getRateLimiter(rateLimiterName, rateLimitConfig)
  
  // Create unique identifier combining IP and endpoint type
  const identifier = `${clientIP}:${rateLimiterName}`
  
  // Check rate limit (Redis limiter returns Promise)
  const result = 'check' in rateLimiter && typeof rateLimiter.check === 'function'
    ? await (rateLimiter.check(identifier) as Promise<RateLimitResult>)
    : (rateLimiter as RateLimiter).check(identifier)
  
  // If rate limit exceeded, return 429 response
  if (!result.allowed) {
    return createRateLimitResponse(result)
  }
  
  // Continue with the request and add rate limit headers
  const response = NextResponse.next()
  return applyRateLimitHeaders(response, result)
}

/**
 * Middleware configuration
 * 
 * Only run middleware on API routes to avoid unnecessary overhead
 */
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
}

/**
 * Utility function to clear all rate limiters (for testing)
 */
export async function clearAllRateLimiters(): Promise<void> {
  for (const limiter of rateLimiters.values()) {
    if ('destroy' in limiter && typeof limiter.destroy === 'function') {
      limiter.destroy()
    } else if ('clear' in limiter && typeof limiter.clear === 'function') {
      await (limiter.clear() as Promise<void>)
    }
  }
  rateLimiters.clear()
}

/**
 * Utility function to get rate limiter stats (for monitoring)
 */
export function getRateLimiterStats(): Record<string, { size: number; config: RateLimitConfig; usingRedis?: boolean }> {
  const stats: Record<string, { size: number; config: RateLimitConfig; usingRedis?: boolean }> = {}
  
  rateLimiters.forEach((limiter, key) => {
    const isRedis = 'isUsingRedis' in limiter && typeof limiter.isUsingRedis === 'function'
      ? limiter.isUsingRedis()
      : false
    
    stats[key] = {
      size: 'size' in limiter ? limiter.size : 0,
      config: limiter.getConfig(),
      usingRedis: isRedis,
    }
  })
  
  return stats
}
