/**
 * API Token Scope Validation Middleware
 * 
 * Provides middleware functions for validating API token scopes and
 * cross-organization access in API routes.
 * 
 * @module lib/auth/token-scope-middleware
 */

import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import {
  TokenScope,
  validateScope,
  inferScopeFromPath,
  normalizeScopes,
} from './token-scope-validator'

/**
 * API Token with organization info for validation
 */
export interface ValidatedApiToken {
  id: string
  organizationId: string
  createdById: string
  scopes: TokenScope[]
  isActive: boolean
  expiresAt: Date | null
}

/**
 * Result of token validation
 */
export type TokenValidationResult =
  | { success: true; token: ValidatedApiToken }
  | { success: false; error: string; status: number }

/**
 * Result of scope validation
 */
export type ScopeValidationResult =
  | { success: true }
  | { success: false; error: string; status: number; requiredScope?: TokenScope }

/**
 * Result of cross-organization validation
 */
export type CrossOrgValidationResult =
  | { success: true }
  | { success: false; status: number }

/**
 * Extract and validate API token from request
 * 
 * @param request - The incoming request
 * @returns Validation result with token or error
 */
export async function extractAndValidateToken(
  request: NextRequest
): Promise<TokenValidationResult> {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, error: '缺少 Authorization 头', status: 401 }
  }

  const token = authHeader.slice(7)
  if (!token) {
    return { success: false, error: '无效的 Token', status: 401 }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      scopes: true,
      isActive: true,
      expiresAt: true,
    },
  })

  if (!apiToken) {
    return { success: false, error: '无效的 Token', status: 401 }
  }

  if (!apiToken.isActive) {
    return { success: false, error: 'Token 已禁用', status: 403 }
  }

  if (apiToken.expiresAt && new Date(apiToken.expiresAt) < new Date()) {
    return { success: false, error: 'Token 已过期', status: 403 }
  }

  return {
    success: true,
    token: {
      id: apiToken.id,
      organizationId: apiToken.organizationId,
      createdById: apiToken.createdById,
      scopes: normalizeScopes(apiToken.scopes),
      isActive: apiToken.isActive,
      expiresAt: apiToken.expiresAt,
    },
  }
}

/**
 * Validate token scope against a required scope
 * 
 * @param token - The validated API token
 * @param requiredScope - The scope required for the operation
 * @returns Validation result
 */
export function validateTokenScope(
  token: ValidatedApiToken,
  requiredScope: TokenScope
): ScopeValidationResult {
  const isValid = validateScope({ scopes: token.scopes }, requiredScope)

  if (!isValid) {
    return {
      success: false,
      error: `Token 无权访问此资源，需要 ${requiredScope} 作用域`,
      status: 403,
      requiredScope,
    }
  }

  return { success: true }
}

/**
 * Validate token scope based on request path
 * 
 * @param token - The validated API token
 * @param path - The request path
 * @returns Validation result
 */
export function validateTokenScopeForPath(
  token: ValidatedApiToken,
  path: string
): ScopeValidationResult {
  const requiredScope = inferScopeFromPath(path)

  // If we can't determine the required scope, allow access
  if (requiredScope === null) {
    return { success: true }
  }

  return validateTokenScope(token, requiredScope)
}

/**
 * Validate that a resource belongs to the token's organization
 * Returns 404 instead of 403 to prevent information leakage
 * 
 * @param tokenOrgId - The organization ID from the token
 * @param resourceOrgId - The organization ID of the resource
 * @returns Validation result (404 if cross-org access attempted)
 */
export function validateCrossOrganization(
  tokenOrgId: string,
  resourceOrgId: string | null | undefined
): CrossOrgValidationResult {
  // If resource has no org ID, it might be a public resource
  if (!resourceOrgId) {
    return { success: true }
  }

  if (tokenOrgId !== resourceOrgId) {
    // Return 404 to prevent information leakage about resource existence
    return { success: false, status: 404 }
  }

  return { success: true }
}

/**
 * Complete middleware for API token validation with scope checking
 * 
 * @param request - The incoming request
 * @param requiredScope - Optional specific scope to require (if not provided, inferred from path)
 * @returns Validation result with token or error response
 */
export async function validateApiTokenWithScope(
  request: NextRequest,
  requiredScope?: TokenScope
): Promise<
  | { success: true; token: ValidatedApiToken }
  | { success: false; response: ReturnType<typeof ApiResponse.error> }
> {
  // Step 1: Extract and validate token
  const tokenResult = await extractAndValidateToken(request)
  if (!tokenResult.success) {
    return {
      success: false,
      response: ApiResponse.error(tokenResult.error, tokenResult.status),
    }
  }

  // Step 2: Validate scope
  const scopeResult = requiredScope
    ? validateTokenScope(tokenResult.token, requiredScope)
    : validateTokenScopeForPath(tokenResult.token, request.nextUrl.pathname)

  if (!scopeResult.success) {
    return {
      success: false,
      response: ApiResponse.error(scopeResult.error, scopeResult.status),
    }
  }

  return { success: true, token: tokenResult.token }
}

/**
 * Helper to update token usage statistics
 * 
 * @param tokenId - The token ID to update
 */
export async function updateTokenUsage(tokenId: string): Promise<void> {
  await prisma.apiToken.update({
    where: { id: tokenId },
    data: {
      lastUsedAt: new Date(),
      usageCount: { increment: 1 },
    },
  })
}

/**
 * Create a standardized 404 response for cross-organization access
 * This prevents information leakage about resource existence
 */
export function createCrossOrgNotFoundResponse(resourceType: string = '资源') {
  return ApiResponse.error(`${resourceType}不存在`, 404)
}
