import { describe, it, expect } from 'vitest'
import {
  createMockPrisma,
  createMockRequest,
  createMockPostRequest,
  createMockGetRequest,
  createMockSession,
  createMockOwnerSession,
  createMockAdminSession,
} from './index'

describe('Mock Prisma', () => {
  it('should create a mock prisma client', () => {
    const mockPrisma = createMockPrisma()
    expect(mockPrisma).toBeDefined()
    expect(mockPrisma.user).toBeDefined()
    expect(mockPrisma.workflow).toBeDefined()
    expect(mockPrisma.organization).toBeDefined()
  })
})

describe('Mock Request', () => {
  it('should create a GET request with search params', () => {
    const request = createMockGetRequest({ page: '1', pageSize: '20' })
    expect(request.method).toBe('GET')
    expect(request.url).toContain('page=1')
    expect(request.url).toContain('pageSize=20')
  })

  it('should create a POST request with body', async () => {
    const body = { name: 'Test Workflow' }
    const request = createMockPostRequest(body)
    expect(request.method).toBe('POST')
    const parsedBody = await request.json()
    expect(parsedBody).toEqual(body)
  })

  it('should create a request with custom headers', () => {
    const request = createMockRequest({
      method: 'GET',
      headers: { 'Authorization': 'Bearer token123' },
    })
    expect(request.headers.get('Authorization')).toBe('Bearer token123')
  })
})

describe('Mock Session', () => {
  it('should create a default session', () => {
    const session = createMockSession()
    expect(session.user.id).toBe('test-user-id')
    expect(session.user.email).toBe('test@example.com')
    expect(session.user.role).toBe('EDITOR')
    expect(session.user.organizationId).toBe('test-org-id')
    expect(session.expires).toBeDefined()
  })

  it('should create a session with custom user data', () => {
    const session = createMockSession({
      user: {
        id: 'custom-id',
        email: 'custom@example.com',
        role: 'ADMIN',
      },
    })
    expect(session.user.id).toBe('custom-id')
    expect(session.user.email).toBe('custom@example.com')
    expect(session.user.role).toBe('ADMIN')
  })

  it('should create an owner session', () => {
    const session = createMockOwnerSession()
    expect(session.user.role).toBe('OWNER')
  })

  it('should create an admin session', () => {
    const session = createMockAdminSession()
    expect(session.user.role).toBe('ADMIN')
  })
})
