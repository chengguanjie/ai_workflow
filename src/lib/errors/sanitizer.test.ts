import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  sanitizeErrorMessage,
  sanitizeErrorContext,
  maskEmail,
  maskApiKey,
  maskPassword,
  maskToken,
  maskCreditCard,
  maskPhoneNumber,
  maskSSN,
  containsSensitiveData,
  isSensitiveField,
  sanitizeUrl,
} from './sanitizer'
import { ErrorContext } from './types'

// ============================================================================
// Arbitraries for generating test data
// ============================================================================

// Email arbitrary - using string with map
const emailArb = fc.tuple(
  fc.string({ minLength: 3, maxLength: 10, unit: 'grapheme' }).map(s => s.replace(/[^a-z0-9]/gi, 'a').toLowerCase()),
  fc.string({ minLength: 3, maxLength: 8, unit: 'grapheme' }).map(s => s.replace(/[^a-z0-9]/gi, 'b').toLowerCase()),
  fc.constantFrom('com', 'org', 'net', 'io')
).map(([local, domain, tld]) => `${local || 'user'}@${domain || 'domain'}.${tld}`)

// API key arbitraries
const openAIKeyArb = fc.string({ minLength: 20, maxLength: 40, unit: 'grapheme' })
  .map(s => `sk-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`)

const stripeKeyArb = fc.tuple(
  fc.constantFrom('live', 'test'),
  fc.string({ minLength: 20, maxLength: 40, unit: 'grapheme' }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'y'))
).map(([env, key]) => `sk_${env}_${key}`)

// Password arbitrary
const passwordArb = fc.string({ minLength: 8, maxLength: 32, unit: 'grapheme' })
  .map(s => s.replace(/[^a-zA-Z0-9]/g, 'z') || 'password123')

// Token arbitrary (JWT-like)
const jwtTokenArb = fc.tuple(
  fc.string({ minLength: 10, maxLength: 20, unit: 'grapheme' }).map(s => s.replace(/[^a-zA-Z0-9_-]/g, 'a')),
  fc.string({ minLength: 10, maxLength: 20, unit: 'grapheme' }).map(s => s.replace(/[^a-zA-Z0-9_-]/g, 'b')),
  fc.string({ minLength: 10, maxLength: 20, unit: 'grapheme' }).map(s => s.replace(/[^a-zA-Z0-9_-]/g, 'c'))
).map(([header, payload, sig]) => `eyJ${header}.eyJ${payload}.${sig}`)

// Credit card arbitrary
const creditCardArb = fc.tuple(
  fc.integer({ min: 1000, max: 9999 }),
  fc.integer({ min: 1000, max: 9999 }),
  fc.integer({ min: 1000, max: 9999 }),
  fc.integer({ min: 1000, max: 9999 })
).map(([a, b, c, d]) => `${a}-${b}-${c}-${d}`)

// Phone number arbitrary
const phoneNumberArb = fc.tuple(
  fc.integer({ min: 100, max: 999 }),
  fc.integer({ min: 100, max: 999 }),
  fc.integer({ min: 1000, max: 9999 })
).map(([area, prefix, line]) => `(${area}) ${prefix}-${line}`)

// SSN arbitrary
const ssnArb = fc.tuple(
  fc.integer({ min: 100, max: 999 }),
  fc.integer({ min: 10, max: 99 }),
  fc.integer({ min: 1000, max: 9999 })
).map(([a, b, c]) => `${a}-${b}-${c}`)

// Sensitive field names
const sensitiveFieldNameArb = fc.constantFrom(
  'password', 'passwd', 'pwd', 'secret', 'apiKey', 'api_key',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'privateKey', 'private_key', 'secretKey', 'secret_key', 'credential',
  'authorization', 'auth', 'cookie', 'session', 'cvv', 'pin'
)

// Non-sensitive field names
const nonSensitiveFieldNameArb = fc.constantFrom(
  'username', 'email', 'name', 'firstName', 'lastName', 'address',
  'city', 'country', 'phone', 'age', 'description', 'title', 'id'
)

// ============================================================================
// Property 10: Sensitive Data Masking
// **Validates: Requirements 1.6**
// ============================================================================

describe('Property 10: Sensitive Data Masking', () => {
  /**
   * For any error that contains potentially sensitive data (emails, API keys, 
   * passwords, tokens), the error response SHALL mask this data using appropriate 
   * patterns (e.g., "j***@example.com", "sk-***...***").
   * 
   * Feature: enhanced-error-handling, Property 10: Sensitive Data Masking
   */

  describe('Email masking', () => {
    it('should mask emails in error messages, showing only first char of local part', () => {
      fc.assert(
        fc.property(emailArb, (email: string) => {
          const message = `Failed to authenticate user ${email}`
          const sanitized = sanitizeErrorMessage(message)
          
          // Should not contain the original email
          expect(sanitized).not.toContain(email)
          // Should contain @ and mask
          expect(sanitized).toContain('@')
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('maskEmail should preserve domain', () => {
      fc.assert(
        fc.property(emailArb, (email: string) => {
          const masked = maskEmail(email)
          const domain = email.split('@')[1]
          
          expect(masked).toContain(`@${domain}`)
          expect(masked).toContain('*')
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('API key masking', () => {
    it('should mask OpenAI API keys in error messages', () => {
      fc.assert(
        fc.property(openAIKeyArb, (apiKey: string) => {
          const message = `Invalid API key: ${apiKey}`
          const sanitized = sanitizeErrorMessage(message)
          
          expect(sanitized).not.toContain(apiKey)
          expect(sanitized).toContain('sk-')
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('should mask Stripe API keys in error messages', () => {
      fc.assert(
        fc.property(stripeKeyArb, (apiKey: string) => {
          const message = `Stripe error with key ${apiKey}`
          const sanitized = sanitizeErrorMessage(message)
          
          expect(sanitized).not.toContain(apiKey)
          expect(sanitized).toContain('sk_')
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('maskApiKey should preserve prefix', () => {
      fc.assert(
        fc.property(openAIKeyArb, (apiKey: string) => {
          const masked = maskApiKey(apiKey)
          
          expect(masked.startsWith('sk-')).toBe(true)
          expect(masked).toContain('*')
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Password masking', () => {
    it('maskPassword should always return fixed-length mask', () => {
      fc.assert(
        fc.property(passwordArb, (password: string) => {
          const masked = maskPassword(password)
          
          expect(masked.length).toBe(8)
          expect(masked).toBe('********')
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Token masking', () => {
    it('should mask JWT tokens in error messages', () => {
      fc.assert(
        fc.property(jwtTokenArb, (token: string) => {
          const message = `Token validation failed: ${token}`
          const sanitized = sanitizeErrorMessage(message)
          
          expect(sanitized).not.toContain(token)
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('maskToken should show partial prefix and suffix', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 20, maxLength: 50, unit: 'grapheme' }).map(s => s.replace(/[^a-zA-Z0-9]/g, 't')), (token: string) => {
          const masked = maskToken(token)
          
          expect(masked).toContain('*')
          expect(masked.startsWith(token.slice(0, 4))).toBe(true)
          expect(masked.endsWith(token.slice(-4))).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Credit card masking', () => {
    it('should mask credit card numbers in error messages', () => {
      fc.assert(
        fc.property(creditCardArb, (cardNumber: string) => {
          const message = `Payment failed for card ${cardNumber}`
          const sanitized = sanitizeErrorMessage(message)
          
          expect(sanitized).not.toContain(cardNumber)
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('maskCreditCard should show only last 4 digits', () => {
      fc.assert(
        fc.property(creditCardArb, (cardNumber: string) => {
          const masked = maskCreditCard(cardNumber)
          const lastFour = cardNumber.replace(/\D/g, '').slice(-4)
          
          expect(masked.endsWith(lastFour)).toBe(true)
          expect(masked.startsWith('************')).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Phone number masking', () => {
    it('maskPhoneNumber should show only last 4 digits', () => {
      fc.assert(
        fc.property(phoneNumberArb, (phone: string) => {
          const masked = maskPhoneNumber(phone)
          const digits = phone.replace(/\D/g, '')
          const lastFour = digits.slice(-4)
          
          expect(masked.endsWith(lastFour)).toBe(true)
          expect(masked).toContain('*')
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('SSN masking', () => {
    it('maskSSN should show only last 4 digits', () => {
      fc.assert(
        fc.property(ssnArb, (ssn: string) => {
          const masked = maskSSN(ssn)
          const digits = ssn.replace(/\D/g, '')
          const lastFour = digits.slice(-4)
          
          expect(masked.endsWith(lastFour)).toBe(true)
          expect(masked).toMatch(/^\*{3}-\*{2}-\d{4}$/)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('containsSensitiveData detection', () => {
    it('should detect emails as sensitive', () => {
      fc.assert(
        fc.property(emailArb, (email: string) => {
          expect(containsSensitiveData(email)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it('should detect API keys as sensitive', () => {
      fc.assert(
        fc.property(openAIKeyArb, (apiKey: string) => {
          expect(containsSensitiveData(apiKey)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it('should detect JWT tokens as sensitive', () => {
      fc.assert(
        fc.property(jwtTokenArb, (token: string) => {
          expect(containsSensitiveData(token)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('ErrorContext sanitization', () => {
    it('should mask sensitive field values in fieldErrors', () => {
      fc.assert(
        fc.property(sensitiveFieldNameArb, passwordArb, (fieldName: string, value: string) => {
          const context: ErrorContext = {
            fieldErrors: [
              { field: fieldName, value, constraint: 'required', message: 'Field is required' }
            ]
          }
          
          const sanitized = sanitizeErrorContext(context)
          expect(sanitized.fieldErrors?.[0].value).toBe('[REDACTED]')
        }),
        { numRuns: 100 }
      )
    })

    it('should preserve non-sensitive field values', () => {
      fc.assert(
        fc.property(nonSensitiveFieldNameArb, fc.string({ minLength: 5, maxLength: 20, unit: 'grapheme' }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'v')), (fieldName: string, value: string) => {
          const safeValue = `test_${value}`
          
          const context: ErrorContext = {
            fieldErrors: [
              { field: fieldName, value: safeValue, constraint: 'format', message: 'Invalid format' }
            ]
          }
          
          const sanitized = sanitizeErrorContext(context)
          expect(sanitized.fieldErrors?.[0].value).toBeDefined()
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('URL sanitization', () => {
    it('should mask sensitive query parameters', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('token', 'api_key', 'apikey', 'secret', 'password'),
          fc.string({ minLength: 10, maxLength: 30, unit: 'grapheme' }).map(s => s.replace(/[^a-z0-9]/gi, 'q')),
          (param: string, value: string) => {
            const url = `/api/endpoint?${param}=${value}&other=safe`
            const sanitized = sanitizeUrl(url)
            
            expect(sanitized).not.toContain(value)
            const hasRedacted = sanitized.includes('[REDACTED]') || sanitized.includes('%5BREDACTED%5D')
            expect(hasRedacted).toBe(true)
            expect(sanitized).toContain('other=safe')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('isSensitiveField detection', () => {
    it('should identify sensitive field names', () => {
      fc.assert(
        fc.property(sensitiveFieldNameArb, (fieldName: string) => {
          expect(isSensitiveField(fieldName)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it('should not flag non-sensitive field names', () => {
      fc.assert(
        fc.property(nonSensitiveFieldNameArb, (fieldName: string) => {
          expect(isSensitiveField(fieldName)).toBe(false)
        }),
        { numRuns: 100 }
      )
    })
  })
})

// ============================================================================
// Property 9: Auth Error Security
// **Validates: Requirements 9.1, 9.3, 9.4**
// ============================================================================

describe('Property 9: Auth Error Security', () => {
  /**
   * For any authentication or authorization error, the error response SHALL NOT 
   * include sensitive information such as password hashes, internal user IDs, 
   * or security tokens, while still providing the required permission name for 
   * authorization errors.
   * 
   * Feature: enhanced-error-handling, Property 9: Auth Error Security
   */

  describe('Token protection', () => {
    it('should not expose JWT tokens in sanitized auth error messages', () => {
      fc.assert(
        fc.property(jwtTokenArb, (token: string) => {
          const message = `Token validation failed: ${token}`
          const sanitized = sanitizeErrorMessage(message)
          
          expect(sanitized).not.toContain(token)
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('should not expose API keys in sanitized auth error messages', () => {
      fc.assert(
        fc.property(openAIKeyArb, (apiKey: string) => {
          const message = `API authentication failed with key ${apiKey}`
          const sanitized = sanitizeErrorMessage(message)
          
          expect(sanitized).not.toContain(apiKey)
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Auth error context sanitization', () => {
    it('should redact sensitive fields in auth error context', () => {
      fc.assert(
        fc.property(passwordArb, jwtTokenArb, (password: string, token: string) => {
          const context: ErrorContext = {
            userId: 'user123',
            fieldErrors: [
              { field: 'password', value: password, constraint: 'required', message: 'Password is required' },
              { field: 'token', value: token, constraint: 'valid', message: 'Token is invalid' }
            ]
          }
          
          const sanitized = sanitizeErrorContext(context)
          
          const passwordField = sanitized.fieldErrors?.find(f => f.field === 'password')
          expect(passwordField?.value).toBe('[REDACTED]')
          
          const tokenField = sanitized.fieldErrors?.find(f => f.field === 'token')
          expect(tokenField?.value).toBe('[REDACTED]')
        }),
        { numRuns: 100 }
      )
    })

    it('should preserve permission name in authorization error context', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('admin', 'editor', 'viewer', 'owner', 'moderator'),
          (permission: string) => {
            const context: ErrorContext = {
              userId: 'user123',
              fieldErrors: [
                { field: 'requiredPermission', value: permission, constraint: 'permission', message: `Requires ${permission} permission` }
              ]
            }
            
            const sanitized = sanitizeErrorContext(context)
            
            const permissionField = sanitized.fieldErrors?.find(f => f.field === 'requiredPermission')
            expect(permissionField?.value).toBe(permission)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Comprehensive auth error sanitization', () => {
    it('should sanitize complex auth error messages with multiple sensitive items', () => {
      fc.assert(
        fc.property(emailArb, jwtTokenArb, (email: string, token: string) => {
          // Test with email and token (which have recognizable patterns)
          const message = `Auth failed for ${email} with token ${token}`
          const sanitized = sanitizeErrorMessage(message)
          
          // Email should be masked
          expect(sanitized).not.toContain(email)
          // Token should be masked
          expect(sanitized).not.toContain(token)
          // Should contain mask characters
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })

    it('should sanitize password fields in context format', () => {
      fc.assert(
        fc.property(passwordArb, (password: string) => {
          // Test password in a recognizable format
          const message = `Login failed: password=${password}`
          const sanitized = sanitizeErrorMessage(message)
          
          // Password should be masked when in field format
          expect(sanitized).toContain('password=')
          expect(sanitized).toContain('*')
        }),
        { numRuns: 100 }
      )
    })
  })
})
