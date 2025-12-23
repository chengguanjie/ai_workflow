/**
 * Property-based tests for Sensitive Data Masker
 * 
 * **Feature: security-vulnerabilities-fix**
 * 
 * Tests Property 5: Sensitive Data Masking
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  maskApiKey,
  maskPassword,
  maskEmail,
  mask,
  redactSensitiveFields,
  looksLikeSensitiveValue,
  sanitizeLogMessage,
  DEFAULT_SENSITIVE_KEYS,
} from './sensitive-masker'

/**
 * **Feature: security-vulnerabilities-fix, Property 5: Sensitive Data Masking**
 * **Validates: Requirements 4.3, 4.4**
 * 
 * For any string passed through the masking function, the output SHALL NOT contain
 * the original sensitive content in full, and SHALL preserve only the specified
 * visible portions.
 */
describe('Property 5: Sensitive Data Masking', () => {
  // Arbitrary for generating API key-like strings
  const apiKeyArb = fc.string({ minLength: 10, maxLength: 100 })
    .filter(s => s.length >= 10)

  // Arbitrary for generating password-like strings
  const passwordArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.length > 0)

  // Arbitrary for generating email-like strings
  const emailArb = fc.tuple(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.length > 0 && !s.includes('@')),
    fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.length > 0 && !s.includes('@') && !s.includes('.')),
    fc.constantFrom('com', 'org', 'net', 'io', 'co')
  ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

  // Arbitrary for generating visible portion counts
  const visibleCountArb = fc.integer({ min: 0, max: 10 })

  describe('maskApiKey', () => {
    it('should not contain the full original API key in the output', async () => {
      await fc.assert(
        fc.asyncProperty(
          apiKeyArb,
          async (apiKey) => {
            const masked = maskApiKey(apiKey)
            
            // The masked output should not equal the original
            expect(masked).not.toBe(apiKey)
            
            // The masked output should contain mask characters
            expect(masked).toContain('*')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve only the specified visible portions', async () => {
      await fc.assert(
        fc.asyncProperty(
          apiKeyArb,
          visibleCountArb,
          visibleCountArb,
          async (apiKey, visibleStart, visibleEnd) => {
            // Ensure we have enough characters to mask
            if (apiKey.length <= visibleStart + visibleEnd) {
              // For short keys, should be fully masked
              const masked = maskApiKey(apiKey, visibleStart, visibleEnd)
              expect(masked).toMatch(/^\*+$/)
            } else {
              const masked = maskApiKey(apiKey, visibleStart, visibleEnd)
              
              // Check start portion is preserved
              if (visibleStart > 0) {
                expect(masked.slice(0, visibleStart)).toBe(apiKey.slice(0, visibleStart))
              }
              
              // Check end portion is preserved
              if (visibleEnd > 0) {
                expect(masked.slice(-visibleEnd)).toBe(apiKey.slice(-visibleEnd))
              }
              
              // Check middle is masked
              const middleLength = apiKey.length - visibleStart - visibleEnd
              const maskedMiddle = masked.slice(visibleStart, visibleStart + middleLength)
              expect(maskedMiddle).toBe('*'.repeat(middleLength))
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain the same length as the original', async () => {
      await fc.assert(
        fc.asyncProperty(
          apiKeyArb,
          async (apiKey) => {
            const masked = maskApiKey(apiKey)
            expect(masked.length).toBe(apiKey.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('maskPassword', () => {
    it('should completely mask passwords with fixed length output', async () => {
      await fc.assert(
        fc.asyncProperty(
          passwordArb,
          async (password) => {
            const masked = maskPassword(password)
            
            // Should not contain any original characters
            expect(masked).not.toBe(password)
            
            // Should be all mask characters
            expect(masked).toMatch(/^\*+$/)
            
            // Should be fixed length (8) to not reveal password length
            expect(masked.length).toBe(8)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not reveal password length', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 20, maxLength: 50 }),
          async (shortPassword, longPassword) => {
            const maskedShort = maskPassword(shortPassword)
            const maskedLong = maskPassword(longPassword)
            
            // Both should have the same masked length
            expect(maskedShort.length).toBe(maskedLong.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('maskEmail', () => {
    it('should preserve domain while masking local part', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const masked = maskEmail(email)
            const atIndex = email.indexOf('@')
            const domain = email.slice(atIndex)
            
            // Domain should be preserved
            expect(masked).toContain(domain)
            
            // Should contain mask characters
            expect(masked).toContain('*')
            
            // First character of local part should be preserved
            expect(masked[0]).toBe(email[0])
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not expose full local part of email', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const masked = maskEmail(email)
            const atIndex = email.indexOf('@')
            const localPart = email.slice(0, atIndex)
            
            // If local part is longer than 1 char, it should be partially masked
            if (localPart.length > 1) {
              const maskedLocalPart = masked.slice(0, masked.indexOf('@'))
              expect(maskedLocalPart).not.toBe(localPart)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('mask (generic)', () => {
    it('should mask strings according to visible portion parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 50 }),
          visibleCountArb,
          visibleCountArb,
          async (value, visibleStart, visibleEnd) => {
            const masked = mask(value, visibleStart, visibleEnd)
            
            if (value.length <= visibleStart + visibleEnd) {
              // Short strings should be fully masked
              expect(masked).toMatch(/^\*+$/)
            } else {
              // Check visible portions
              if (visibleStart > 0) {
                expect(masked.slice(0, visibleStart)).toBe(value.slice(0, visibleStart))
              }
              if (visibleEnd > 0) {
                expect(masked.slice(-visibleEnd)).toBe(value.slice(-visibleEnd))
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should fully mask when no visible portions specified', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (value) => {
            const masked = mask(value, 0, 0)
            
            // Should be all mask characters
            expect(masked).toMatch(/^\*+$/)
            expect(masked.length).toBe(value.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('redactSensitiveFields', () => {
    it('should redact all specified sensitive fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (username, password, apiKey) => {
            const obj = {
              username,
              password,
              apiKey,
              config: {
                secret: 'nested-secret',
                token: 'nested-token',
              },
            }
            
            const redacted = redactSensitiveFields(obj)
            
            // Sensitive fields should be redacted
            expect(redacted.password).toBe('[REDACTED]')
            expect(redacted.apiKey).toBe('[REDACTED]')
            expect((redacted.config as Record<string, unknown>).secret).toBe('[REDACTED]')
            expect((redacted.config as Record<string, unknown>).token).toBe('[REDACTED]')
            
            // Non-sensitive fields should be preserved
            expect(redacted.username).toBe(username)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle nested objects recursively', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }),
          async (secretValue) => {
            const obj = {
              level1: {
                level2: {
                  level3: {
                    password: secretValue,
                    safeField: 'visible',
                  },
                },
              },
            }
            
            const redacted = redactSensitiveFields(obj)
            const level3 = (
              (redacted.level1 as Record<string, unknown>).level2 as Record<string, unknown>
            ).level3 as Record<string, unknown>
            
            expect(level3.password).toBe('[REDACTED]')
            expect(level3.safeField).toBe('visible')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should be case-insensitive for sensitive key matching', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }),
          async (value) => {
            const obj = {
              PASSWORD: value,
              Password: value,
              password: value,
              APIKEY: value,
              ApiKey: value,
              apikey: value,
            }
            
            const redacted = redactSensitiveFields(obj)
            
            expect(redacted.PASSWORD).toBe('[REDACTED]')
            expect(redacted.Password).toBe('[REDACTED]')
            expect(redacted.password).toBe('[REDACTED]')
            expect(redacted.APIKEY).toBe('[REDACTED]')
            expect(redacted.ApiKey).toBe('[REDACTED]')
            expect(redacted.apikey).toBe('[REDACTED]')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not modify the original object', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }),
          async (password) => {
            const original = { password, username: 'test' }
            const originalCopy = { ...original }
            
            redactSensitiveFields(original)
            
            // Original should be unchanged
            expect(original.password).toBe(originalCopy.password)
            expect(original.username).toBe(originalCopy.username)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

/**
 * Additional unit tests for edge cases and utility functions
 */
describe('Sensitive Masker Edge Cases', () => {
  describe('empty and null inputs', () => {
    it('maskApiKey should handle empty string', () => {
      expect(maskApiKey('')).toBe('')
    })

    it('maskPassword should handle empty string', () => {
      expect(maskPassword('')).toBe('')
    })

    it('maskEmail should handle empty string', () => {
      expect(maskEmail('')).toBe('')
    })

    it('mask should handle empty string', () => {
      expect(mask('')).toBe('')
    })

    it('redactSensitiveFields should handle null/undefined', () => {
      expect(redactSensitiveFields(null as unknown as Record<string, unknown>)).toBe(null)
      expect(redactSensitiveFields(undefined as unknown as Record<string, unknown>)).toBe(undefined)
    })
  })

  describe('looksLikeSensitiveValue', () => {
    it('should detect common API key patterns', () => {
      expect(looksLikeSensitiveValue('sk-1234567890abcdef1234567890')).toBe(true)
      expect(looksLikeSensitiveValue('pk_test_1234567890abcdef')).toBe(true)
      expect(looksLikeSensitiveValue('ghp_1234567890abcdef1234567890')).toBe(true)
      expect(looksLikeSensitiveValue('xoxb-1234567890-abcdef')).toBe(true)
    })

    it('should detect JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      expect(looksLikeSensitiveValue(jwt)).toBe(true)
    })

    it('should return false for normal strings', () => {
      expect(looksLikeSensitiveValue('hello world')).toBe(false)
      expect(looksLikeSensitiveValue('username')).toBe(false)
      expect(looksLikeSensitiveValue('12345')).toBe(false)
    })
  })

  describe('sanitizeLogMessage', () => {
    it('should mask API keys in log messages', () => {
      const message = 'API call with key sk-1234567890abcdef1234567890abcdef'
      const sanitized = sanitizeLogMessage(message)
      
      expect(sanitized).not.toContain('1234567890abcdef1234567890abcdef')
      expect(sanitized).toContain('sk-1')
    })

    it('should mask bearer tokens', () => {
      const message = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123'
      const sanitized = sanitizeLogMessage(message)
      
      expect(sanitized).toContain('[REDACTED]')
    })

    it('should partially mask email addresses', () => {
      const message = 'User email: john.doe@example.com'
      const sanitized = sanitizeLogMessage(message)
      
      expect(sanitized).toContain('@example.com')
      expect(sanitized).not.toContain('john.doe@')
    })
  })

  describe('DEFAULT_SENSITIVE_KEYS', () => {
    it('should include common sensitive field names', () => {
      expect(DEFAULT_SENSITIVE_KEYS).toContain('password')
      expect(DEFAULT_SENSITIVE_KEYS).toContain('apiKey')
      expect(DEFAULT_SENSITIVE_KEYS).toContain('token')
      expect(DEFAULT_SENSITIVE_KEYS).toContain('secret')
      expect(DEFAULT_SENSITIVE_KEYS).toContain('credential')
    })
  })
})
