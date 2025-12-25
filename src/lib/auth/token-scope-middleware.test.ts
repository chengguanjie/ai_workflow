/**
 * Property-based tests for API Token Scope Middleware
 * 
 * **Feature: permission-system-enhancement, Property 8: Cross-Organization Access Prevention**
 * **Validates: Requirements 6.1, 6.2, 6.3**
 * 
 * For any API token accessing a resource, if the resource belongs to a different 
 * organization than the token, the response should be 404 Not Found (not 403 Forbidden).
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  validateCrossOrganization,
  validateTokenScope,
  validateTokenScopeForPath,
  ValidatedApiToken,
} from './token-scope-middleware'
import { TokenScope, VALID_SCOPES, WILDCARD_SCOPE } from './token-scope-validator'

describe('Property 8: Cross-Organization Access Prevention', () => {
  // Arbitrary for generating organization IDs
  const orgIdArb = fc.uuid()
  
  // Arbitrary for generating valid scopes
  const validScopeArb = fc.constantFrom(...VALID_SCOPES)
  
  // Arbitrary for generating scope arrays
  const scopeArrayArb = fc.array(validScopeArb, { minLength: 0, maxLength: 5 })
  
  // Arbitrary for generating a validated API token
  const validatedTokenArb = fc.record({
    id: fc.uuid(),
    organizationId: orgIdArb,
    createdById: fc.uuid(),
    scopes: scopeArrayArb as fc.Arbitrary<TokenScope[]>,
    isActive: fc.constant(true),
    expiresAt: fc.constant(null),
  }) as fc.Arbitrary<ValidatedApiToken>

  /**
   * Property: Same organization access is allowed
   * 
   * For any token and resource belonging to the same organization,
   * cross-organization validation should succeed.
   */
  it('should allow access when token and resource belong to same organization', () => {
    fc.assert(
      fc.property(
        orgIdArb,
        (orgId) => {
          const result = validateCrossOrganization(orgId, orgId)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Different organization access returns 404
   * 
   * For any token and resource belonging to different organizations,
   * cross-organization validation should fail with status 404.
   * This prevents information leakage about resource existence.
   */
  it('should return 404 when token and resource belong to different organizations', () => {
    fc.assert(
      fc.property(
        orgIdArb,
        orgIdArb.filter(id => id !== ''), // Ensure we have two different IDs
        (tokenOrgId, resourceOrgId) => {
          // Skip if IDs happen to be the same
          if (tokenOrgId === resourceOrgId) return true
          
          const result = validateCrossOrganization(tokenOrgId, resourceOrgId)
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.status).toBe(404)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Null/undefined resource org allows access
   * 
   * For resources without an organization ID (potentially public resources),
   * cross-organization validation should succeed.
   */
  it('should allow access when resource has no organization ID', () => {
    fc.assert(
      fc.property(
        orgIdArb,
        fc.constantFrom(null, undefined),
        (tokenOrgId, resourceOrgId) => {
          const result = validateCrossOrganization(tokenOrgId, resourceOrgId)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cross-org validation is symmetric in failure
   * 
   * If org A cannot access org B's resources, then org B also cannot access org A's resources.
   * Both should return 404.
   */
  it('should be symmetric in denying cross-organization access', () => {
    fc.assert(
      fc.property(
        orgIdArb,
        orgIdArb,
        (orgA, orgB) => {
          // Skip if IDs are the same
          if (orgA === orgB) return true
          
          const resultAtoB = validateCrossOrganization(orgA, orgB)
          const resultBtoA = validateCrossOrganization(orgB, orgA)
          
          // Both should fail with 404
          expect(resultAtoB.success).toBe(false)
          expect(resultBtoA.success).toBe(false)
          if (!resultAtoB.success && !resultBtoA.success) {
            expect(resultAtoB.status).toBe(resultBtoA.status)
            expect(resultAtoB.status).toBe(404)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Token Scope Validation', () => {
  // Arbitrary for generating valid scopes
  const validScopeArb = fc.constantFrom(...VALID_SCOPES)
  
  // Arbitrary for generating scope arrays
  const scopeArrayArb = fc.array(validScopeArb, { minLength: 0, maxLength: 5 })
  
  // Arbitrary for generating a validated API token
  const validatedTokenArb = (scopes: TokenScope[]) => ({
    id: 'test-token-id',
    organizationId: 'test-org-id',
    createdById: 'test-user-id',
    scopes,
    isActive: true,
    expiresAt: null,
  }) as ValidatedApiToken

  /**
   * Property: Empty scopes grants access to all resources
   */
  it('should grant access when token has empty scopes', () => {
    fc.assert(
      fc.property(
        validScopeArb,
        (requiredScope) => {
          const token = validatedTokenArb([])
          const result = validateTokenScope(token, requiredScope)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Wildcard scope grants access to all resources
   */
  it('should grant access when token has wildcard scope', () => {
    fc.assert(
      fc.property(
        validScopeArb,
        scopeArrayArb,
        (requiredScope, additionalScopes) => {
          const token = validatedTokenArb([WILDCARD_SCOPE, ...additionalScopes])
          const result = validateTokenScope(token, requiredScope)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Specific scope grants access only to matching resources
   */
  it('should grant access only when required scope is in token scopes', () => {
    fc.assert(
      fc.property(
        fc.array(validScopeArb, { minLength: 1, maxLength: 5 }),
        validScopeArb,
        (tokenScopes, requiredScope) => {
          const token = validatedTokenArb(tokenScopes)
          const result = validateTokenScope(token, requiredScope)
          const hasScope = tokenScopes.includes(requiredScope)
          expect(result.success).toBe(hasScope)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Missing scope returns 403 with error message
   */
  it('should return 403 with error message when scope is missing', () => {
    fc.assert(
      fc.property(
        validScopeArb,
        (requiredScope) => {
          // Create scopes that explicitly exclude the required scope
          const otherScopes = VALID_SCOPES.filter(s => s !== requiredScope)
          if (otherScopes.length === 0) return true
          
          const token = validatedTokenArb(otherScopes)
          const result = validateTokenScope(token, requiredScope)
          
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.status).toBe(403)
            expect(result.error).toContain(requiredScope)
            expect(result.requiredScope).toBe(requiredScope)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Token Scope Validation for Path', () => {
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
  )
  
  // Arbitrary for generating valid scopes
  const validScopeArb = fc.constantFrom(...VALID_SCOPES)
  
  // Arbitrary for generating a validated API token
  const validatedTokenArb = (scopes: TokenScope[]) => ({
    id: 'test-token-id',
    organizationId: 'test-org-id',
    createdById: 'test-user-id',
    scopes,
    isActive: true,
    expiresAt: null,
  }) as ValidatedApiToken

  /**
   * Property: Empty scopes grants access to all paths
   */
  it('should grant access to all paths when token has empty scopes', () => {
    fc.assert(
      fc.property(
        apiPathArb,
        (path) => {
          const token = validatedTokenArb([])
          const result = validateTokenScopeForPath(token, path)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Wildcard scope grants access to all paths
   */
  it('should grant access to all paths when token has wildcard scope', () => {
    fc.assert(
      fc.property(
        apiPathArb,
        (path) => {
          const token = validatedTokenArb([WILDCARD_SCOPE])
          const result = validateTokenScopeForPath(token, path)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Unknown paths are allowed (no scope required)
   */
  it('should allow access to unknown paths', () => {
    fc.assert(
      fc.property(
        fc.array(validScopeArb, { minLength: 1, maxLength: 3 }),
        fc.constantFrom('/api/v1/unknown', '/api/settings', '/other/path'),
        (scopes, path) => {
          const token = validatedTokenArb(scopes)
          const result = validateTokenScopeForPath(token, path)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
