/**
 * Property-based tests for SQL Identifier Validator
 * 
 * **Feature: security-vulnerabilities-fix**
 * 
 * Tests Property 3: SQL Identifier Validation Correctness
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  validateIdentifier,
  validateTableName,
  validateIndexName,
  getSafeIdentifier,
  getSafeTableName,
  getSafeIndexName,
  isReservedKeyword,
  SQLValidationError,
  SQL_RESERVED_KEYWORDS,
} from './sql-validator'

/**
 * **Feature: security-vulnerabilities-fix, Property 3: SQL Identifier Validation Correctness**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 * 
 * For any string input to the SQL identifier validator:
 * - If the string matches the pattern ^[a-zA-Z_][a-zA-Z0-9_]{0,63}$ and is not a SQL reserved keyword,
 *   the validator SHALL return true
 * - Otherwise it SHALL return false
 */
describe('Property 3: SQL Identifier Validation Correctness', () => {
  // Arbitrary for generating valid identifier first characters (letter or underscore)
  const validFirstCharArb = fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')
  )

  // Arbitrary for generating valid subsequent characters (letter, digit, or underscore)
  const validSubsequentCharArb = fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')
  )

  // Arbitrary for generating valid identifiers (not checking reserved keywords)
  const validIdentifierPatternArb = fc.tuple(
    validFirstCharArb,
    fc.array(validSubsequentCharArb, { minLength: 0, maxLength: 63 })
  ).map(([first, rest]) => first + rest.join(''))
    .filter(id => !SQL_RESERVED_KEYWORDS.has(id.toLowerCase()))

  // Arbitrary for generating invalid first characters
  const invalidFirstCharArb = fc.constantFrom(
    ...'0123456789!@#$%^&*()-+=[]{}|;:\'",.<>?/`~ '.split('')
  )

  // Arbitrary for generating special characters that should be rejected
  const specialCharArb = fc.constantFrom(
    ...'!@#$%^&*()-+=[]{}|;:\'",.<>?/`~ \t\n\r'.split('')
  )

  // Arbitrary for SQL reserved keywords
  const reservedKeywordArb = fc.constantFrom(...Array.from(SQL_RESERVED_KEYWORDS))

  it('should accept valid identifiers matching the pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdentifierPatternArb,
        async (identifier) => {
          const result = validateIdentifier(identifier)
          expect(result.valid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject identifiers starting with a digit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...'0123456789'.split('')),
        fc.array(validSubsequentCharArb, { minLength: 0, maxLength: 10 }),
        async (firstDigit, rest) => {
          const identifier = firstDigit + rest.join('')
          const result = validateIdentifier(identifier)
          expect(result.valid).toBe(false)
          expect(result.error).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject identifiers starting with special characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidFirstCharArb,
        fc.array(validSubsequentCharArb, { minLength: 0, maxLength: 10 }),
        async (firstChar, rest) => {
          const identifier = firstChar + rest.join('')
          const result = validateIdentifier(identifier)
          expect(result.valid).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject identifiers containing special characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validFirstCharArb,
        fc.array(validSubsequentCharArb, { minLength: 1, maxLength: 5 }),
        specialCharArb,
        fc.array(validSubsequentCharArb, { minLength: 0, maxLength: 5 }),
        async (first, before, special, after) => {
          const identifier = first + before.join('') + special + after.join('')
          const result = validateIdentifier(identifier)
          expect(result.valid).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject SQL reserved keywords (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(
        reservedKeywordArb,
        fc.boolean(),
        async (keyword, uppercase) => {
          const identifier = uppercase ? keyword.toUpperCase() : keyword.toLowerCase()
          const result = validateIdentifier(identifier)
          expect(result.valid).toBe(false)
          expect(result.error).toContain('reserved keyword')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject identifiers exceeding 64 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validFirstCharArb,
        fc.array(validSubsequentCharArb, { minLength: 64, maxLength: 100 }),
        async (first, rest) => {
          const identifier = first + rest.join('')
          expect(identifier.length).toBeGreaterThan(64)
          const result = validateIdentifier(identifier)
          expect(result.valid).toBe(false)
          expect(result.error).toContain('64 characters')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject empty strings', async () => {
    const result = validateIdentifier('')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should reject null and undefined', async () => {
    // @ts-expect-error Testing invalid input
    expect(validateIdentifier(null).valid).toBe(false)
    // @ts-expect-error Testing invalid input
    expect(validateIdentifier(undefined).valid).toBe(false)
  })

  it('validateTableName should validate table names correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdentifierPatternArb,
        async (tableName) => {
          const result = validateTableName(tableName)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('validateIndexName should validate index names correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdentifierPatternArb,
        async (indexName) => {
          const result = validateIndexName(indexName)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSafeIdentifier should return valid identifiers', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdentifierPatternArb,
        async (identifier) => {
          const result = getSafeIdentifier(identifier)
          expect(result).toBe(identifier)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSafeIdentifier should throw for invalid identifiers', async () => {
    await fc.assert(
      fc.asyncProperty(
        reservedKeywordArb,
        async (keyword) => {
          expect(() => getSafeIdentifier(keyword)).toThrow(SQLValidationError)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSafeTableName should throw for invalid table names', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidFirstCharArb,
        fc.array(validSubsequentCharArb, { minLength: 0, maxLength: 5 }),
        async (first, rest) => {
          const tableName = first + rest.join('')
          expect(() => getSafeTableName(tableName)).toThrow(SQLValidationError)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSafeIndexName should throw for invalid index names', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidFirstCharArb,
        fc.array(validSubsequentCharArb, { minLength: 0, maxLength: 5 }),
        async (first, rest) => {
          const indexName = first + rest.join('')
          expect(() => getSafeIndexName(indexName)).toThrow(SQLValidationError)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('isReservedKeyword should correctly identify reserved keywords', async () => {
    await fc.assert(
      fc.asyncProperty(
        reservedKeywordArb,
        fc.boolean(),
        async (keyword, uppercase) => {
          const word = uppercase ? keyword.toUpperCase() : keyword.toLowerCase()
          expect(isReservedKeyword(word)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('isReservedKeyword should return false for non-reserved words', async () => {
    await fc.assert(
      fc.asyncProperty(
        validIdentifierPatternArb,
        async (identifier) => {
          // validIdentifierPatternArb already filters out reserved keywords
          expect(isReservedKeyword(identifier)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Deterministic property: validation is consistent
  it('validation should be deterministic - same input always produces same result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 100 }),
        async (input) => {
          const result1 = validateIdentifier(input)
          const result2 = validateIdentifier(input)
          expect(result1.valid).toBe(result2.valid)
          expect(result1.error).toBe(result2.error)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Additional unit tests for edge cases
 */
describe('SQL Validator Edge Cases', () => {
  it('should accept single character identifiers', () => {
    expect(validateIdentifier('a').valid).toBe(true)
    expect(validateIdentifier('_').valid).toBe(true)
    expect(validateIdentifier('Z').valid).toBe(true)
  })

  it('should accept identifiers with mixed case', () => {
    expect(validateIdentifier('MyTable').valid).toBe(true)
    expect(validateIdentifier('my_Table_Name').valid).toBe(true)
    expect(validateIdentifier('TABLE_123').valid).toBe(true)
  })

  it('should accept identifiers with numbers (not at start)', () => {
    expect(validateIdentifier('table1').valid).toBe(true)
    expect(validateIdentifier('t123').valid).toBe(true)
    expect(validateIdentifier('_123').valid).toBe(true)
  })

  it('should reject identifiers with SQL injection patterns', () => {
    expect(validateIdentifier('table; DROP TABLE users;--').valid).toBe(false)
    expect(validateIdentifier("table' OR '1'='1").valid).toBe(false)
    expect(validateIdentifier('table/*comment*/').valid).toBe(false)
    expect(validateIdentifier('table--comment').valid).toBe(false)
  })

  it('should reject identifiers with path traversal patterns', () => {
    expect(validateIdentifier('../etc/passwd').valid).toBe(false)
    expect(validateIdentifier('..\\windows\\system32').valid).toBe(false)
  })

  it('should reject identifiers with whitespace', () => {
    expect(validateIdentifier('table name').valid).toBe(false)
    expect(validateIdentifier('table\tname').valid).toBe(false)
    expect(validateIdentifier('table\nname').valid).toBe(false)
  })

  it('should handle exactly 64 character identifiers', () => {
    const maxLengthId = 'a'.repeat(64)
    expect(validateIdentifier(maxLengthId).valid).toBe(true)
    
    const tooLongId = 'a'.repeat(65)
    expect(validateIdentifier(tooLongId).valid).toBe(false)
  })
})
