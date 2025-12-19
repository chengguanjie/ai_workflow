/**
 * HTTP Node Processor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processHttpNode } from './http'
import type { HttpNodeConfig, ExecutionContext } from '@/types/workflow'

const originalFetch = global.fetch

function createContext(nodeOutputs: Record<string, unknown> = {}): ExecutionContext {
  const context: ExecutionContext = {
    input: {},
    nodeOutputs: new Map(),
    globalVariables: new Map(),
  }
  
  for (const [key, value] of Object.entries(nodeOutputs)) {
    context.nodeOutputs.set(key, value as Record<string, unknown>)
  }
  
  return context
}

function createHttpNode(config: Partial<HttpNodeConfig['config']>): HttpNodeConfig {
  return {
    id: 'test-http',
    type: 'HTTP',
    name: 'Test HTTP',
    position: { x: 0, y: 0 },
    config: {
      method: 'GET',
      url: 'https://api.example.com/test',
      ...config,
    },
  }
}

function createMockResponse(data: unknown, options: {
  status?: number
  statusText?: string
  headers?: Record<string, string>
  contentType?: string
} = {}) {
  const {
    status = 200,
    statusText = 'OK',
    headers = {},
    contentType = 'application/json',
  } = options
  
  const responseHeaders = new Map(Object.entries({
    'content-type': contentType,
    ...headers,
  }))
  
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: Object.fromEntries(responseHeaders),
  })
}

describe('processHttpNode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  
  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })
  
  describe('GET requests', () => {
    it('should make a simple GET request', async () => {
      const mockData = { id: 1, name: 'Test' }
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(mockData))

      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/users/1',
      })

      const context = createContext()
      const result = await processHttpNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data.statusCode).toBe(200)
      expect(result.data.body).toEqual(mockData)
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'GET',
        })
      )
    })
    
    it('should include query parameters', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ results: [] }))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/search',
        queryParams: {
          q: 'test',
          limit: '10',
        },
      })
      
      const context = createContext()
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=test'),
        expect.any(Object)
      )
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      )
    })
  })
  
  describe('POST requests', () => {
    it('should send JSON body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ success: true }))
      
      const node = createHttpNode({
        method: 'POST',
        url: 'https://api.example.com/users',
        body: {
          type: 'json',
          content: JSON.stringify({ name: 'John', email: 'john@example.com' }),
        },
      })
      
      const context = createContext()
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('John'),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })
    
    it('should send form data', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ success: true }))
      
      const node = createHttpNode({
        method: 'POST',
        url: 'https://api.example.com/login',
        body: {
          type: 'form',
          content: { username: 'user', password: 'pass' },
        },
      })
      
      const context = createContext()
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      )
    })
  })
  
  describe('Authentication', () => {
    it('should add Basic auth header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ auth: true }))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/protected',
        auth: {
          type: 'basic',
          username: 'user',
          password: 'pass',
        },
      })
      
      const context = createContext()
      await processHttpNode(node, context)
      
      const expectedCredentials = Buffer.from('user:pass').toString('base64')
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedCredentials}`,
          }),
        })
      )
    })
    
    it('should add Bearer token', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ auth: true }))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/protected',
        auth: {
          type: 'bearer',
          token: 'my-jwt-token',
        },
      })
      
      const context = createContext()
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-jwt-token',
          }),
        })
      )
    })
    
    it('should add API key to header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ auth: true }))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/protected',
        auth: {
          type: 'apikey',
          apiKey: {
            key: 'X-API-Key',
            value: 'secret-key',
            addTo: 'header',
          },
        },
      })
      
      const context = createContext()
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key',
          }),
        })
      )
    })
  })
  
  describe('Variable substitution', () => {
    it('should replace variables in URL', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ id: 1 }))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/users/{{input.userId}}',
      })
      
      const context = createContext({
        input: { data: { userId: '123' } },
      })
      
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/123',
        expect.any(Object)
      )
    })
    
    it('should replace variables in headers', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({}))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/test',
        headers: {
          'X-Custom-Header': '{{config.headerValue}}',
        },
      })
      
      const context = createContext({
        config: { data: { headerValue: 'custom-value' } },
      })
      
      await processHttpNode(node, context)
      
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        })
      )
    })
  })
  
  describe('Error handling', () => {
    it('should handle HTTP errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        })
      )
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/notfound',
      })
      
      const context = createContext()
      const result = await processHttpNode(node, context)

      expect(result.status).toBe('error')
      expect(result.data.statusCode).toBe(404)
      expect(result.error).toContain('404')
    })
    
    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/test',
        retry: { maxRetries: 0, retryDelay: 100 },
      })
      
      const context = createContext()
      const result = await processHttpNode(node, context)
      
      expect(result.status).toBe('error')
      expect(result.error).toContain('Network error')
    })
    
    it('should return error when URL is missing', async () => {
      const node = createHttpNode({
        method: 'GET',
        url: '',
      })

      const context = createContext()
      const result = await processHttpNode(node, context)

      expect(result.status).toBe('error')
      expect(result.error).toContain('requires a URL')
    })
  })
  
  describe('Retry logic', () => {
    it('should retry on 5xx errors', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
        )
        .mockResolvedValueOnce(createMockResponse({ success: true }))
      
      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/test',
        retry: { maxRetries: 1, retryDelay: 10 },
      })
      
      const context = createContext()
      const result = await processHttpNode(node, context)
      
      expect(result.status).toBe('success')
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })
  
  describe('Response types', () => {
    it('should handle JSON response', async () => {
      const mockData = { users: [{ id: 1 }, { id: 2 }] }
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(mockData))

      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/users',
        responseType: 'json',
      })

      const context = createContext()
      const result = await processHttpNode(node, context)

      expect(result.data.body).toEqual(mockData)
    })
    
    it('should handle text response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Plain text response', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      )

      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/text',
        responseType: 'text',
      })

      const context = createContext()
      const result = await processHttpNode(node, context)

      expect(result.data.body).toBe('Plain text response')
    })
  })
  
  describe('Headers sanitization', () => {
    it('should sanitize sensitive headers in logs', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({}))

      const node = createHttpNode({
        method: 'GET',
        url: 'https://api.example.com/test',
        auth: {
          type: 'bearer',
          token: 'secret-token',
        },
      })

      const context = createContext()
      const result = await processHttpNode(node, context)

      expect(result.data.request?.headers?.Authorization).toBe('[REDACTED]')
    })
  })
  
  describe('HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const
    
    methods.forEach(method => {
      it(`should support ${method} method`, async () => {
        vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ method }))
        
        const node = createHttpNode({
          method,
          url: 'https://api.example.com/test',
        })
        
        const context = createContext()
        await processHttpNode(node, context)
        
        expect(fetch).toHaveBeenCalledWith(
          'https://api.example.com/test',
          expect.objectContaining({ method })
        )
      })
    })
  })
})
