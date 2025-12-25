/**
 * Property-based tests for API Token Scope Validator
 * 
 * **Feature: permission-system-enhancement, Property 5: API Token Scope Enforcement**
 * **Validates: Requirements 3.1, 3.2, 3.3**
 * 
 * For any API request with a token, if the token's scopes do not include the 
 * required scope for the requested resource, the request should be rejected;
 * if scopes is empty or contains '*', all resources should be accessible.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  TokenScope,
  VALID_SCOPES,
  WILDCARD_SCOPE,
  validateScope,
  inferScopeFromPath,
  normalizeScopes,
  isValidScope,
  validateScopeForPath,
  ApiTokenForValidation,
} from './token-scope-validator'

describe('Property 5: API Token Scope Enforcement', () => {
  // Arbitrary for generating valid scopes (excluding wildcard)
  const validScopeArb = fc.constantFrom(...VALID_SCOPES)
  
  // Arbitrary for generating any valid scope (including wildcard)
  const anyScopeArb = fc.constantFrom(...VALID_SCOPES, WILDCARD_SCOPE)
  
  // Arbitrary for generating scope arrays
  const scopeArrayArb = fc.array(validScopeArb, { minLength: 0, maxLength: 5 })
  
  // Arbitrary for generating API paths
  const apiPathArb = fc.oneof(
    fc.constant('/api/v1/workflows'),
    fc.constant('/api/v1/workflows/123'),
    fc.constant('/api/v1/knowledge-bases'),
    fc.constant('/api/v1/knowledge-bases/abc'),
    fc.constant('/api/v1/templates'),
    fc.constant('/api/v1/templates/xyz'),
    fc.constant('/api/v1/executions'),
    fc.constant('/api/v1/executions/exec-1'),
    fc.constant('/api/v1/tools'),
    fc.constant('/api/v1/tools/tool-1'),
    fc.constant('/api/v1/tasks/task-1'),
    fc.constant('/api/workflows'),
    fc.constant('/api/knowledge-bases'),
    fc.constant('/api/templates'),
    fc.constant('/api/executions'),
    fc.constant('/api/tools'),
  )

  /**
   * Property: Empty scopes array grants access to all resources
   * 
   * For any required scope, a token with empty scopes should be granted access.
   * This maintains backward compatibility with legacy tokens.
   */
  it('should grant access to all resources when scopes array is empty', () => {
    fc.assert(
      fc.property(
        validScopeArb,
        (requiredScope) => {
          const token: ApiTokenForValidation = { scopes: [] }
          expect(validateScope(token, requiredScope)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Wildcard scope grants access to all resources
   * 
   * For any required scope, a token with '*' in its scopes should be granted access.
   */
  it('should grant access to all resources when scopes contains wildcard', () => {
    fc.assert(
      fc.property(
        validScopeArb,
        scopeArrayArb,
        (requiredScope, additionalScopes) => {
          const token: ApiTokenForValidation = { 
            scopes: [WILDCARD_SCOPE, ...additionalScopes] 
          }
          expect(validateScope(token, requiredScope)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Specific scope grants access only to matching resources
   * 
   * For any token with specific scopes (not empty, not wildcard),
   * access should be granted only when the required scope is in the token's scopes.
   */
  it('should grant access only when required scope is in token scopes', () => {
    fc.assert(
      fc.property(
        fc.array(validScopeArb, { minLength: 1, maxLength: 5 }),
        validScopeArb,
        (tokenScopes, requiredScope) => {
          const token: ApiTokenForValidation = { scopes: tokenScopes }
          const hasScope = tokenScopes.includes(requiredScope)
          expect(validateScope(token, requiredScope)).toBe(hasScope)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Token without required scope is denied access
   * 
   * For any token with specific scopes that do not include the required scope,
   * access should be denied.
   */
  it('should deny access when required scope is not in token scopes', () => {
    fc.assert(
      fc.property(
        validScopeArb,
        (requiredScope) => {
          // Create scopes that explicitly exclude the required scope
          const otherScopes = VALID_SCOPES.filter(s => s !== requiredScope)
          if (otherScopes.length === 0) return true // Skip if no other scopes
          
          const token: ApiTokenForValidation = { scopes: otherScopes }
          expect(validateScope(token, requiredScope)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Path inference is consistent with scope validation
   * 
   * For any API path that maps to a known scope, the inferred scope
   * should be a valid scope value.
   */
  it('should infer valid scopes from known API paths', () => {
    fc.assert(
      fc.property(
        apiPathArb,
        (path) => {
          const inferredScope = inferScopeFromPath(path)
          // All known paths should map to a valid scope
          expect(inferredScope).not.toBeNull()
          expect(isValidScope(inferredScope)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: validateScopeForPath combines inference and validation correctly
   * 
   * For any token and path combination, validateScopeForPath should return
   * consistent results with separate calls to inferScopeFromPath and validateScope.
   */
  it('should validate scope for path consistently', () => {
    fc.assert(
      fc.property(
        scopeArrayArb,
        apiPathArb,
        (scopes, path) => {
          const token: ApiTokenForValidation = { scopes }
          const result = validateScopeForPath(token, path)
          
          const inferredScope = inferScopeFromPath(path)
          expect(result.requiredScope).toBe(inferredScope)
          
          if (inferredScope !== null) {
            expect(result.valid).toBe(validateScope(token, inferredScope))
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('normalizeScopes', () => {
  /**
   * Property: Normalized scopes contain only valid scope values
   * 
   * For any input, normalizeScopes should return an array containing
   * only valid TokenScope values.
   */
  it('should return only valid scopes from any input', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.string()),
          fc.string(),
          fc.array(fc.constantFrom(...VALID_SCOPES, WILDCARD_SCOPE, 'invalid', 'random')),
        ),
        (input) => {
          const result = normalizeScopes(input)
          expect(Array.isArray(result)).toBe(true)
          result.forEach(scope => {
            expect(isValidScope(scope)).toBe(true)
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Valid scope arrays are preserved
   * 
   * For any array of valid scopes, normalizeScopes should preserve all values.
   */
  it('should preserve valid scope arrays', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...VALID_SCOPES, WILDCARD_SCOPE), { minLength: 0, maxLength: 10 }),
        (validScopes) => {
          const result = normalizeScopes(validScopes)
          expect(result).toEqual(validScopes)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Invalid scopes are filtered out
   * 
   * For any array containing invalid scopes, those invalid values
   * should be filtered out from the result.
   */
  it('should filter out invalid scopes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string().filter(s => !isValidScope(s)), { minLength: 1, maxLength: 5 }),
        (invalidScopes) => {
          const result = normalizeScopes(invalidScopes)
          expect(result.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('inferScopeFromPath', () => {
  /**
   * Property: Workflow paths map to workflows scope
   */
  it('should map workflow paths to workflows scope', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/api/v1/workflows'),
          fc.constant('/api/workflows'),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/v1/workflows/${id}`),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/workflows/${id}`),
        ),
        (path) => {
          expect(inferScopeFromPath(path)).toBe('workflows')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Knowledge base paths map to knowledge-bases scope
   */
  it('should map knowledge base paths to knowledge-bases scope', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/api/v1/knowledge-bases'),
          fc.constant('/api/knowledge-bases'),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/v1/knowledge-bases/${id}`),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/knowledge-bases/${id}`),
        ),
        (path) => {
          expect(inferScopeFromPath(path)).toBe('knowledge-bases')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Template paths map to templates scope
   */
  it('should map template paths to templates scope', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/api/v1/templates'),
          fc.constant('/api/templates'),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/v1/templates/${id}`),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/templates/${id}`),
        ),
        (path) => {
          expect(inferScopeFromPath(path)).toBe('templates')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Execution and task paths map to executions scope
   */
  it('should map execution and task paths to executions scope', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/api/v1/executions'),
          fc.constant('/api/executions'),
          fc.constant('/api/v1/tasks/task-1'),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/v1/executions/${id}`),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/v1/tasks/${id}`),
        ),
        (path) => {
          expect(inferScopeFromPath(path)).toBe('executions')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Tool paths map to tools scope
   */
  it('should map tool paths to tools scope', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/api/v1/tools'),
          fc.constant('/api/tools'),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/v1/tools/${id}`),
          fc.string({ minLength: 1, maxLength: 20 }).map(id => `/api/tools/${id}`),
        ),
        (path) => {
          expect(inferScopeFromPath(path)).toBe('tools')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Unknown paths return null
   */
  it('should return null for unknown paths', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/api/v1/unknown'),
          fc.constant('/api/settings'),
          fc.constant('/api/auth/login'),
          fc.constant('/other/path'),
        ),
        (path) => {
          expect(inferScopeFromPath(path)).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Query strings are ignored
   */
  it('should ignore query strings when inferring scope', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SCOPES.filter(s => s !== 'knowledge-bases')),
        fc.string({ minLength: 1, maxLength: 50 }),
        (scope, queryString) => {
          const basePath = `/api/v1/${scope}`
          const pathWithQuery = `${basePath}?${queryString}`
          expect(inferScopeFromPath(pathWithQuery)).toBe(scope)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('isValidScope', () => {
  /**
   * Property: All VALID_SCOPES are valid
   */
  it('should return true for all valid scopes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SCOPES, WILDCARD_SCOPE),
        (scope) => {
          expect(isValidScope(scope)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Non-string values are invalid
   */
  it('should return false for non-string values', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.string()),
          fc.object(),
        ),
        (value) => {
          expect(isValidScope(value)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Random strings (not in valid scopes) are invalid
   */
  it('should return false for invalid scope strings', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => 
          !VALID_SCOPES.includes(s as TokenScope) && s !== WILDCARD_SCOPE
        ),
        (invalidScope) => {
          expect(isValidScope(invalidScope)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
