import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  TimeoutError,
  InternalError,
  BusinessError,
  isAppError,
  createValidationError,
  ApiErrorResponse,
} from './index'

/**
 * **Feature: project-optimization, Property 1: Standardized Error Response Format**
 * **Validates: Requirements 1.1, 1.4**
 * 
 * For any API route handler that throws an error, the response SHALL always be 
 * a JSON object with `success: false` and an `error` object containing at least 
 * a `message` field, with appropriate HTTP status code.
 */
describe('Property 1: Standardized Error Response Format', () => {
  // All error classes that extend AppError
  const errorClasses = [
    { Class: ValidationError, expectedCode: 'VALIDATION_ERROR', expectedStatus: 400 },
    { Class: AuthenticationError, expectedCode: 'AUTHENTICATION_ERROR', expectedStatus: 401 },
    { Class: AuthorizationError, expectedCode: 'AUTHORIZATION_ERROR', expectedStatus: 403 },
    { Class: NotFoundError, expectedCode: 'NOT_FOUND', expectedStatus: 404 },
    { Class: ConflictError, expectedCode: 'CONFLICT', expectedStatus: 409 },
    { Class: RateLimitError, expectedCode: 'RATE_LIMIT_EXCEEDED', expectedStatus: 429 },
    { Class: TimeoutError, expectedCode: 'EXECUTION_TIMEOUT', expectedStatus: 408 },
    { Class: InternalError, expectedCode: 'INTERNAL_ERROR', expectedStatus: 500 },
    { Class: BusinessError, expectedCode: 'BUSINESS_ERROR', expectedStatus: 422 },
  ]

  // Arbitrary for generating error messages
  const messageArb = fc.string({ minLength: 1, maxLength: 200 })
  
  // Arbitrary for generating error details (can be any JSON-serializable value)
  const detailsArb = fc.oneof(
    fc.constant(undefined),
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.array(fc.string()),
    fc.dictionary(fc.string(), fc.string())
  )

  it('should always return success: false for any error', () => {
    fc.assert(
      fc.property(
        messageArb,
        detailsArb,
        fc.constantFrom(...errorClasses),
        (message, details, { Class }) => {
          const error = new Class(message, details)
          const response = error.toJSON()
          
          expect(response.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should always include error object with message field', () => {
    fc.assert(
      fc.property(
        messageArb,
        detailsArb,
        fc.constantFrom(...errorClasses),
        (message, details, { Class }) => {
          const error = new Class(message, details)
          const response = error.toJSON()
          
          expect(response.error).toBeDefined()
          expect(typeof response.error).toBe('object')
          expect(response.error.message).toBe(message)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include error code in response', () => {
    fc.assert(
      fc.property(
        messageArb,
        detailsArb,
        fc.constantFrom(...errorClasses),
        (message, details, { Class, expectedCode }) => {
          const error = new Class(message, details)
          const response = error.toJSON()
          
          expect(response.error.code).toBe(expectedCode)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should have appropriate HTTP status code for each error type', () => {
    fc.assert(
      fc.property(
        messageArb,
        detailsArb,
        fc.constantFrom(...errorClasses),
        (message, details, { Class, expectedStatus }) => {
          const error = new Class(message, details)
          
          expect(error.statusCode).toBe(expectedStatus)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve details when provided', () => {
    fc.assert(
      fc.property(
        messageArb,
        fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
        fc.constantFrom(...errorClasses),
        (message, details, { Class }) => {
          const error = new Class(message, details)
          const response = error.toJSON()
          
          expect(response.error.details).toEqual(details)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should conform to ApiErrorResponse interface structure', () => {
    fc.assert(
      fc.property(
        messageArb,
        detailsArb,
        fc.constantFrom(...errorClasses),
        (message, details, { Class }) => {
          const error = new Class(message, details)
          const response: ApiErrorResponse = error.toJSON()
          
          // Type check - if this compiles, the structure is correct
          const isValidStructure = 
            response.success === false &&
            typeof response.error === 'object' &&
            typeof response.error.message === 'string'
          
          expect(isValidStructure).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Error class behavior', () => {
  it('isAppError should correctly identify AppError instances', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (message) => {
          const validationError = new ValidationError(message)
          const authError = new AuthenticationError(message)
          const regularError = new Error(message)
          
          expect(isAppError(validationError)).toBe(true)
          expect(isAppError(authError)).toBe(true)
          expect(isAppError(regularError)).toBe(false)
          expect(isAppError(null)).toBe(false)
          expect(isAppError(undefined)).toBe(false)
          expect(isAppError(message)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('createValidationError should create ValidationError with field details', () => {
    const fieldArb = fc.record({
      field: fc.string({ minLength: 1, maxLength: 50 }),
      message: fc.string({ minLength: 1, maxLength: 200 }),
    })

    fc.assert(
      fc.property(
        fc.array(fieldArb, { minLength: 1, maxLength: 10 }),
        (fields) => {
          const error = createValidationError(fields)
          
          expect(error).toBeInstanceOf(ValidationError)
          expect(error.statusCode).toBe(400)
          expect(error.code).toBe('VALIDATION_ERROR')
          expect(error.details).toEqual(fields)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('all errors should be instances of Error and AppError', () => {
    const errorClasses = [
      ValidationError,
      AuthenticationError,
      AuthorizationError,
      NotFoundError,
      ConflictError,
      RateLimitError,
      TimeoutError,
      InternalError,
      BusinessError,
    ]

    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.constantFrom(...errorClasses),
        (message, ErrorClass) => {
          const error = new ErrorClass(message)
          
          expect(error).toBeInstanceOf(Error)
          expect(error).toBeInstanceOf(AppError)
          expect(error.message).toBe(message)
          expect(error.name).toBe(ErrorClass.name)
        }
      ),
      { numRuns: 100 }
    )
  })
})
