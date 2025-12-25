/**
 * API Token Scope Validator
 * 
 * Validates API token scopes against requested resources.
 * Supports workflows, knowledge-bases, templates, executions, tools, and wildcard scopes.
 * 
 * @module lib/auth/token-scope-validator
 */

/**
 * Valid token scope values
 */
export type TokenScope =
  | 'workflows'
  | 'knowledge-bases'
  | 'templates'
  | 'executions'
  | 'tools'
  | '*'

/**
 * All valid scope values (excluding wildcard)
 */
export const VALID_SCOPES: readonly TokenScope[] = [
  'workflows',
  'knowledge-bases',
  'templates',
  'executions',
  'tools',
] as const

/**
 * Wildcard scope that grants access to all resources
 */
export const WILDCARD_SCOPE: TokenScope = '*'

/**
 * API Token interface for scope validation
 */
export interface ApiTokenForValidation {
  scopes: TokenScope[] | string[] | unknown
}

/**
 * Path to scope mapping for common API routes
 */
const PATH_SCOPE_MAP: Record<string, TokenScope> = {
  '/api/v1/workflows': 'workflows',
  '/api/workflows': 'workflows',
  '/api/v1/knowledge-bases': 'knowledge-bases',
  '/api/knowledge-bases': 'knowledge-bases',
  '/api/v1/templates': 'templates',
  '/api/templates': 'templates',
  '/api/v1/executions': 'executions',
  '/api/executions': 'executions',
  '/api/v1/tools': 'tools',
  '/api/tools': 'tools',
  '/api/v1/tasks': 'executions', // Tasks are related to executions
}

/**
 * Check if a value is a valid TokenScope
 */
export function isValidScope(scope: unknown): scope is TokenScope {
  if (typeof scope !== 'string') return false
  return scope === WILDCARD_SCOPE || VALID_SCOPES.includes(scope as TokenScope)
}

/**
 * Normalize scopes from token data (handles JSON parsing edge cases)
 */
export function normalizeScopes(scopes: unknown): TokenScope[] {
  // Handle null/undefined
  if (scopes === null || scopes === undefined) {
    return []
  }

  // Handle array
  if (Array.isArray(scopes)) {
    return scopes.filter(isValidScope)
  }

  // Handle string (might be JSON string)
  if (typeof scopes === 'string') {
    try {
      const parsed = JSON.parse(scopes)
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidScope)
      }
    } catch {
      // If it's a single scope string
      if (isValidScope(scopes)) {
        return [scopes]
      }
    }
    return []
  }

  return []
}

/**
 * Validate if a token has the required scope for a resource
 * 
 * @param token - The API token to validate
 * @param requiredScope - The scope required for the requested resource
 * @returns true if the token has access, false otherwise
 * 
 * Rules:
 * - Empty scopes array grants access to all resources (legacy behavior)
 * - Wildcard scope '*' grants access to all resources
 * - Specific scope must match the required scope
 */
export function validateScope(
  token: ApiTokenForValidation,
  requiredScope: TokenScope
): boolean {
  const scopes = normalizeScopes(token.scopes)

  // Empty scopes = full access (legacy behavior for backward compatibility)
  if (scopes.length === 0) {
    return true
  }

  // Wildcard scope grants access to everything
  if (scopes.includes(WILDCARD_SCOPE)) {
    return true
  }

  // Check if the required scope is in the token's scopes
  return scopes.includes(requiredScope)
}

/**
 * Infer the required scope from an API request path
 * 
 * @param path - The API request path (e.g., '/api/v1/workflows/123')
 * @returns The inferred scope, or null if the path doesn't match any known scope
 */
export function inferScopeFromPath(path: string): TokenScope | null {
  // Normalize path: remove query string and trailing slash
  const normalizedPath = path.split('?')[0].replace(/\/$/, '')

  // Check exact matches first
  if (PATH_SCOPE_MAP[normalizedPath]) {
    return PATH_SCOPE_MAP[normalizedPath]
  }

  // Check prefix matches for paths with IDs
  for (const [prefix, scope] of Object.entries(PATH_SCOPE_MAP)) {
    if (normalizedPath.startsWith(prefix + '/') || normalizedPath === prefix) {
      return scope
    }
  }

  // Additional pattern matching for nested resources
  const patterns: Array<{ pattern: RegExp; scope: TokenScope }> = [
    { pattern: /^\/api(?:\/v1)?\/workflows/, scope: 'workflows' },
    { pattern: /^\/api(?:\/v1)?\/knowledge-bases/, scope: 'knowledge-bases' },
    { pattern: /^\/api(?:\/v1)?\/templates/, scope: 'templates' },
    { pattern: /^\/api(?:\/v1)?\/executions/, scope: 'executions' },
    { pattern: /^\/api(?:\/v1)?\/tasks/, scope: 'executions' },
    { pattern: /^\/api(?:\/v1)?\/tools/, scope: 'tools' },
  ]

  for (const { pattern, scope } of patterns) {
    if (pattern.test(normalizedPath)) {
      return scope
    }
  }

  return null
}

/**
 * Validate token scope against a request path
 * 
 * @param token - The API token to validate
 * @param path - The API request path
 * @returns Object with validation result and details
 */
export function validateScopeForPath(
  token: ApiTokenForValidation,
  path: string
): { valid: boolean; requiredScope: TokenScope | null; tokenScopes: TokenScope[] } {
  const requiredScope = inferScopeFromPath(path)
  const tokenScopes = normalizeScopes(token.scopes)

  // If we can't determine the required scope, allow access (unknown paths)
  if (requiredScope === null) {
    return { valid: true, requiredScope: null, tokenScopes }
  }

  const valid = validateScope(token, requiredScope)
  return { valid, requiredScope, tokenScopes }
}
