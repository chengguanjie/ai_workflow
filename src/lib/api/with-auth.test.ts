/**
 * Property-based tests for withAuth authentication wrapper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, SessionUser, AuthContext, hasRole, isOwner, isAdminOrOwner } from './with-auth'

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// Import the mocked auth function
import { auth } from '@/lib/auth'
const mockAuth = vi.mocked(auth)

/**
 * **Feature: project-optimization, Property 3: Authentication Context Injection**
 * **Validates: Requirements 1.5**
 * 
 * For any request processed by a withAuth-wrapped handler, the handler SHALL 
 * receive a context object containing the authenticated user's id, email, role, 
 * and organizationId.
 */
describe('Property 3: Authentication Context Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Arbitrary for generating valid user IDs (non-empty strings)
  const userIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  
  // Arbitrary for generating valid email addresses
  const emailArb = fc.emailAddress()
  
  // Arbitrary for generating user names (can be null)
  const nameArb = fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 1, maxLength: 100 })
  )
  
  // Arbitrary for generating valid roles
  const roleArb = fc.constantFrom('OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'VIEWER')
  
  // Arbitrary for generating organization IDs
  const orgIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  
  // Arbitrary for generating organization names
  const orgNameArb = fc.string({ minLength: 0, maxLength: 100 })

  // Arbitrary for generating a complete valid session user
  const sessionUserArb = fc.record({
    id: userIdArb,
    email: emailArb,
    name: nameArb,
    role: roleArb,
    organizationId: orgIdArb,
    organizationName: orgNameArb,
  })

  it('should inject user context with all required fields for any valid session', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionUserArb,
        async (sessionUser) => {
          // Setup mock session
          mockAuth.mockResolvedValueOnce({
            user: sessionUser,
            expires: new Date(Date.now() + 86400000).toISOString(),
          } as any)

          // Track the context received by the handler
          let receivedContext: AuthContext | null = null

          // Create a handler that captures the context
          const handler = withAuth(async (_request, context) => {
            receivedContext = context
            return NextResponse.json({ success: true })
          })

          // Create a mock request
          const request = new NextRequest('http://localhost:3000/api/test')

          // Execute the handler
          await handler(request)

          // Verify context was received
          expect(receivedContext).not.toBeNull()
          
          // Verify all required fields are present
          expect(receivedContext!.user).toBeDefined()
          expect(receivedContext!.user.id).toBe(sessionUser.id)
          expect(receivedContext!.user.email).toBe(sessionUser.email)
          expect(receivedContext!.user.role).toBe(sessionUser.role)
          expect(receivedContext!.user.organizationId).toBe(sessionUser.organizationId)
          
          // Verify optional fields are handled correctly
          expect(receivedContext!.user.name).toBe(sessionUser.name)
          expect(receivedContext!.user.organizationName).toBe(sessionUser.organizationName)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve user id exactly as provided in session', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionUserArb,
        async (sessionUser) => {
          mockAuth.mockResolvedValueOnce({
            user: sessionUser,
            expires: new Date(Date.now() + 86400000).toISOString(),
          } as any)

          let capturedUser: SessionUser | null = null

          const handler = withAuth(async (_request, { user }) => {
            capturedUser = user
            return NextResponse.json({ success: true })
          })

          const request = new NextRequest('http://localhost:3000/api/test')
          await handler(request)

          expect(capturedUser).not.toBeNull()
          expect(capturedUser!.id).toBe(sessionUser.id)
          expect(typeof capturedUser!.id).toBe('string')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve email exactly as provided in session', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionUserArb,
        async (sessionUser) => {
          mockAuth.mockResolvedValueOnce({
            user: sessionUser,
            expires: new Date(Date.now() + 86400000).toISOString(),
          } as any)

          let capturedUser: SessionUser | null = null

          const handler = withAuth(async (_request, { user }) => {
            capturedUser = user
            return NextResponse.json({ success: true })
          })

          const request = new NextRequest('http://localhost:3000/api/test')
          await handler(request)

          expect(capturedUser).not.toBeNull()
          expect(capturedUser!.email).toBe(sessionUser.email)
          expect(typeof capturedUser!.email).toBe('string')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve role exactly as provided in session', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionUserArb,
        async (sessionUser) => {
          mockAuth.mockResolvedValueOnce({
            user: sessionUser,
            expires: new Date(Date.now() + 86400000).toISOString(),
          } as any)

          let capturedUser: SessionUser | null = null

          const handler = withAuth(async (_request, { user }) => {
            capturedUser = user
            return NextResponse.json({ success: true })
          })

          const request = new NextRequest('http://localhost:3000/api/test')
          await handler(request)

          expect(capturedUser).not.toBeNull()
          expect(capturedUser!.role).toBe(sessionUser.role)
          expect(typeof capturedUser!.role).toBe('string')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve organizationId exactly as provided in session', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionUserArb,
        async (sessionUser) => {
          mockAuth.mockResolvedValueOnce({
            user: sessionUser,
            expires: new Date(Date.now() + 86400000).toISOString(),
          } as any)

          let capturedUser: SessionUser | null = null

          const handler = withAuth(async (_request, { user }) => {
            capturedUser = user
            return NextResponse.json({ success: true })
          })

          const request = new NextRequest('http://localhost:3000/api/test')
          await handler(request)

          expect(capturedUser).not.toBeNull()
          expect(capturedUser!.organizationId).toBe(sessionUser.organizationId)
          expect(typeof capturedUser!.organizationId).toBe('string')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return 401 error when session is null', async () => {
    mockAuth.mockResolvedValueOnce(null as any)

    const handler = withAuth(async () => {
      return NextResponse.json({ success: true })
    })

    const request = new NextRequest('http://localhost:3000/api/test')
    const response = await handler(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('未登录')
  })

  it('should return 401 error when session user is missing', async () => {
    mockAuth.mockResolvedValueOnce({
      user: undefined,
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any)

    const handler = withAuth(async () => {
      return NextResponse.json({ success: true })
    })

    const request = new NextRequest('http://localhost:3000/api/test')
    const response = await handler(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.success).toBe(false)
  })

  it('should return 401 error when required user fields are missing', async () => {
    // Test cases with missing required fields
    const incompleteUsers = [
      { email: 'test@example.com', role: 'EDITOR', organizationId: 'org-1' }, // missing id
      { id: 'user-1', role: 'EDITOR', organizationId: 'org-1' }, // missing email
      { id: 'user-1', email: 'test@example.com', organizationId: 'org-1' }, // missing role
      { id: 'user-1', email: 'test@example.com', role: 'EDITOR' }, // missing organizationId
    ]

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...incompleteUsers),
        async (incompleteUser) => {
          mockAuth.mockResolvedValueOnce({
            user: incompleteUser as any,
            expires: new Date(Date.now() + 86400000).toISOString(),
          } as any)

          const handler = withAuth(async () => {
            return NextResponse.json({ success: true })
          })

          const request = new NextRequest('http://localhost:3000/api/test')
          const response = await handler(request)

          expect(response.status).toBe(401)
          const body = await response.json()
          expect(body.success).toBe(false)
        }
      ),
      { numRuns: 20 }
    )
  })
})

describe('withAuth helper functions', () => {
  it('should correctly identify roles with hasRole', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'VIEWER'),
        (role) => {
          const user: SessionUser = {
            id: 'test-id',
            email: 'test@example.com',
            name: 'Test User',
            role,
            organizationId: 'org-id',
            organizationName: 'Test Org',
          }

          // Single role check
          expect(hasRole(user, role)).toBe(true)
          expect(hasRole(user, 'NONEXISTENT')).toBe(false)

          // Array role check
          expect(hasRole(user, [role])).toBe(true)
          expect(hasRole(user, [role, 'OTHER'])).toBe(true)
          expect(hasRole(user, ['NONEXISTENT'])).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should correctly identify owner with isOwner', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'VIEWER'),
        (role) => {
          const user: SessionUser = {
            id: 'test-id',
            email: 'test@example.com',
            name: 'Test User',
            role,
            organizationId: 'org-id',
            organizationName: 'Test Org',
          }

          expect(isOwner(user)).toBe(role === 'OWNER')
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should correctly identify admin or owner with isAdminOrOwner', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'VIEWER'),
        (role) => {
          const user: SessionUser = {
            id: 'test-id',
            email: 'test@example.com',
            name: 'Test User',
            role,
            organizationId: 'org-id',
            organizationName: 'Test Org',
          }

          expect(isAdminOrOwner(user)).toBe(role === 'OWNER' || role === 'ADMIN')
        }
      ),
      { numRuns: 50 }
    )
  })
})
