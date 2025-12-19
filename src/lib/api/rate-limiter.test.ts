/**
 * Property-based tests for RateLimiter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { 
  RateLimiter, 
  RateLimitConfig, 
  RateLimitResult,
  DEFAULT_RATE_LIMIT_CONFIG,
  createRateLimiter,
  rateLimiters
} from './rate-limiter'

/**
 * **Feature: project-optimization, Property 8: Rate Limit Enforcement**
 * **Validates: Requirements 5.1**
 * 
 * For any client that exceeds the configured rate limit within the time window,
 * subsequent requests SHALL receive 429 status until the window resets.
 */
describe('Property 8: Rate Limit Enforcement', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    // Use a short window for testing
    rateLimiter = new RateLimiter({ windowMs: 1000, maxRequests: 5 })
  })

  afterEach(() => {
    rateLimiter.destroy()
  })

  // Arbitrary for generating valid identifiers
  const identifierArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  // Arbitrary for generating valid rate limit configs
  const configArb = fc.record({
    windowMs: fc.integer({ min: 100, max: 10000 }),
    maxRequests: fc.integer({ min: 1, max: 100 }),
  })

  it('should allow requests up to the configured limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            // Make exactly maxRequests requests
            for (let i = 0; i < config.maxRequests; i++) {
              const result = limiter.check(identifier)
              expect(result.allowed).toBe(true)
            }
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should deny requests after exceeding the limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            // Exhaust the limit
            for (let i = 0; i < config.maxRequests; i++) {
              limiter.check(identifier)
            }

            // Next request should be denied
            const result = limiter.check(identifier)
            expect(result.allowed).toBe(false)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should track different identifiers independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        identifierArb.filter(s => s !== ''),
        configArb,
        async (id1, id2, config) => {
          // Ensure different identifiers
          const identifier1 = `${id1}_1`
          const identifier2 = `${id2}_2`
          
          const limiter = new RateLimiter(config)
          
          try {
            // Exhaust limit for identifier1
            for (let i = 0; i < config.maxRequests; i++) {
              limiter.check(identifier1)
            }

            // identifier1 should be denied
            expect(limiter.check(identifier1).allowed).toBe(false)

            // identifier2 should still be allowed
            expect(limiter.check(identifier2).allowed).toBe(true)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return remaining count that decreases with each request', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        fc.integer({ min: 2, max: 20 }),
        async (identifier, maxRequests) => {
          const limiter = new RateLimiter({ windowMs: 10000, maxRequests })
          
          try {
            let previousRemaining = maxRequests

            for (let i = 0; i < maxRequests; i++) {
              const result = limiter.check(identifier)
              
              // Remaining should decrease (or stay at 0)
              expect(result.remaining).toBeLessThan(previousRemaining)
              previousRemaining = result.remaining
            }

            // After exhausting, remaining should be 0
            const finalResult = limiter.check(identifier)
            expect(finalResult.remaining).toBe(0)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should create 429 response when limit exceeded', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        async (identifier) => {
          const limiter = new RateLimiter({ windowMs: 10000, maxRequests: 1 })
          
          try {
            // Exhaust the limit
            limiter.check(identifier)
            
            // Get denied result
            const result = limiter.check(identifier)
            expect(result.allowed).toBe(false)

            // Create response
            const response = RateLimiter.createRateLimitResponse(result)
            
            expect(response.status).toBe(429)
            
            const body = await response.json()
            expect(body.success).toBe(false)
            expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
            expect(body.error.message).toBe('请求过于频繁')
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: project-optimization, Property 9: Rate Limit Headers Presence**
 * **Validates: Requirements 5.2**
 * 
 * For any API response from a rate-limited endpoint, the response SHALL include
 * X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers
 * with valid numeric values.
 */
describe('Property 9: Rate Limit Headers Presence', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 })
  })

  afterEach(() => {
    rateLimiter.destroy()
  })

  // Arbitrary for generating valid identifiers
  const identifierArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  // Arbitrary for generating valid rate limit configs
  const configArb = fc.record({
    windowMs: fc.integer({ min: 1000, max: 60000 }),
    maxRequests: fc.integer({ min: 1, max: 100 }),
  })

  it('should include all required headers in getHeaders result', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            const result = limiter.check(identifier)
            const headers = RateLimiter.getHeaders(result)

            // All required headers must be present
            expect(headers).toHaveProperty('X-RateLimit-Limit')
            expect(headers).toHaveProperty('X-RateLimit-Remaining')
            expect(headers).toHaveProperty('X-RateLimit-Reset')
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should have valid numeric string values for all headers', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            const result = limiter.check(identifier)
            const headers = RateLimiter.getHeaders(result)

            // All header values should be valid numeric strings
            expect(Number.isInteger(parseInt(headers['X-RateLimit-Limit'], 10))).toBe(true)
            expect(Number.isInteger(parseInt(headers['X-RateLimit-Remaining'], 10))).toBe(true)
            expect(Number.isInteger(parseInt(headers['X-RateLimit-Reset'], 10))).toBe(true)

            // Values should be non-negative
            expect(parseInt(headers['X-RateLimit-Limit'], 10)).toBeGreaterThan(0)
            expect(parseInt(headers['X-RateLimit-Remaining'], 10)).toBeGreaterThanOrEqual(0)
            expect(parseInt(headers['X-RateLimit-Reset'], 10)).toBeGreaterThan(0)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should have X-RateLimit-Limit equal to configured maxRequests', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            const result = limiter.check(identifier)
            const headers = RateLimiter.getHeaders(result)

            expect(parseInt(headers['X-RateLimit-Limit'], 10)).toBe(config.maxRequests)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should have X-RateLimit-Remaining that matches result.remaining', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            const result = limiter.check(identifier)
            const headers = RateLimiter.getHeaders(result)

            expect(parseInt(headers['X-RateLimit-Remaining'], 10)).toBe(result.remaining)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should have X-RateLimit-Reset as a future Unix timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            const nowSeconds = Math.floor(Date.now() / 1000)
            const result = limiter.check(identifier)
            const headers = RateLimiter.getHeaders(result)

            const resetTime = parseInt(headers['X-RateLimit-Reset'], 10)
            
            // Reset time should be in the future (or very close to now)
            expect(resetTime).toBeGreaterThanOrEqual(nowSeconds)
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should apply headers to response correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter(config)
          
          try {
            const result = limiter.check(identifier)
            
            // Create a mock response
            const { NextResponse } = await import('next/server')
            const response = NextResponse.json({ success: true })
            
            // Apply headers
            const responseWithHeaders = RateLimiter.applyHeaders(response, result)

            // Verify headers are present on the response
            expect(responseWithHeaders.headers.get('X-RateLimit-Limit')).toBe(String(result.limit))
            expect(responseWithHeaders.headers.get('X-RateLimit-Remaining')).toBe(String(result.remaining))
            expect(responseWithHeaders.headers.get('X-RateLimit-Reset')).toBe(String(result.resetTime))
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include headers in rate limit error response', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        configArb,
        async (identifier, config) => {
          const limiter = new RateLimiter({ ...config, maxRequests: 1 })
          
          try {
            // Exhaust limit
            limiter.check(identifier)
            
            // Get denied result
            const result = limiter.check(identifier)
            
            // Create error response
            const response = RateLimiter.createRateLimitResponse(result)

            // Verify headers are present
            expect(response.headers.get('X-RateLimit-Limit')).toBe(String(result.limit))
            expect(response.headers.get('X-RateLimit-Remaining')).toBe(String(result.remaining))
            expect(response.headers.get('X-RateLimit-Reset')).toBe(String(result.resetTime))
          } finally {
            limiter.destroy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('RateLimiter utility functions', () => {
  it('should use default config when no config provided', () => {
    const limiter = createRateLimiter()
    const config = limiter.getConfig()
    
    expect(config.windowMs).toBe(DEFAULT_RATE_LIMIT_CONFIG.windowMs)
    expect(config.maxRequests).toBe(DEFAULT_RATE_LIMIT_CONFIG.maxRequests)
    
    limiter.destroy()
  })

  it('should create pre-configured rate limiters correctly', () => {
    const standard = rateLimiters.standard()
    const strict = rateLimiters.strict()
    const relaxed = rateLimiters.relaxed()
    const auth = rateLimiters.auth()

    expect(standard.getConfig().maxRequests).toBe(60)
    expect(strict.getConfig().maxRequests).toBe(10)
    expect(relaxed.getConfig().maxRequests).toBe(200)
    expect(auth.getConfig().maxRequests).toBe(5)

    // Cleanup
    standard.destroy()
    strict.destroy()
    relaxed.destroy()
    auth.destroy()
  })

  it('should reset identifier correctly', () => {
    const limiter = new RateLimiter({ windowMs: 10000, maxRequests: 2 })
    
    // Exhaust limit
    limiter.check('test-id')
    limiter.check('test-id')
    expect(limiter.check('test-id').allowed).toBe(false)

    // Reset
    limiter.reset('test-id')

    // Should be allowed again
    expect(limiter.check('test-id').allowed).toBe(true)

    limiter.destroy()
  })

  it('should clear all records correctly', () => {
    const limiter = new RateLimiter({ windowMs: 10000, maxRequests: 1 })
    
    // Add some records
    limiter.check('id1')
    limiter.check('id2')
    limiter.check('id3')

    expect(limiter.size).toBe(3)

    // Clear all
    limiter.clear()

    expect(limiter.size).toBe(0)

    // All should be allowed again
    expect(limiter.check('id1').allowed).toBe(true)
    expect(limiter.check('id2').allowed).toBe(true)
    expect(limiter.check('id3').allowed).toBe(true)

    limiter.destroy()
  })
})
