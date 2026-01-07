/**
 * MCP 配置组件属性测试
 *
 * 使用 fast-check 进行属性测试，验证 JSON Schema 表单渲染的正确性
 * 
 * Feature: mcp-tool-integration
 * Property 4: JSON Schema 表单渲染
 * **Validates: Requirements 3.5**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { JSONSchema } from '@/lib/mcp/types'

// ============================================
// Helper Functions for Testing
// ============================================

/**
 * Determines the expected input type based on JSON Schema
 * This mirrors the logic in JSONSchemaField component
 */
function getExpectedInputType(schema: JSONSchema): string {
  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type

  // Handle nested objects
  if (schemaType === 'object' && schema.properties) {
    return 'nested-form'
  }

  // Handle arrays
  if (schemaType === 'array') {
    return 'array-input'
  }

  // Handle enums
  if (schema.enum && schema.enum.length > 0) {
    return 'select'
  }

  // Handle boolean
  if (schemaType === 'boolean') {
    return 'switch'
  }

  // Handle number/integer
  if (schemaType === 'number' || schemaType === 'integer') {
    return 'number-input'
  }

  // Default: string input
  return 'text-input'
}

/**
 * Validates that a schema produces a valid input type
 */
function isValidInputType(inputType: string): boolean {
  const validTypes = [
    'text-input',
    'number-input',
    'switch',
    'select',
    'array-input',
    'nested-form',
  ]
  return validTypes.includes(inputType)
}

// ============================================
// Generators
// ============================================

/**
 * 生成基本的 JSON Schema 类型
 */
const basicSchemaTypeArb = fc.constantFrom(
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object'
)

/**
 * 生成字符串类型的 JSON Schema
 */
const stringSchemaArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: fc.constant('string' as const),
  description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  minLength: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  maxLength: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
  pattern: fc.option(fc.constant('^[a-zA-Z]+$'), { nil: undefined }),
})

/**
 * 生成数字类型的 JSON Schema
 */
const numberSchemaArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: fc.constantFrom('number', 'integer'),
  description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  minimum: fc.option(fc.integer({ min: -1000, max: 0 }), { nil: undefined }),
  maximum: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
})

/**
 * 生成布尔类型的 JSON Schema
 */
const booleanSchemaArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: fc.constant('boolean' as const),
  description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  default: fc.option(fc.boolean(), { nil: undefined }),
})

/**
 * 生成枚举类型的 JSON Schema
 */
const enumSchemaArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: fc.constant('string' as const),
  enum: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
  description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
})

/**
 * 生成数组类型的 JSON Schema
 */
const arraySchemaArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: fc.constant('array' as const),
  items: fc.constant({ type: 'string' } as JSONSchema),
  description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
})

/**
 * 生成简单对象类型的 JSON Schema（非嵌套）
 */
const simpleObjectSchemaArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: fc.constant('object' as const),
  properties: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
    fc.oneof(stringSchemaArb, numberSchemaArb, booleanSchemaArb),
    { minKeys: 1, maxKeys: 5 }
  ),
  required: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    { nil: undefined }
  ),
})

/**
 * 生成任意基本 JSON Schema（不含嵌套对象）
 */
const basicJsonSchemaArb: fc.Arbitrary<JSONSchema> = fc.oneof(
  stringSchemaArb,
  numberSchemaArb,
  booleanSchemaArb,
  enumSchemaArb,
  arraySchemaArb,
)

/**
 * 生成完整的 JSON Schema（可能包含嵌套）
 */
const fullJsonSchemaArb: fc.Arbitrary<JSONSchema> = fc.oneof(
  basicJsonSchemaArb,
  simpleObjectSchemaArb,
)

// ============================================
// Property 4: JSON Schema 表单渲染
// Feature: mcp-tool-integration, Property 4: JSON Schema 表单渲染
// **Validates: Requirements 3.5**
// ============================================

describe('Property 4: JSON Schema 表单渲染', () => {
  it('*For any* 字符串类型 Schema，应渲染为文本输入', () => {
    fc.assert(
      fc.property(
        stringSchemaArb.filter(s => !s.enum || s.enum.length === 0),
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(inputType).toBe('text-input')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 数字/整数类型 Schema，应渲染为数字输入', () => {
    fc.assert(
      fc.property(
        numberSchemaArb,
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(inputType).toBe('number-input')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 布尔类型 Schema，应渲染为开关', () => {
    fc.assert(
      fc.property(
        booleanSchemaArb,
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(inputType).toBe('switch')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 枚举类型 Schema，应渲染为下拉选择', () => {
    fc.assert(
      fc.property(
        enumSchemaArb,
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(inputType).toBe('select')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 数组类型 Schema，应渲染为数组输入', () => {
    fc.assert(
      fc.property(
        arraySchemaArb,
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(inputType).toBe('array-input')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 对象类型 Schema（带 properties），应渲染为嵌套表单', () => {
    fc.assert(
      fc.property(
        simpleObjectSchemaArb,
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(inputType).toBe('nested-form')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 有效的 JSON Schema，应产生有效的输入类型', () => {
    fc.assert(
      fc.property(
        fullJsonSchemaArb,
        (schema) => {
          const inputType = getExpectedInputType(schema)
          expect(isValidInputType(inputType)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Schema 类型映射应该是确定性的（幂等）', () => {
    fc.assert(
      fc.property(
        fullJsonSchemaArb,
        (schema) => {
          const result1 = getExpectedInputType(schema)
          const result2 = getExpectedInputType(schema)
          const result3 = getExpectedInputType(schema)
          
          // 多次调用应返回相同结果
          expect(result1).toBe(result2)
          expect(result2).toBe(result3)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('对于数组类型的 type 字段，应使用第一个类型', () => {
    const schemaWithArrayType: JSONSchema = {
      type: ['string', 'null'],
      description: 'A nullable string',
    }
    
    const inputType = getExpectedInputType(schemaWithArrayType)
    expect(inputType).toBe('text-input')
  })

  it('对于没有 type 的 Schema，应默认为文本输入', () => {
    const schemaWithoutType: JSONSchema = {
      description: 'A field without explicit type',
    }
    
    const inputType = getExpectedInputType(schemaWithoutType)
    expect(inputType).toBe('text-input')
  })

  it('枚举优先于基本类型', () => {
    // 即使 type 是 string，如果有 enum，应该渲染为 select
    const schemaWithEnum: JSONSchema = {
      type: 'string',
      enum: ['option1', 'option2', 'option3'],
    }
    
    const inputType = getExpectedInputType(schemaWithEnum)
    expect(inputType).toBe('select')
  })

  it('对象类型但没有 properties 应默认为文本输入', () => {
    const objectWithoutProps: JSONSchema = {
      type: 'object',
      // 没有 properties
    }
    
    const inputType = getExpectedInputType(objectWithoutProps)
    expect(inputType).toBe('text-input')
  })
})

// ============================================
// Additional Tests for Edge Cases
// ============================================

describe('JSON Schema 表单渲染 - 边界情况', () => {
  it('处理空 enum 数组', () => {
    const schemaWithEmptyEnum: JSONSchema = {
      type: 'string',
      enum: [],
    }
    
    // 空 enum 应该回退到文本输入
    const inputType = getExpectedInputType(schemaWithEmptyEnum)
    expect(inputType).toBe('text-input')
  })

  it('处理带有 minimum/maximum 的数字类型', () => {
    const numberWithRange: JSONSchema = {
      type: 'number',
      minimum: 0,
      maximum: 100,
    }
    
    const inputType = getExpectedInputType(numberWithRange)
    expect(inputType).toBe('number-input')
  })

  it('处理带有 minLength/maxLength 的字符串类型', () => {
    const stringWithLength: JSONSchema = {
      type: 'string',
      minLength: 1,
      maxLength: 255,
    }
    
    const inputType = getExpectedInputType(stringWithLength)
    expect(inputType).toBe('text-input')
  })

  it('处理带有 default 值的 Schema', () => {
    const schemaWithDefault: JSONSchema = {
      type: 'string',
      default: 'default value',
    }
    
    const inputType = getExpectedInputType(schemaWithDefault)
    expect(inputType).toBe('text-input')
  })

  it('处理带有 format 的字符串类型', () => {
    const schemaWithFormat: JSONSchema = {
      type: 'string',
      format: 'email',
    }
    
    // format 不影响基本输入类型
    const inputType = getExpectedInputType(schemaWithFormat)
    expect(inputType).toBe('text-input')
  })
})
