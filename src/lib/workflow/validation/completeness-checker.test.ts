/**
 * 输出完整性检查器测试
 * 
 * 包含属性测试和单元测试，验证完整性检查功能的正确性。
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { isOutputComplete } from './completeness-checker'

// ============================================
// Property Tests for Output Completeness
// ============================================

describe('Output Completeness Property Tests', () => {
  /**
   * Property 5: Output Completeness Detection
   * 
   * For any node output, if the content shows signs of truncation (unclosed brackets,
   * mid-sentence ending), the output status SHALL be 'incomplete' with a descriptive warning.
   * 
   * **Feature: node-input-status-validation, Property 5: Output Completeness Detection**
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  it('Property 5: Complete JSON is detected as complete', () => {
    fc.assert(
      fc.property(
        // Generate valid JSON values
        fc.jsonValue(),
        (jsonValue) => {
          const jsonString = JSON.stringify(jsonValue, null, 2)
          const result = isOutputComplete(jsonString, 'json')
          
          // Property: valid complete JSON should be detected as complete
          expect(result.complete).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 5: Truncated JSON is detected as incomplete', () => {
    fc.assert(
      fc.property(
        // Generate valid JSON objects
        fc.record({
          key1: fc.string(),
          key2: fc.integer(),
          key3: fc.boolean(),
        }),
        // Generate truncation point (percentage of string to keep)
        fc.integer({ min: 10, max: 90 }),
        (jsonObj, truncatePercent) => {
          const jsonString = JSON.stringify(jsonObj, null, 2)
          
          // Only test if the JSON is long enough to truncate meaningfully
          if (jsonString.length < 10) return
          
          // Truncate the JSON
          const truncateAt = Math.floor(jsonString.length * truncatePercent / 100)
          const truncated = jsonString.substring(0, truncateAt)
          
          // Skip if truncation happens to create valid JSON
          try {
            JSON.parse(truncated)
            return // Skip this case - truncation created valid JSON
          } catch {
            // Expected - truncated JSON should be invalid
          }
          
          const result = isOutputComplete(truncated, 'json')
          
          // Property: truncated JSON should be detected as incomplete
          // Note: Some truncations might not be detected if they happen at safe points
          // We only assert that IF brackets are unbalanced, it should be detected
          const openBraces = (truncated.match(/\{/g) || []).length
          const closeBraces = (truncated.match(/\}/g) || []).length
          const openBrackets = (truncated.match(/\[/g) || []).length
          const closeBrackets = (truncated.match(/\]/g) || []).length
          
          if (openBraces > closeBraces || openBrackets > closeBrackets) {
            expect(result.complete).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 5: Content ending with connectors is detected as incomplete', () => {
    fc.assert(
      fc.property(
        // Generate some text
        fc.string({ minLength: 5, maxLength: 50 }),
        // Generate a connector word
        fc.constantFrom(
          'and ', 'or ', 'but ', 'the ', 'because ', 'therefore ',
          '和 ', '或 ', '但 ', '因为 ', '所以 '
        ),
        (text, connector) => {
          // Create content that ends with a connector
          const content = text + ' ' + connector
          const result = isOutputComplete(content, 'text')
          
          // Property: content ending with connector should be detected as incomplete
          expect(result.complete).toBe(false)
          expect(result.reason).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Unit Tests for JSON Completeness
// ============================================

describe('isOutputComplete - JSON', () => {
  it('should detect complete JSON object', () => {
    const result = isOutputComplete('{"key": "value"}', 'json')
    expect(result.complete).toBe(true)
  })

  it('should detect complete JSON array', () => {
    const result = isOutputComplete('[1, 2, 3]', 'json')
    expect(result.complete).toBe(true)
  })

  it('should detect complete nested JSON', () => {
    const json = '{"outer": {"inner": [1, 2, {"deep": "value"}]}}'
    const result = isOutputComplete(json, 'json')
    expect(result.complete).toBe(true)
  })

  it('should detect incomplete JSON with unclosed brace', () => {
    const result = isOutputComplete('{"key": "value"', 'json')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('大括号')
  })

  it('should detect incomplete JSON with unclosed bracket', () => {
    const result = isOutputComplete('[1, 2, 3', 'json')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('方括号')
  })

  it('should detect incomplete JSON with unclosed string', () => {
    const result = isOutputComplete('{"key": "value', 'json')
    expect(result.complete).toBe(false)
    // The checker detects unclosed braces first
    expect(result.reason).toBeDefined()
  })

  it('should detect incomplete nested JSON', () => {
    const result = isOutputComplete('{"outer": {"inner": [1, 2', 'json')
    expect(result.complete).toBe(false)
  })

  it('should handle empty content', () => {
    const result = isOutputComplete('', 'json')
    expect(result.complete).toBe(true) // Empty is considered complete
  })
})

// ============================================
// Unit Tests for HTML Completeness
// ============================================

describe('isOutputComplete - HTML', () => {
  it('should detect complete HTML', () => {
    const html = '<div><p>Hello</p></div>'
    const result = isOutputComplete(html, 'html')
    expect(result.complete).toBe(true)
  })

  it('should detect complete HTML document', () => {
    const html = '<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>'
    const result = isOutputComplete(html, 'html')
    expect(result.complete).toBe(true)
  })

  it('should detect incomplete HTML with unclosed div', () => {
    const html = '<div><p>Hello</p>'
    const result = isOutputComplete(html, 'html')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('div')
  })

  it('should detect incomplete HTML with unclosed body', () => {
    const html = '<html><body><h1>Hello</h1>'
    const result = isOutputComplete(html, 'html')
    expect(result.complete).toBe(false)
  })

  it('should allow self-closing tags', () => {
    const html = '<div><img src="test.png" /><br></div>'
    const result = isOutputComplete(html, 'html')
    expect(result.complete).toBe(true)
  })

  it('should handle HTML fragments', () => {
    const html = '<p>Just a paragraph</p>'
    const result = isOutputComplete(html, 'html')
    expect(result.complete).toBe(true)
  })
})

// ============================================
// Unit Tests for Text Completeness
// ============================================

describe('isOutputComplete - Text', () => {
  it('should detect complete sentence', () => {
    const result = isOutputComplete('This is a complete sentence.', 'text')
    expect(result.complete).toBe(true)
  })

  it('should detect incomplete sentence ending with "and"', () => {
    const result = isOutputComplete('This is incomplete and ', 'text')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('连接词')
  })

  it('should detect incomplete sentence ending with "the"', () => {
    const result = isOutputComplete('Please check the ', 'text')
    expect(result.complete).toBe(false)
  })

  it('should detect incomplete sentence ending with colon', () => {
    const result = isOutputComplete('Here are the items: ', 'text')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('冒号')
  })

  it('should detect incomplete list item', () => {
    const result = isOutputComplete('1. First item\n2. ', 'text')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('列表')
  })

  it('should detect incomplete bullet list', () => {
    const result = isOutputComplete('- First item\n- ', 'text')
    expect(result.complete).toBe(false)
  })

  it('should detect content ending with comma', () => {
    const result = isOutputComplete('Item 1, Item 2,', 'text')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('逗号')
  })

  it('should allow ellipsis at end', () => {
    const result = isOutputComplete('To be continued...', 'text')
    expect(result.complete).toBe(true)
  })

  it('should detect unclosed code block', () => {
    const result = isOutputComplete('Here is code:\n```javascript\nconst x = 1', 'text')
    expect(result.complete).toBe(false)
    expect(result.reason).toContain('代码块')
  })

  it('should allow closed code block', () => {
    // Code block is closed, but the content ends with "const x = 1" which doesn't trigger truncation
    const result = isOutputComplete('Here is code:\n```javascript\nconst x = 1;\n```', 'text')
    expect(result.complete).toBe(true)
  })
})

// ============================================
// Unit Tests for Chinese Text
// ============================================

describe('isOutputComplete - Chinese Text', () => {
  it('should detect incomplete Chinese sentence ending with "和"', () => {
    const result = isOutputComplete('这是第一项和 ', 'text')
    expect(result.complete).toBe(false)
  })

  it('should detect incomplete Chinese sentence ending with "因为"', () => {
    const result = isOutputComplete('这很重要，因为 ', 'text')
    expect(result.complete).toBe(false)
  })

  it('should detect complete Chinese sentence', () => {
    const result = isOutputComplete('这是一个完整的句子。', 'text')
    expect(result.complete).toBe(true)
  })
})

// ============================================
// Edge Cases
// ============================================

describe('isOutputComplete - Edge Cases', () => {
  it('should handle null-like content', () => {
    expect(isOutputComplete('', 'text').complete).toBe(true)
    expect(isOutputComplete('   ', 'text').complete).toBe(true)
  })

  it('should handle very long content', () => {
    const longContent = 'A'.repeat(10000) + '.'
    const result = isOutputComplete(longContent, 'text')
    expect(result.complete).toBe(true)
  })

  it('should handle content with special characters that form complete sentences', () => {
    // Content that ends with a period is complete
    const content = 'Special chars: @#$%^&*.'
    const result = isOutputComplete(content, 'text')
    expect(result.complete).toBe(true)
  })

  it('should handle mixed content that forms complete sentences', () => {
    // Content that ends with a period is complete
    const content = 'Text with JSON: {"key": "value"} and more text.'
    const result = isOutputComplete(content, 'text')
    expect(result.complete).toBe(true)
  })

  it('should handle undefined type', () => {
    const result = isOutputComplete('Complete text.', undefined)
    expect(result.complete).toBe(true)
  })
})
