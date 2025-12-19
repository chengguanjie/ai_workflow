/**
 * Property-based tests for withValidation validation wrapper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  withValidation,
  validateRequestBody,
  validateQueryParams,
  ValidationErrorDetail,
} from './with-validation'

/**
 * **Feature: project-optimization, Property 4: Schema Validation Before Processing**
 * **Validates: Requirements 2.1**
 * 
 * For any API endpoint with Zod validation, the request body SHALL be validated 
 * against the schema before the handler logic executes, and invalid requests 
 * SHALL never reach the handler.
 */
describe('Property 4: Schema Validation Before Processing', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // Test schema for validation
  const testSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    age: z.number().int().positive('Age must be positive'),
    email: z.string().email('Invalid email format'),
  })

  // Arbitrary for generating valid emails that pass Zod's stricter validation
  // Zod's email validation is stricter than RFC, so we generate safer emails
  const zodSafeEmailArb = fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/), // local part: starts with letter, alphanumeric
    fc.stringMatching(/^[a-z]{2,10}$/), // domain name
    fc.constantFrom('com', 'org', 'net', 'io', 'co') // TLD
  ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

  // Arbitrary for generating valid data that matches the schema
  const validDataArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    age: fc.integer({ min: 1, max: 150 }),
    email: zodSafeEmailArb,
  })

  // Arbitrary for generating invalid data (missing required fields)
  const invalidDataArb = fc.oneof(
    // Missing name
    fc.record({
      age: fc.integer({ min: 1, max: 150 }),
      email: fc.emailAddress(),
    }),
    // Missing age
    fc.record({
      name: fc.string({ minLength: 1 }),
      email: fc.emailAddress(),
    }),
    // Missing email
    fc.record({
      name: fc.string({ minLength: 1 }),
      age: fc.integer({ min: 1, max: 150 }),
    }),
    // Empty object
    fc.constant({}),
    // Invalid types
    fc.record({
      name: fc.constant(123), // should be string
      age: fc.constant('not a number'), // should be number
      email: fc.constant('not-an-email'), // should be valid email
    })
  )

  it('should call handler with validated data for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDataArb,
        async (validData) => {
          let handlerCalled = false
          let receivedData: unknown = null

          const handler = withValidation(
            testSchema,
            async (data, _request) => {
              handlerCalled = true
              receivedData = data
              return NextResponse.json({ success: true })
            }
          )

          const request = new NextRequest('http://localhost:3000/api/test', {
            method: 'POST',
            body: JSON.stringify(validData),
            headers: { 'content-type': 'application/json' },
          })

          const response = await handler(request)
          const body = await response.json()

          // Handler should be called for valid data
          expect(handlerCalled).toBe(true)
          expect(receivedData).toEqual(validData)
          expect(body.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should never call handler for any invalid input', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidDataArb,
        async (invalidData) => {
          let handlerCalled = false

          const handler = withValidation(
            testSchema,
            async (_data, _request) => {
              handlerCalled = true
              return NextResponse.json({ success: true })
            }
          )

          const request = new NextRequest('http://localhost:3000/api/test', {
            method: 'POST',
            body: JSON.stringify(invalidData),
            headers: { 'content-type': 'application/json' },
          })

          const response = await handler(request)
          const body = await response.json()

          // Handler should NEVER be called for invalid data
          expect(handlerCalled).toBe(false)
          expect(response.status).toBe(400)
          expect(body.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return 400 status for any invalid JSON body', async () => {
    const invalidJsonStrings = [
      '{invalid json}',
      '{"unclosed": ',
      'not json at all',
      '',
    ]

    for (const invalidJson of invalidJsonStrings) {
      let handlerCalled = false

      const handler = withValidation(
        testSchema,
        async (_data, _request) => {
          handlerCalled = true
          return NextResponse.json({ success: true })
        }
      )

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        body: invalidJson,
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(request)
      const body = await response.json()

      expect(handlerCalled).toBe(false)
      expect(response.status).toBe(400)
      expect(body.success).toBe(false)
    }
  })

  it('should validate query params when source is query', async () => {
    const querySchema = z.object({
      page: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().min(1).max(100),
    })

    // Valid query params
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 100 }),
        async (page, limit) => {
          let handlerCalled = false
          let receivedData: unknown = null

          const handler = withValidation(
            querySchema,
            async (data, _request) => {
              handlerCalled = true
              receivedData = data
              return NextResponse.json({ success: true })
            },
            { source: 'query' }
          )

          const url = new URL('http://localhost:3000/api/test')
          url.searchParams.set('page', String(page))
          url.searchParams.set('limit', String(limit))

          const request = new NextRequest(url, { method: 'GET' })
          await handler(request)

          expect(handlerCalled).toBe(true)
          expect(receivedData).toEqual({ page, limit })
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: project-optimization, Property 2: Validation Error Details**
 * **Validates: Requirements 1.2, 2.2**
 * 
 * For any invalid request body submitted to a validated endpoint, the error 
 * response SHALL contain field-level error information indicating which fields 
 * failed validation and why.
 */
describe('Property 2: Validation Error Details', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // Schema with multiple fields for testing field-level errors
  const multiFieldSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    email: z.string().email('Invalid email format'),
    age: z.number().int().min(18, 'Must be at least 18 years old'),
  })

  // Arbitrary for generating data with specific invalid fields
  const dataWithInvalidFieldsArb = fc.record({
    username: fc.oneof(
      fc.constant(''), // too short
      fc.constant('ab'), // too short
      fc.string({ maxLength: 2 }), // too short
    ),
    password: fc.string({ maxLength: 7 }), // too short
    email: fc.string().filter(s => !s.includes('@')), // invalid email
    age: fc.integer({ min: -100, max: 17 }), // too young
  })

  it('should include field path in error details for any invalid field', async () => {
    await fc.assert(
      fc.asyncProperty(
        dataWithInvalidFieldsArb,
        async (invalidData) => {
          const handler = withValidation(
            multiFieldSchema,
            async (_data, _request) => {
              return NextResponse.json({ success: true })
            }
          )

          const request = new NextRequest('http://localhost:3000/api/test', {
            method: 'POST',
            body: JSON.stringify(invalidData),
            headers: { 'content-type': 'application/json' },
          })

          const response = await handler(request)
          const body = await response.json()

          expect(response.status).toBe(400)
          expect(body.success).toBe(false)
          expect(body.error).toBeDefined()
          expect(body.error.details).toBeDefined()
          expect(Array.isArray(body.error.details)).toBe(true)
          
          // Each error detail should have field and message
          const details = body.error.details as ValidationErrorDetail[]
          expect(details.length).toBeGreaterThan(0)
          
          for (const detail of details) {
            expect(detail).toHaveProperty('field')
            expect(detail).toHaveProperty('message')
            expect(typeof detail.field).toBe('string')
            expect(typeof detail.message).toBe('string')
            expect(detail.message.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include specific field name for single field validation errors', async () => {
    // Test each field individually
    const singleFieldTests = [
      { data: { username: '', password: 'validpass123', email: 'test@example.com', age: 25 }, expectedField: 'username' },
      { data: { username: 'validuser', password: 'short', email: 'test@example.com', age: 25 }, expectedField: 'password' },
      { data: { username: 'validuser', password: 'validpass123', email: 'invalid-email', age: 25 }, expectedField: 'email' },
      { data: { username: 'validuser', password: 'validpass123', email: 'test@example.com', age: 10 }, expectedField: 'age' },
    ]

    for (const { data, expectedField } of singleFieldTests) {
      const handler = withValidation(
        multiFieldSchema,
        async (_data, _request) => {
          return NextResponse.json({ success: true })
        }
      )

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      const details = body.error.details as ValidationErrorDetail[]
      const fieldNames = details.map(d => d.field)
      expect(fieldNames).toContain(expectedField)
    }
  })

  it('should include error message explaining why validation failed', async () => {
    const schemaWithCustomMessages = z.object({
      name: z.string().min(1, 'Name cannot be empty'),
      count: z.number().positive('Count must be a positive number'),
    })

    const handler = withValidation(
      schemaWithCustomMessages,
      async (_data, _request) => {
        return NextResponse.json({ success: true })
      }
    )

    // Test with empty name
    const request1 = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: '', count: 5 }),
      headers: { 'content-type': 'application/json' },
    })

    const response1 = await handler(request1)
    const body1 = await response1.json()
    const details1 = body1.error.details as ValidationErrorDetail[]
    const nameError = details1.find(d => d.field === 'name')
    expect(nameError).toBeDefined()
    expect(nameError!.message).toBe('Name cannot be empty')

    // Test with negative count
    const request2 = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', count: -5 }),
      headers: { 'content-type': 'application/json' },
    })

    const response2 = await handler(request2)
    const body2 = await response2.json()
    const details2 = body2.error.details as ValidationErrorDetail[]
    const countError = details2.find(d => d.field === 'count')
    expect(countError).toBeDefined()
    expect(countError!.message).toBe('Count must be a positive number')
  })

  it('should handle nested object validation errors with dot-notation paths', async () => {
    const nestedSchema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string().min(1, 'Name is required'),
          age: z.number().positive('Age must be positive'),
        }),
      }),
    })

    const handler = withValidation(
      nestedSchema,
      async (_data, _request) => {
        return NextResponse.json({ success: true })
      }
    )

    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({
        user: {
          profile: {
            name: '',
            age: -5,
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await handler(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    const details = body.error.details as ValidationErrorDetail[]
    const fieldPaths = details.map(d => d.field)
    
    // Should include nested paths with dot notation
    expect(fieldPaths.some(p => p.includes('user.profile.name'))).toBe(true)
    expect(fieldPaths.some(p => p.includes('user.profile.age'))).toBe(true)
  })

  it('should handle array validation errors with index in path', async () => {
    const arraySchema = z.object({
      items: z.array(z.object({
        id: z.number().positive('ID must be positive'),
        name: z.string().min(1, 'Name is required'),
      })),
    })

    const handler = withValidation(
      arraySchema,
      async (_data, _request) => {
        return NextResponse.json({ success: true })
      }
    )

    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { id: 1, name: 'valid' },
          { id: -1, name: '' }, // invalid
        ],
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await handler(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    const details = body.error.details as ValidationErrorDetail[]
    const fieldPaths = details.map(d => d.field)
    
    // Should include array index in path
    expect(fieldPaths.some(p => p.includes('items.1'))).toBe(true)
  })
})

describe('validateRequestBody helper', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  const schema = z.object({
    name: z.string().min(1),
  })

  it('should return validated data for valid input', async () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      headers: { 'content-type': 'application/json' },
    })

    const data = await validateRequestBody(request, schema)
    expect(data).toEqual({ name: 'test' })
  })

  it('should throw ValidationError for invalid input', async () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
      headers: { 'content-type': 'application/json' },
    })

    await expect(validateRequestBody(request, schema)).rejects.toThrow()
  })
})

describe('validateQueryParams helper', () => {
  const schema = z.object({
    page: z.coerce.number().int().positive(),
  })

  it('should return validated data for valid query params', () => {
    const url = new URL('http://localhost:3000/api/test?page=5')
    const request = new NextRequest(url)

    const data = validateQueryParams(request, schema)
    expect(data).toEqual({ page: 5 })
  })

  it('should throw ValidationError for invalid query params', () => {
    const url = new URL('http://localhost:3000/api/test?page=-1')
    const request = new NextRequest(url)

    expect(() => validateQueryParams(request, schema)).toThrow()
  })
})
