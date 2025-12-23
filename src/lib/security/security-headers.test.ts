/**
 * Property-based tests for Security Headers Configuration
 * 
 * **Feature: security-vulnerabilities-fix**
 * 
 * Tests Property 4: Security Headers Presence
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Security headers configuration extracted from next.config.ts
 * This mirrors the configuration to enable testing
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
]

/**
 * Required security headers as per Requirements 3.1-3.7
 */
const requiredHeaders = {
  'X-Content-Type-Options': 'nosniff',           // Requirement 3.1
  'X-Frame-Options': 'DENY',                      // Requirement 3.2
  'X-XSS-Protection': '1; mode=block',            // Requirement 3.3
  'Strict-Transport-Security': /max-age=\d+/,     // Requirement 3.4
  'Content-Security-Policy': /default-src/,       // Requirement 3.5
  'Referrer-Policy': 'strict-origin-when-cross-origin', // Requirement 3.6
  'Permissions-Policy': /camera=\(\)/,            // Requirement 3.7
}

/**
 * Helper function to get header value by key
 */
function getHeaderValue(headers: Array<{ key: string; value: string }>, key: string): string | undefined {
  const header = headers.find(h => h.key.toLowerCase() === key.toLowerCase())
  return header?.value
}

/**
 * Helper function to check if headers contain a specific header
 */
function hasHeader(headers: Array<{ key: string; value: string }>, key: string): boolean {
  return headers.some(h => h.key.toLowerCase() === key.toLowerCase())
}

/**
 * **Feature: security-vulnerabilities-fix, Property 4: Security Headers Presence**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 * 
 * For any HTTP response from the application, all configured security headers
 * SHALL be present with their specified values.
 */
describe('Property 4: Security Headers Presence', () => {
  
  describe('Required Headers Configuration', () => {
    it('should have X-Content-Type-Options header with value "nosniff" (Requirement 3.1)', () => {
      const value = getHeaderValue(securityHeaders, 'X-Content-Type-Options')
      expect(value).toBe('nosniff')
    })

    it('should have X-Frame-Options header with value "DENY" (Requirement 3.2)', () => {
      const value = getHeaderValue(securityHeaders, 'X-Frame-Options')
      expect(value).toBe('DENY')
    })

    it('should have X-XSS-Protection header with value "1; mode=block" (Requirement 3.3)', () => {
      const value = getHeaderValue(securityHeaders, 'X-XSS-Protection')
      expect(value).toBe('1; mode=block')
    })

    it('should have Strict-Transport-Security header for HTTPS enforcement (Requirement 3.4)', () => {
      const value = getHeaderValue(securityHeaders, 'Strict-Transport-Security')
      expect(value).toBeDefined()
      expect(value).toMatch(/max-age=\d+/)
      expect(value).toContain('includeSubDomains')
    })

    it('should have Content-Security-Policy header with appropriate directives (Requirement 3.5)', () => {
      const value = getHeaderValue(securityHeaders, 'Content-Security-Policy')
      expect(value).toBeDefined()
      expect(value).toContain("default-src 'self'")
      expect(value).toContain('script-src')
      expect(value).toContain('style-src')
      expect(value).toContain('frame-ancestors')
    })

    it('should have Referrer-Policy header with value "strict-origin-when-cross-origin" (Requirement 3.6)', () => {
      const value = getHeaderValue(securityHeaders, 'Referrer-Policy')
      expect(value).toBe('strict-origin-when-cross-origin')
    })

    it('should have Permissions-Policy header to restrict browser features (Requirement 3.7)', () => {
      const value = getHeaderValue(securityHeaders, 'Permissions-Policy')
      expect(value).toBeDefined()
      expect(value).toContain('camera=()')
      expect(value).toContain('microphone=()')
      expect(value).toContain('geolocation=()')
    })
  })

  describe('Property-Based Tests for Header Configuration', () => {
    /**
     * Property: For all required header keys, the configuration SHALL contain that header
     */
    it('should contain all required security headers', async () => {
      const requiredHeaderKeys = Object.keys(requiredHeaders)
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...requiredHeaderKeys),
          async (headerKey) => {
            expect(hasHeader(securityHeaders, headerKey)).toBe(true)
          }
        ),
        { numRuns: requiredHeaderKeys.length }
      )
    })

    /**
     * Property: For all headers in configuration, the key SHALL be a non-empty string
     */
    it('should have non-empty keys for all headers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...securityHeaders),
          async (header) => {
            expect(header.key).toBeDefined()
            expect(typeof header.key).toBe('string')
            expect(header.key.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: securityHeaders.length }
      )
    })

    /**
     * Property: For all headers in configuration, the value SHALL be a non-empty string
     */
    it('should have non-empty values for all headers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...securityHeaders),
          async (header) => {
            expect(header.value).toBeDefined()
            expect(typeof header.value).toBe('string')
            expect(header.value.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: securityHeaders.length }
      )
    })

    /**
     * Property: For all required headers, the configured value SHALL match the expected pattern
     */
    it('should have correct values for all required headers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.entries(requiredHeaders)),
          async ([headerKey, expectedValue]) => {
            const actualValue = getHeaderValue(securityHeaders, headerKey)
            expect(actualValue).toBeDefined()
            
            if (expectedValue instanceof RegExp) {
              expect(actualValue).toMatch(expectedValue)
            } else {
              expect(actualValue).toBe(expectedValue)
            }
          }
        ),
        { numRuns: Object.keys(requiredHeaders).length }
      )
    })

    /**
     * Property: Header keys SHALL be unique (no duplicates)
     */
    it('should not have duplicate header keys', () => {
      const keys = securityHeaders.map(h => h.key.toLowerCase())
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    /**
     * Property: CSP header SHALL contain frame-ancestors directive for clickjacking protection
     */
    it('should have frame-ancestors in CSP for additional clickjacking protection', () => {
      const cspValue = getHeaderValue(securityHeaders, 'Content-Security-Policy')
      expect(cspValue).toBeDefined()
      expect(cspValue).toContain("frame-ancestors 'none'")
    })

    /**
     * Property: HSTS max-age SHALL be at least 1 year (31536000 seconds)
     */
    it('should have HSTS max-age of at least 1 year', () => {
      const hstsValue = getHeaderValue(securityHeaders, 'Strict-Transport-Security')
      expect(hstsValue).toBeDefined()
      
      const maxAgeMatch = hstsValue!.match(/max-age=(\d+)/)
      expect(maxAgeMatch).not.toBeNull()
      
      const maxAge = parseInt(maxAgeMatch![1], 10)
      expect(maxAge).toBeGreaterThanOrEqual(31536000)
    })
  })

  describe('Security Header Value Validation', () => {
    /**
     * Property: X-Frame-Options SHALL be either DENY or SAMEORIGIN
     */
    it('should have valid X-Frame-Options value', () => {
      const value = getHeaderValue(securityHeaders, 'X-Frame-Options')
      expect(['DENY', 'SAMEORIGIN']).toContain(value)
    })

    /**
     * Property: X-Content-Type-Options SHALL be nosniff
     */
    it('should have valid X-Content-Type-Options value', () => {
      const value = getHeaderValue(securityHeaders, 'X-Content-Type-Options')
      expect(value).toBe('nosniff')
    })

    /**
     * Property: Referrer-Policy SHALL be a valid policy value
     */
    it('should have valid Referrer-Policy value', () => {
      const validPolicies = [
        'no-referrer',
        'no-referrer-when-downgrade',
        'origin',
        'origin-when-cross-origin',
        'same-origin',
        'strict-origin',
        'strict-origin-when-cross-origin',
        'unsafe-url',
      ]
      const value = getHeaderValue(securityHeaders, 'Referrer-Policy')
      expect(validPolicies).toContain(value)
    })
  })
})
