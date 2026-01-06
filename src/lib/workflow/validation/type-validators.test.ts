/**
 * 类型验证器测试
 * 
 * 包含属性测试和单元测试，验证类型验证功能的正确性。
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  jsonValidator,
  htmlValidator,
  csvValidator,
  registerValidator,
  getValidator,
} from './type-validators'

// ============================================
// Property Tests for JSON Validation
// ============================================

describe('JSON Validator Property Tests', () => {
  /**
   * Property 7: JSON Validation Round-Trip
   * 
   * For any valid JSON string, `validateNodeOutput` with `expectedOutputType: 'json'`
   * SHALL return status 'valid'; for any invalid JSON string, it SHALL return status 'invalid'.
   * 
   * **Feature: node-input-status-validation, Property 7: JSON Validation Round-Trip**
   * **Validates: Requirements 6.2**
   */
  it('Property 7: JSON Validation Round-Trip - valid JSON returns valid', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary JSON values
        fc.jsonValue(),
        (jsonValue) => {
          // Serialize to string
          const jsonString = JSON.stringify(jsonValue)
          
          // Validate
          const result = jsonValidator.validate(jsonString)
          
          // Property: valid JSON should always return valid
          expect(result.valid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: JSON Validation Round-Trip - invalid JSON returns invalid', () => {
    fc.assert(
      fc.property(
        // Generate strings that are definitely not valid JSON
        fc.oneof(
          // Unclosed braces
          fc.constant('{"key": "value"'),
          fc.constant('{"nested": {"key": "value"}'),
          // Unclosed brackets
          fc.constant('[1, 2, 3'),
          fc.constant('[[1, 2], [3, 4]'),
          // Invalid syntax
          fc.constant('{key: "value"}'), // Missing quotes on key
          fc.constant("{'key': 'value'}"), // Single quotes
          fc.constant('{\"key\": undefined}'), // undefined is not valid JSON
          // Trailing commas
          fc.constant('{"key": "value",}'),
          fc.constant('[1, 2, 3,]'),
          // Random non-JSON strings
          fc.string({ minLength: 1, maxLength: 20 })
            .filter((s: string) => {
              try {
                JSON.parse(s)
                return false // Exclude valid JSON
              } catch {
                return true // Keep invalid JSON
              }
            })
        ),
        (invalidJson) => {
          const result = jsonValidator.validate(invalidJson)
          
          // Property: invalid JSON should return invalid
          expect(result.valid).toBe(false)
          expect(result.error).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Unit Tests for JSON Validator
// ============================================

describe('jsonValidator', () => {
  it('should validate empty object', () => {
    const result = jsonValidator.validate('{}')
    expect(result.valid).toBe(true)
  })

  it('should validate empty array', () => {
    const result = jsonValidator.validate('[]')
    expect(result.valid).toBe(true)
  })

  it('should validate simple object', () => {
    const result = jsonValidator.validate('{"name": "test", "value": 123}')
    expect(result.valid).toBe(true)
  })

  it('should validate nested object', () => {
    const result = jsonValidator.validate('{"outer": {"inner": {"deep": "value"}}}')
    expect(result.valid).toBe(true)
  })

  it('should validate array of objects', () => {
    const result = jsonValidator.validate('[{"id": 1}, {"id": 2}]')
    expect(result.valid).toBe(true)
  })

  it('should validate primitive values', () => {
    expect(jsonValidator.validate('"string"').valid).toBe(true)
    expect(jsonValidator.validate('123').valid).toBe(true)
    expect(jsonValidator.validate('true').valid).toBe(true)
    expect(jsonValidator.validate('false').valid).toBe(true)
    expect(jsonValidator.validate('null').valid).toBe(true)
  })

  it('should reject empty content', () => {
    const result = jsonValidator.validate('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('内容为空')
  })

  it('should reject whitespace-only content', () => {
    const result = jsonValidator.validate('   ')
    expect(result.valid).toBe(false)
  })

  it('should reject unclosed braces', () => {
    const result = jsonValidator.validate('{"key": "value"')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('JSON')
  })

  it('should reject unclosed brackets', () => {
    const result = jsonValidator.validate('[1, 2, 3')
    expect(result.valid).toBe(false)
  })

  it('should reject invalid syntax', () => {
    const result = jsonValidator.validate('{key: "value"}')
    expect(result.valid).toBe(false)
  })

  it('should reject plain text', () => {
    const result = jsonValidator.validate('This is plain text')
    expect(result.valid).toBe(false)
  })
})

// ============================================
// Unit Tests for HTML Validator
// ============================================

describe('htmlValidator', () => {
  it('should validate simple HTML', () => {
    const result = htmlValidator.validate('<div>Hello</div>')
    expect(result.valid).toBe(true)
  })

  it('should validate HTML with attributes', () => {
    const result = htmlValidator.validate('<div class="container" id="main">Content</div>')
    expect(result.valid).toBe(true)
  })

  it('should validate nested HTML', () => {
    const result = htmlValidator.validate('<div><p>Paragraph</p><span>Span</span></div>')
    expect(result.valid).toBe(true)
  })

  it('should validate self-closing tags', () => {
    const result = htmlValidator.validate('<img src="image.png" /><br><hr>')
    expect(result.valid).toBe(true)
  })

  it('should validate full HTML document', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body><h1>Hello</h1></body>
      </html>
    `
    const result = htmlValidator.validate(html)
    expect(result.valid).toBe(true)
  })

  it('should validate HTML fragment', () => {
    const result = htmlValidator.validate('<p>This is a paragraph</p>')
    expect(result.valid).toBe(true)
  })

  it('should reject empty content', () => {
    const result = htmlValidator.validate('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('内容为空')
  })

  it('should reject plain text without tags', () => {
    const result = htmlValidator.validate('This is plain text without any HTML tags')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('HTML')
  })

  it('should reject content with only custom tags', () => {
    const result = htmlValidator.validate('<customtag>Content</customtag>')
    expect(result.valid).toBe(false)
  })
})

// ============================================
// Unit Tests for CSV Validator
// ============================================

describe('csvValidator', () => {
  it('should validate simple CSV with commas', () => {
    const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('should validate CSV with semicolons', () => {
    const csv = 'name;age;city\nJohn;30;NYC\nJane;25;LA'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('should validate CSV with tabs', () => {
    const csv = 'name\tage\tcity\nJohn\t30\tNYC\nJane\t25\tLA'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('should validate CSV with quoted fields', () => {
    const csv = '"name","description"\n"John","A person, who lives in NYC"'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('should validate single column CSV', () => {
    const csv = 'name\nJohn\nJane\nBob'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('should validate CSV with empty cells', () => {
    const csv = 'name,age,city\nJohn,,NYC\n,25,LA'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('should reject empty content', () => {
    const result = csvValidator.validate('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('内容为空')
  })

  it('should handle Windows line endings', () => {
    const csv = 'name,age\r\nJohn,30\r\nJane,25'
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })
})

// ============================================
// Unit Tests for Validator Registry
// ============================================

describe('Validator Registry', () => {
  it('should get registered validators', () => {
    expect(getValidator('json')).toBe(jsonValidator)
    expect(getValidator('html')).toBe(htmlValidator)
    expect(getValidator('csv')).toBe(csvValidator)
  })

  it('should return undefined for unregistered types', () => {
    expect(getValidator('word')).toBeUndefined()
    expect(getValidator('pdf')).toBeUndefined()
  })

  it('should allow registering custom validators', () => {
    const customValidator = {
      type: 'text' as const,
      validate: (content: string) => ({ valid: content.length > 0 }),
    }
    
    registerValidator(customValidator)
    
    expect(getValidator('text')).toBe(customValidator)
  })
})
