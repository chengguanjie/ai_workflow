/**
 * Enhanced API Response Tests
 * 
 * Property-based tests for the EnhancedApiResponse class.
 * Tests validation error field details and error severity classification.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  EnhancedApiResponse,
  generateRequestId,
  getSeverityFromStatusCode,
  createEnhancedErrorResponse,
} from './enhanced-api-response'
import {
  DatabaseError,
  ExternalServiceError,
} from '@/lib/errors/enhanced-errors'
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  InternalError,
} from '@/lib/errors'
import { FieldError, ErrorSeverity, isEnhancedErrorResponse } from '@/lib/errors/types'
import { ZodError, ZodIssue } from 'zod'

// ============================================================================
// Arbitraries for generating test data
// ============================================================================

const fieldNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
const constraintArb = fc.constantFrom('required', 'minLength', 'maxLength', 'pattern', 'email', 'url', 'min', 'max')
const messageArb = fc.string({ minLength: 1, maxLength: 200 })

const fieldErrorArb: fc.Arbitrary<FieldError> = fc.record({
  field: fieldNameArb,
  constraint: constraintArb,
  message: messageArb,
})

const fieldErrorsArb = fc.array(fieldErrorArb, { minLength: 1, maxLength: 10 })

const severityArb = fc.constantFrom<ErrorSeverity>('info', 'warning', 'error', 'critical')

// Helper to parse response body synchronously
async function parseResponseBody(response: Response): Promise<unknown> {
  return response.json()
}

// ============================================================================
// Property 4: Validation Error Field Details
// **Validates: Requirements 3.3**
// ============================================================================

describe('Property 4: Validation Error Field Details', () => {
  /**
   * For any validation error with field-specific issues, the error response 
   * SHALL include a fieldErrors array where each entry contains the field name 
   * and constraint that was violated.
   */

  it('validationError should include fieldErrors array with field and constraint', async () => {
    await fc.assert(
      fc.asyncProperty(
        fieldErrorsArb,
        messageArb,
        async (fieldErrors, message) => {
          const response = EnhancedApiResponse.validationError(fieldErrors, message)
          const data = await parseResponseBody(new Response(response.body)) as { 
            success: boolean
            error: { 
              code: string
              context?: { fieldErrors?: Array<{ field: string; constraint: string; message: string }> }
            }
          }
          
          expect(data.success).toBe(false)
          expect(data.error.code).toBe('VALIDATION_ERROR')
          expect(data.error.context).toBeDefined()
          expect(data.error.context?.fieldErrors).toBeDefined()
          expect(Array.isArray(data.error.context?.fieldErrors)).toBe(true)
          expect(data.error.context?.fieldErrors?.length).toBe(fieldErrors.length)
          
          // Each field error should have field and constraint
          for (let i = 0; i < fieldErrors.length; i++) {
            const fe = data.error.context?.fieldErrors?.[i]
            expect(fe?.field).toBe(fieldErrors[i].field)
            expect(fe?.constraint).toBe(fieldErrors[i].constraint)
            expect(typeof fe?.message).toBe('string')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('fromError with ZodError should include fieldErrors with field and constraint', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            path: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
            message: messageArb,
            code: fc.constantFrom<string>('invalid_type', 'too_small', 'too_big', 'invalid_string'),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (issues) => {
          // Create a ZodError with the generated issues
          const zodIssues: ZodIssue[] = issues.map(issue => ({
            path: issue.path,
            message: issue.message,
            code: issue.code,
          } as ZodIssue))
          
          const zodError = new ZodError(zodIssues)
          const response = EnhancedApiResponse.fromError(zodError)
          
          const data = await parseResponseBody(new Response(response.body)) as {
            success: boolean
            error: {
              code: string
              context?: { fieldErrors?: Array<{ field: string; constraint: string }> }
            }
          }
          
          expect(data.success).toBe(false)
          expect(data.error.code).toBe('VALIDATION_ERROR')
          expect(data.error.context).toBeDefined()
          expect(data.error.context?.fieldErrors).toBeDefined()
          expect(Array.isArray(data.error.context?.fieldErrors)).toBe(true)
          expect(data.error.context?.fieldErrors?.length).toBe(issues.length)
          
          // Each field error should have field (path joined) and constraint (code)
          for (let i = 0; i < issues.length; i++) {
            const fe = data.error.context?.fieldErrors?.[i]
            expect(fe?.field).toBe(issues[i].path.join('.'))
            expect(fe?.constraint).toBe(issues[i].code)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('validation error response should have 400 status code', () => {
    fc.assert(
      fc.property(
        fieldErrorsArb,
        (fieldErrors) => {
          const response = EnhancedApiResponse.validationError(fieldErrors)
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('validation error should have warning severity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fieldErrorsArb,
        async (fieldErrors) => {
          const response = EnhancedApiResponse.validationError(fieldErrors)
          const data = await parseResponseBody(new Response(response.body)) as {
            error: { severity: string }
          }
          expect(data.error.severity).toBe('warning')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 11: Error Severity Classification
// **Validates: Requirements 10.3**
// ============================================================================

describe('Property 11: Error Severity Classification', () => {
  /**
   * For any error in the system, it SHALL be assigned a severity level from 
   * the set {info, warning, error, critical} based on its category and impact.
   */

  const validSeverities: ErrorSeverity[] = ['info', 'warning', 'error', 'critical']

  it('getSeverityFromStatusCode should return valid severity for any status code', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }),
        (statusCode) => {
          const severity = getSeverityFromStatusCode(statusCode)
          expect(validSeverities).toContain(severity)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('5xx errors should have error or critical severity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 599 }),
        (statusCode) => {
          const severity = getSeverityFromStatusCode(statusCode)
          expect(['error', 'critical']).toContain(severity)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('503 Service Unavailable should have critical severity', () => {
    const severity = getSeverityFromStatusCode(503)
    expect(severity).toBe('critical')
  })

  it('4xx errors should have warning severity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 499 }),
        (statusCode) => {
          const severity = getSeverityFromStatusCode(statusCode)
          expect(severity).toBe('warning')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('DatabaseError should have appropriate severity based on type', () => {
    // Connection errors should be critical
    const connectionError = DatabaseError.connection()
    expect(connectionError.severity).toBe('critical')
    
    // Other database errors should be error severity
    const queryError = DatabaseError.query()
    expect(queryError.severity).toBe('error')
    
    const timeoutError = DatabaseError.timeout()
    expect(timeoutError.severity).toBe('error')
  })

  it('ExternalServiceError.permanent should have critical severity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('OpenAI', 'Stripe', 'AWS'),
        (serviceName) => {
          const error = ExternalServiceError.permanent(serviceName)
          expect(error.severity).toBe('critical')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('EnhancedApiResponse.fromError should preserve severity from EnhancedAppError', async () => {
    await fc.assert(
      fc.asyncProperty(
        messageArb,
        fc.constantFrom('OpenAI', 'Stripe', 'AWS'),
        fc.boolean(),
        async (message, serviceName, isTemporary) => {
          const error = isTemporary 
            ? ExternalServiceError.temporary(serviceName, 30, message)
            : ExternalServiceError.permanent(serviceName, message)
          
          const response = EnhancedApiResponse.fromError(error)
          const data = await parseResponseBody(new Response(response.body)) as {
            error: { severity: string }
          }
          
          expect(validSeverities).toContain(data.error.severity)
          expect(data.error.severity).toBe(error.severity)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('createEnhancedErrorResponse should use provided severity or derive from catalog/status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('VALIDATION_ERROR', 'AUTHENTICATION_ERROR', 'INTERNAL_ERROR'),
        messageArb,
        fc.integer({ min: 400, max: 599 }),
        severityArb,
        async (code, message, statusCode, severity) => {
          // With explicit severity
          const responseWithSeverity = createEnhancedErrorResponse({
            code,
            message,
            statusCode,
            severity,
          })
          
          const data = await parseResponseBody(new Response(responseWithSeverity.body)) as {
            error: { severity: string }
          }
          
          expect(data.error.severity).toBe(severity)
          expect(validSeverities).toContain(data.error.severity)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('all error responses should have a valid severity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // ValidationError
          fc.record({ type: fc.constant('validation'), message: messageArb }),
          // AuthenticationError
          fc.record({ type: fc.constant('authentication'), message: messageArb }),
          // AuthorizationError
          fc.record({ type: fc.constant('authorization'), message: messageArb }),
          // NotFoundError
          fc.record({ type: fc.constant('notfound'), message: messageArb }),
          // InternalError
          fc.record({ type: fc.constant('internal'), message: messageArb })
        ),
        async (errorSpec) => {
          let error
          switch (errorSpec.type) {
            case 'validation':
              error = new ValidationError(errorSpec.message)
              break
            case 'authentication':
              error = new AuthenticationError(errorSpec.message)
              break
            case 'authorization':
              error = new AuthorizationError(errorSpec.message)
              break
            case 'notfound':
              error = new NotFoundError(errorSpec.message)
              break
            case 'internal':
              error = new InternalError(errorSpec.message)
              break
          }
          
          const response = EnhancedApiResponse.fromError(error)
          const data = await parseResponseBody(new Response(response.body)) as {
            error: { severity: string }
          }
          
          expect(validSeverities).toContain(data.error.severity)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Additional Tests: Request ID Generation
// ============================================================================

describe('Request ID Generation', () => {
  it('generateRequestId should return unique IDs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }),
        (count) => {
          const ids = new Set<string>()
          for (let i = 0; i < count; i++) {
            ids.add(generateRequestId())
          }
          // All IDs should be unique
          expect(ids.size).toBe(count)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('generateRequestId should return non-empty string starting with req_', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const id = generateRequestId()
          expect(id.length).toBeGreaterThan(0)
          expect(id.startsWith('req_')).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('error responses should include requestId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fieldErrorsArb,
        async (fieldErrors) => {
          const response = EnhancedApiResponse.validationError(fieldErrors)
          const data = await parseResponseBody(new Response(response.body)) as {
            error: { requestId: string }
          }
          
          expect(data.error.requestId).toBeDefined()
          expect(typeof data.error.requestId).toBe('string')
          expect(data.error.requestId.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('error responses should include timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fieldErrorsArb,
        async (fieldErrors) => {
          const response = EnhancedApiResponse.validationError(fieldErrors)
          const data = await parseResponseBody(new Response(response.body)) as {
            error: { timestamp: string }
          }
          
          expect(data.error.timestamp).toBeDefined()
          // Should be valid ISO string
          const date = new Date(data.error.timestamp)
          expect(date.toISOString()).toBe(data.error.timestamp)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Additional Tests: Enhanced Error Response Structure
// ============================================================================

describe('Enhanced Error Response Structure', () => {
  it('all error responses should conform to EnhancedErrorResponse structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        messageArb,
        fc.constantFrom('connection', 'constraint', 'timeout', 'query') as fc.Arbitrary<'connection' | 'constraint' | 'timeout' | 'query'>,
        async (message, dbErrorType) => {
          const error = new DatabaseError(message, { dbErrorType })
          const response = EnhancedApiResponse.fromError(error)
          
          const data = await parseResponseBody(new Response(response.body))
          
          expect(isEnhancedErrorResponse(data)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('fromError should handle standard Error instances', async () => {
    await fc.assert(
      fc.asyncProperty(
        messageArb,
        async (message) => {
          const error = new Error(message)
          const response = EnhancedApiResponse.fromError(error)
          
          expect(response.status).toBe(500)
          
          const data = await parseResponseBody(new Response(response.body)) as {
            success: boolean
            error: { code: string }
          }
          
          expect(data.success).toBe(false)
          expect(data.error.code).toBe('INTERNAL_ERROR')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('fromError should handle unknown error types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ custom: fc.string() })
        ),
        async (unknownError) => {
          const response = EnhancedApiResponse.fromError(unknownError)
          
          expect(response.status).toBe(500)
          
          const data = await parseResponseBody(new Response(response.body)) as {
            success: boolean
            error: { code: string }
          }
          
          expect(data.success).toBe(false)
          expect(data.error.code).toBe('INTERNAL_ERROR')
        }
      ),
      { numRuns: 100 }
    )
  })
})
