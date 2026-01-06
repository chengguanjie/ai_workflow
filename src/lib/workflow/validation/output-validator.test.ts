/**
 * 输出验证器测试
 * 
 * 包含属性测试和单元测试，验证输出验证功能的正确性。
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateNodeOutput, isOutputValid } from './output-validator'
import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'

// ============================================
// Test Helpers
// ============================================

/**
 * 创建模拟的 PROCESS 节点配置
 */
function createMockProcessNode(
  id: string,
  name: string,
  expectedOutputType?: 'text' | 'json' | 'html' | 'csv' | 'word' | 'pdf' | 'excel' | 'ppt' | 'image' | 'audio' | 'video'
): ProcessNodeConfig {
  return {
    id,
    type: 'PROCESS',
    name,
    position: { x: 0, y: 0 },
    config: {
      userPrompt: '',
      systemPrompt: '',
      expectedOutputType,
    },
  }
}

// ============================================
// Property Tests for Output Type Matching
// ============================================

describe('Output Validator Property Tests', () => {
  /**
   * Property 4: Output Type Matching
   * 
   * For any node output with a configured `expectedOutputType`, the output status SHALL be
   * 'invalid' if the actual output does not match the expected type format (e.g., invalid JSON
   * for 'json' type, invalid HTML for 'html' type).
   * 
   * **Feature: node-input-status-validation, Property 4: Output Type Matching**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
   */
  it('Property 4: Valid JSON output with json type returns valid', () => {
    fc.assert(
      fc.property(
        // Generate valid JSON values
        fc.jsonValue(),
        (jsonValue) => {
          const jsonString = JSON.stringify(jsonValue)
          const node = createMockProcessNode('node-1', 'TestNode', 'json')
          const output = { result: jsonString }
          
          const result = validateNodeOutput({
            nodeConfig: node,
            output,
            expectedOutputType: 'json',
          })
          
          // Property: valid JSON with json type should return valid
          expect(result.status).toBe('valid')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Invalid JSON output with json type returns invalid', () => {
    fc.assert(
      fc.property(
        // Generate invalid JSON strings
        fc.oneof(
          fc.constant('{"key": "value"'), // Unclosed brace
          fc.constant('[1, 2, 3'), // Unclosed bracket
          fc.constant('{key: "value"}'), // Missing quotes on key
          fc.constant('not json at all'),
        ),
        (invalidJson) => {
          const node = createMockProcessNode('node-1', 'TestNode', 'json')
          const output = { result: invalidJson }
          
          const result = validateNodeOutput({
            nodeConfig: node,
            output,
            expectedOutputType: 'json',
          })
          
          // Property: invalid JSON with json type should return invalid
          expect(result.status).toBe('invalid')
          expect(result.error).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Valid HTML output with html type returns valid', () => {
    fc.assert(
      fc.property(
        // Generate valid HTML content
        fc.constantFrom(
          '<div>Hello</div>',
          '<p>Paragraph</p>',
          '<html><body><h1>Title</h1></body></html>',
          '<ul><li>Item 1</li><li>Item 2</li></ul>',
          '<table><tr><td>Cell</td></tr></table>',
        ),
        (htmlContent) => {
          const node = createMockProcessNode('node-1', 'TestNode', 'html')
          const output = { result: htmlContent }
          
          const result = validateNodeOutput({
            nodeConfig: node,
            output,
            expectedOutputType: 'html',
          })
          
          // Property: valid HTML with html type should return valid
          expect(result.status).toBe('valid')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Invalid HTML output with html type returns invalid', () => {
    fc.assert(
      fc.property(
        // Generate invalid HTML content (plain text without tags)
        fc.string({ minLength: 10, maxLength: 50 })
          .filter((s: string) => !/<[a-zA-Z]/.test(s)), // No HTML tags
        (plainText) => {
          const node = createMockProcessNode('node-1', 'TestNode', 'html')
          const output = { result: plainText }
          
          const result = validateNodeOutput({
            nodeConfig: node,
            output,
            expectedOutputType: 'html',
          })
          
          // Property: plain text with html type should return invalid
          expect(result.status).toBe('invalid')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Valid CSV output with csv type returns valid', () => {
    fc.assert(
      fc.property(
        // Generate valid CSV content using simpler approach
        fc.integer({ min: 2, max: 5 }), // number of rows
        fc.integer({ min: 2, max: 4 }), // number of columns
        (numRows, numCols) => {
          // Generate simple CSV content
          const rows: string[] = []
          for (let i = 0; i < numRows; i++) {
            const cols: string[] = []
            for (let j = 0; j < numCols; j++) {
              cols.push(`cell${i}${j}`)
            }
            rows.push(cols.join(','))
          }
          
          const csvContent = rows.join('\n')
          const node = createMockProcessNode('node-1', 'TestNode', 'csv')
          const output = { result: csvContent }
          
          const result = validateNodeOutput({
            nodeConfig: node,
            output,
            expectedOutputType: 'csv',
          })
          
          // Property: valid CSV with csv type should return valid
          expect(result.status).toBe('valid')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 4: Empty output returns empty status', () => {
    fc.assert(
      fc.property(
        // Generate output type
        fc.constantFrom('json', 'html', 'csv', 'text'),
        (outputType) => {
          const node = createMockProcessNode('node-1', 'TestNode', outputType)
          const output = {} // Empty output
          
          const result = validateNodeOutput({
            nodeConfig: node,
            output,
            expectedOutputType: outputType as 'json' | 'html' | 'csv' | 'text',
          })
          
          // Property: empty output should return empty status
          expect(result.status).toBe('empty')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Unit Tests for validateNodeOutput
// ============================================

describe('validateNodeOutput', () => {
  describe('Empty Output Handling', () => {
    it('should return empty for null-like output', () => {
      const node = createMockProcessNode('node-1', 'TestNode')
      
      expect(validateNodeOutput({ nodeConfig: node, output: {} }).status).toBe('empty')
      expect(validateNodeOutput({ nodeConfig: node, output: { result: '' } }).status).toBe('empty')
      expect(validateNodeOutput({ nodeConfig: node, output: { result: '   ' } }).status).toBe('empty')
    })

    it('should return empty for output with only null values', () => {
      const node = createMockProcessNode('node-1', 'TestNode')
      const output = { result: null, data: undefined }
      
      const result = validateNodeOutput({ nodeConfig: node, output: output as Record<string, unknown> })
      expect(result.status).toBe('empty')
    })
  })

  describe('JSON Type Validation', () => {
    it('should validate valid JSON object', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'json')
      const output = { result: '{"name": "test", "value": 123}' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'json',
      })
      
      expect(result.status).toBe('valid')
    })

    it('should validate valid JSON array', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'json')
      const output = { result: '[1, 2, 3]' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'json',
      })
      
      expect(result.status).toBe('valid')
    })

    it('should reject invalid JSON', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'json')
      const output = { result: '{invalid json}' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'json',
      })
      
      expect(result.status).toBe('invalid')
      expect(result.error).toContain('JSON')
    })

    it('should detect incomplete JSON', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'json')
      const output = { result: '{"key": "value"' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'json',
      })
      
      // Should be invalid because JSON parsing fails
      expect(result.status).toBe('invalid')
    })
  })

  describe('HTML Type Validation', () => {
    it('should validate valid HTML', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'html')
      const output = { result: '<div><p>Hello World</p></div>' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'html',
      })
      
      expect(result.status).toBe('valid')
    })

    it('should reject plain text as HTML', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'html')
      const output = { result: 'This is plain text without any HTML tags' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'html',
      })
      
      expect(result.status).toBe('invalid')
      expect(result.error).toContain('HTML')
    })
  })

  describe('CSV Type Validation', () => {
    it('should validate valid CSV', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'csv')
      const output = { result: 'name,age,city\nJohn,30,NYC\nJane,25,LA' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'csv',
      })
      
      expect(result.status).toBe('valid')
    })

    it('should validate single column CSV', () => {
      const node = createMockProcessNode('node-1', 'TestNode', 'csv')
      const output = { result: 'name\nJohn\nJane' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
        expectedOutputType: 'csv',
      })
      
      expect(result.status).toBe('valid')
    })
  })

  describe('No Type Specified', () => {
    it('should return valid for non-empty output without type', () => {
      const node = createMockProcessNode('node-1', 'TestNode')
      const output = { result: 'Some output content' }
      
      const result = validateNodeOutput({
        nodeConfig: node,
        output,
      })
      
      expect(result.status).toBe('valid')
    })

    it('should extract content from various field names', () => {
      const node = createMockProcessNode('node-1', 'TestNode')
      
      // Test different field names
      expect(validateNodeOutput({ nodeConfig: node, output: { result: 'content' } }).status).toBe('valid')
      expect(validateNodeOutput({ nodeConfig: node, output: { output: 'content' } }).status).toBe('valid')
      expect(validateNodeOutput({ nodeConfig: node, output: { content: 'content' } }).status).toBe('valid')
      expect(validateNodeOutput({ nodeConfig: node, output: { text: 'content' } }).status).toBe('valid')
      expect(validateNodeOutput({ nodeConfig: node, output: { response: 'content' } }).status).toBe('valid')
      expect(validateNodeOutput({ nodeConfig: node, output: { data: 'content' } }).status).toBe('valid')
    })
  })
})

// ============================================
// Unit Tests for isOutputValid
// ============================================

describe('isOutputValid', () => {
  it('should return true for non-empty output', () => {
    expect(isOutputValid({ result: 'content' })).toBe(true)
    expect(isOutputValid({ data: { nested: 'value' } })).toBe(true)
    expect(isOutputValid({ count: 0 })).toBe(true) // 0 is a valid value
  })

  it('should return false for empty output', () => {
    expect(isOutputValid({})).toBe(false)
    expect(isOutputValid({ result: '' })).toBe(false)
    expect(isOutputValid({ result: '   ' })).toBe(false)
    expect(isOutputValid({ result: null } as Record<string, unknown>)).toBe(false)
  })
})
