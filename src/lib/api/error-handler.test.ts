import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ZodError, z } from 'zod'
import { handleApiError, withErrorHandler, createApiHandler } from './error-handler'
import { NextResponse } from 'next/server'
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  InternalError,
  BusinessError,
} from '@/lib/errors'

describe('handleApiError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('AppError handling', () => {
    it('should handle ValidationError with 400 status', async () => {
      const error = new ValidationError('Invalid input', { field: 'name' })
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.message).toBe('Invalid input')
      expect(body.error.details).toEqual({ field: 'name' })
    })

    it('should handle AuthenticationError with 401 status', async () => {
      const error = new AuthenticationError()
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('AUTHENTICATION_ERROR')
      expect(body.error.message).toBe('未登录')
    })

    it('should handle AuthorizationError with 403 status', async () => {
      const error = new AuthorizationError('Access denied')
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('AUTHORIZATION_ERROR')
    })

    it('should handle NotFoundError with 404 status', async () => {
      const error = new NotFoundError('Resource not found')
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('should handle RateLimitError with 429 status', async () => {
      const error = new RateLimitError()
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(429)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(body.error.message).toBe('请求过于频繁')
    })

    it('should handle TimeoutError with 408 status', async () => {
      const error = new TimeoutError('Operation timed out')
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(408)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('EXECUTION_TIMEOUT')
    })

    it('should handle InternalError with 500 status', async () => {
      const error = new InternalError()
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })

    it('should handle BusinessError with 422 status', async () => {
      const error = new BusinessError('Business rule violation')
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(422)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('BUSINESS_ERROR')
    })
  })

  describe('ZodError handling', () => {
    it('should handle ZodError with 400 status and field details', async () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      })

      let zodError: ZodError | null = null
      try {
        schema.parse({ name: '', email: 'invalid' })
      } catch (e) {
        zodError = e as ZodError
      }

      expect(zodError).not.toBeNull()
      const response = handleApiError(zodError!)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.message).toBe('请求参数验证失败')
      expect(Array.isArray(body.error.details)).toBe(true)
      expect(body.error.details.length).toBeGreaterThan(0)
      expect(body.error.details[0]).toHaveProperty('field')
      expect(body.error.details[0]).toHaveProperty('message')
    })
  })

  describe('Standard Error handling', () => {
    it('should handle standard Error with 500 status', async () => {
      const error = new Error('Something went wrong')
      const response = handleApiError(error)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('Unknown error handling', () => {
    it('should handle unknown error types with 500 status', async () => {
      const response = handleApiError('string error')
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('INTERNAL_ERROR')
      expect(body.error.message).toBe('服务器内部错误')
    })

    it('should handle null with 500 status', async () => {
      const response = handleApiError(null)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.success).toBe(false)
    })

    it('should handle undefined with 500 status', async () => {
      const response = handleApiError(undefined)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.success).toBe(false)
    })
  })
})

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should return successful response when handler succeeds', async () => {
    const successResponse = NextResponse.json({ data: 'test' })
    const handler = async () => successResponse

    const result = await withErrorHandler(handler)
    const body = await result.json()

    expect(body).toEqual({ data: 'test' })
  })

  it('should catch and handle errors from handler', async () => {
    const handler = async () => {
      throw new ValidationError('Test error')
    }

    const result = await withErrorHandler(handler)
    const body = await result.json()

    expect(result.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('createApiHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should return successful response when handler succeeds', async () => {
    const handler = async (req: Request) => {
      return NextResponse.json({ url: req.url })
    }

    const wrappedHandler = createApiHandler(handler)
    const request = new Request('http://localhost/api/test')
    const result = await wrappedHandler(request)
    const body = await result.json()

    expect(body).toEqual({ url: 'http://localhost/api/test' })
  })

  it('should catch and handle errors from handler', async () => {
    const handler = async () => {
      throw new NotFoundError('Resource not found')
    }

    const wrappedHandler = createApiHandler(handler)
    const request = new Request('http://localhost/api/test')
    const result = await wrappedHandler(request)
    const body = await result.json()

    expect(result.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
