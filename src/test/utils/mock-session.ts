import type { Session } from 'next-auth'

export interface SessionUser {
  id: string
  email: string
  name: string | null
  image?: string | null
  role: string
  organizationId: string
  organizationName: string
  mustChangePassword: boolean
}

export interface MockSessionOptions {
  user?: Partial<SessionUser>
  expires?: string
}

export function createMockSession(options: MockSessionOptions = {}): Session {
  const defaultUser: SessionUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'EDITOR',
    organizationId: 'test-org-id',
    organizationName: 'Test Organization',
    mustChangePassword: false,
  }

  return {
    user: {
      ...defaultUser,
      ...options.user,
    },
    expires: options.expires || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function createMockOwnerSession(overrides?: Partial<SessionUser>): Session {
  return createMockSession({
    user: {
      role: 'OWNER',
      ...overrides,
    },
  })
}

export function createMockAdminSession(overrides?: Partial<SessionUser>): Session {
  return createMockSession({
    user: {
      role: 'ADMIN',
      ...overrides,
    },
  })
}

export function createMockEditorSession(overrides?: Partial<SessionUser>): Session {
  return createMockSession({
    user: {
      role: 'EDITOR',
      ...overrides,
    },
  })
}

export function createMockMemberSession(overrides?: Partial<SessionUser>): Session {
  return createMockSession({
    user: {
      role: 'MEMBER',
      ...overrides,
    },
  })
}

export function createMockViewerSession(overrides?: Partial<SessionUser>): Session {
  return createMockSession({
    user: {
      role: 'VIEWER',
      ...overrides,
    },
  })
}

export function createExpiredSession(overrides?: Partial<SessionUser>): Session {
  return createMockSession({
    user: overrides,
    expires: new Date(Date.now() - 1000).toISOString(),
  })
}
