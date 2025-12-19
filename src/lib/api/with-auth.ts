/**
 * Authentication wrapper for API route handlers
 * 
 * Provides a higher-order function that wraps API handlers with
 * session validation and user context injection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { AuthenticationError, ApiErrorResponse } from '@/lib/errors'
import { handleApiError } from './error-handler'

/**
 * Session user type with all required fields
 */
export interface SessionUser {
  id: string
  email: string
  name: string | null
  role: string
  organizationId: string
  organizationName: string
}

/**
 * Context provided to authenticated handlers
 */
export interface AuthContext {
  user: SessionUser
  params?: Record<string, string>
}

/**
 * Handler function type for authenticated routes
 */
export type AuthenticatedHandler<T = unknown> = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse<T>>

/**
 * Route context type for Next.js 15
 */
export interface RouteContext {
  params: Promise<Record<string, string>>
}

/**
 * Route handler type returned by withAuth
 */
export type RouteHandler<T = unknown> = (
  request: NextRequest,
  context: RouteContext
) => Promise<NextResponse<T | ApiErrorResponse>>

/**
 * Wraps an API route handler with authentication
 * 
 * This higher-order function:
 * 1. Validates the user session
 * 2. Extracts and validates user information
 * 3. Injects user context into the handler
 * 4. Handles authentication errors consistently
 * 
 * @param handler - The authenticated handler function
 * @returns A wrapped route handler with authentication
 * 
 * @example
 * ```typescript
 * export const GET = withAuth(async (request, { user }) => {
 *   // user is guaranteed to be authenticated here
 *   const data = await fetchUserData(user.id)
 *   return ApiResponse.success(data)
 * })
 * ```
 */
export function withAuth<T>(
  handler: AuthenticatedHandler<T>
): RouteHandler<T> {
  return async (
    request: NextRequest,
    context: RouteContext
  ): Promise<NextResponse<T | ApiErrorResponse>> => {
    try {
      // Get the session
      const session = await auth()

      // Check if session exists and has user
      if (!session?.user) {
        throw new AuthenticationError('未登录')
      }

      // Validate required user fields
      const { id, email, role, organizationId, organizationName } = session.user
      
      if (!id || !email || !role || !organizationId) {
        throw new AuthenticationError('会话信息不完整')
      }

      // Build the session user object
      const user: SessionUser = {
        id,
        email,
        name: session.user.name ?? null,
        role,
        organizationId,
        organizationName: organizationName ?? '',
      }

      // Resolve params (Next.js 15 uses Promise for params)
      const resolvedParams = await context.params

      // Call the handler with authenticated context
      return await handler(request, {
        user,
        params: resolvedParams,
      })
    } catch (error) {
      return handleApiError(error)
    }
  }
}

/**
 * Type guard to check if a user has a specific role
 */
export function hasRole(user: SessionUser, roles: string | string[]): boolean {
  const roleArray = Array.isArray(roles) ? roles : [roles]
  return roleArray.includes(user.role)
}

/**
 * Type guard to check if a user is an owner
 */
export function isOwner(user: SessionUser): boolean {
  return user.role === 'OWNER'
}

/**
 * Type guard to check if a user is an admin or owner
 */
export function isAdminOrOwner(user: SessionUser): boolean {
  return hasRole(user, ['ADMIN', 'OWNER'])
}
