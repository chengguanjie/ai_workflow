import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  ERROR_CATALOG,
  getCatalogEntry,
  getCausesForError,
  getSolutionsForError,
  getAllErrorCodes,
  getErrorCodesByCategory,
  hasErrorCode,
} from './catalog'
import type { ErrorCategory } from './types'

/**
 * **Feature: enhanced-error-handling, Property 2: Error Catalog Coverage**
 * **Validates: Requirements 2.3, 2.4**
 * 
 * For any error code defined in the system, there SHALL exist a corresponding
 * entry in the ErrorCatalog with at least one cause and one solution.
 */
describe('Property 2: Error Catalog Coverage', () => {
  // Get all error codes from the catalog
  const allErrorCodes = getAllErrorCodes()

  it('every error code in catalog should have at least one cause', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const entry = getCatalogEntry(code)
          expect(entry).toBeDefined()
          expect(entry!.causes.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every error code in catalog should have at least one solution', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const entry = getCatalogEntry(code)
          expect(entry).toBeDefined()
          expect(entry!.solutions.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getCausesForError should return causes for valid codes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const causes = getCausesForError(code)
          const entry = getCatalogEntry(code)
          
          expect(causes).toEqual(entry!.causes)
          expect(causes.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSolutionsForError should return solutions for valid codes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const solutions = getSolutionsForError(code)
          const entry = getCatalogEntry(code)
          
          expect(solutions).toEqual(entry!.solutions)
          expect(solutions.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every cause should have valid structure', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const causes = getCausesForError(code)
          
          for (const cause of causes) {
            expect(typeof cause.id).toBe('string')
            expect(cause.id.length).toBeGreaterThan(0)
            expect(typeof cause.description).toBe('string')
            expect(cause.description.length).toBeGreaterThan(0)
            expect(['high', 'medium', 'low']).toContain(cause.likelihood)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every solution should have valid structure', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const solutions = getSolutionsForError(code)
          
          for (const solution of solutions) {
            expect(typeof solution.id).toBe('string')
            expect(solution.id.length).toBeGreaterThan(0)
            expect(typeof solution.description).toBe('string')
            expect(solution.description.length).toBeGreaterThan(0)
            expect(['manual', 'automatic', 'link']).toContain(solution.actionType)
            
            // If actionType is 'link', actionUrl should be defined
            if (solution.actionType === 'link') {
              expect(solution.actionUrl).toBeDefined()
              expect(typeof solution.actionUrl).toBe('string')
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every catalog entry should have valid category', () => {
    const validCategories: ErrorCategory[] = [
      'validation',
      'authentication',
      'authorization',
      'network',
      'database',
      'file_system',
      'external_service',
      'workflow',
      'internal',
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const entry = getCatalogEntry(code)
          expect(validCategories).toContain(entry!.category)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every catalog entry should have valid severity', () => {
    const validSeverities = ['info', 'warning', 'error', 'critical']

    fc.assert(
      fc.property(
        fc.constantFrom(...allErrorCodes),
        (code) => {
          const entry = getCatalogEntry(code)
          expect(validSeverities).toContain(entry!.severity)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('ErrorCatalog lookup functions', () => {
  it('getCatalogEntry should return undefined for unknown codes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !hasErrorCode(s)),
        (unknownCode) => {
          const entry = getCatalogEntry(unknownCode)
          expect(entry).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getCausesForError should return empty array for unknown codes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !hasErrorCode(s)),
        (unknownCode) => {
          const causes = getCausesForError(unknownCode)
          expect(causes).toEqual([])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSolutionsForError should return empty array for unknown codes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !hasErrorCode(s)),
        (unknownCode) => {
          const solutions = getSolutionsForError(unknownCode)
          expect(solutions).toEqual([])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('hasErrorCode should correctly identify known codes', () => {
    const allCodes = getAllErrorCodes()
    
    fc.assert(
      fc.property(
        fc.constantFrom(...allCodes),
        (code) => {
          expect(hasErrorCode(code)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getErrorCodesByCategory should return codes for each category', () => {
    const categories: ErrorCategory[] = [
      'validation',
      'authentication',
      'authorization',
      'database',
      'file_system',
      'external_service',
      'workflow',
      'internal',
    ]

    for (const category of categories) {
      const codes = getErrorCodesByCategory(category)
      
      // Each returned code should have the correct category
      for (const code of codes) {
        const entry = getCatalogEntry(code)
        expect(entry?.category).toBe(category)
      }
    }
  })

  it('catalog should cover all required categories', () => {
    const requiredCategories: ErrorCategory[] = [
      'validation',
      'authentication',
      'authorization',
      'database',
      'file_system',
      'external_service',
      'workflow',
      'internal',
    ]

    for (const category of requiredCategories) {
      const codes = getErrorCodesByCategory(category)
      expect(codes.length).toBeGreaterThanOrEqual(1)
    }
  })
})
