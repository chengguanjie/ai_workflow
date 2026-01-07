/**
 * Variable Reference Validation Property Tests
 *
 * Property 7: 变量引用处理
 * **Validates: Requirements 7.1, 7.3, 7.4, 7.5**
 *
 * Tests that:
 * - Variable references in {{variable}} syntax are correctly validated
 * - Referenced variables are checked against workflow context
 * - Variable references are resolved to actual values during execution
 * - Both static values and variable references are supported
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  extractVariableRefs,
  resolveVariablePath,
  validateVariableRef,
  validateVariableRefs,
  containsVariableRef,
  isSingleVariableRef,
  validateForUI,
  getVariableSuggestions,
  formatValidationError,
  buildAvailableVariablesFromWorkflow,
  type AvailableVariable,
} from './variable-validation'

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate valid variable names (letters, numbers, underscores, starting with letter)
 */
const validVariableNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,20}$/)

/**
 * Generate valid variable paths (e.g., "input.message" or "node_1.output")
 */
const validVariablePathArb = fc.array(validVariableNameArb, { minLength: 1, maxLength: 3 })
  .map(parts => parts.join('.'))

/**
 * Generate variable reference strings {{variable}}
 */
const variableRefArb = validVariablePathArb.map(path => `{{${path}}}`)

/**
 * Generate strings containing variable references
 */
const stringWithVariableRefArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 20 }).filter(s => !s.includes('{{')),
  variableRefArb,
  fc.string({ minLength: 0, maxLength: 20 }).filter(s => !s.includes('{{')),
).map(([prefix, varRef, suffix]) => `${prefix}${varRef}${suffix}`)

/**
 * Generate simple values (string, number, boolean)
 */
const simpleValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean()
)

/**
 * Generate variable context objects
 */
const variablesContextArb = fc.dictionary(
  validVariableNameArb,
  fc.oneof(
    simpleValueArb,
    fc.dictionary(validVariableNameArb, simpleValueArb, { minKeys: 0, maxKeys: 3 })
  ),
  { minKeys: 1, maxKeys: 5 }
)

/**
 * Generate available variable objects
 */
const availableVariableArb: fc.Arbitrary<AvailableVariable> = fc.record({
  path: validVariablePathArb,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  type: fc.constantFrom('field' as const, 'output' as const, 'knowledge' as const, 'system' as const),
  nodeName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
}).map(v => ({
  ...v,
  reference: `{{${v.path}}}`,
}))

/**
 * Generate list of available variables
 */
const availableVariablesArb = fc.array(availableVariableArb, { minLength: 0, maxLength: 10 })

// ============================================================================
// Property 7: 变量引用处理
// Feature: mcp-tool-integration, Property 7: 变量引用处理
// **Validates: Requirements 7.1, 7.3, 7.4, 7.5**
// ============================================================================

describe('Property 7: 变量引用处理', () => {
  describe('7.1 变量引用语法检测 ({{variable}})', () => {
    it('*For any* string containing {{variable}}, containsVariableRef should return true', () => {
      fc.assert(
        fc.property(
          stringWithVariableRefArb,
          (str) => {
            expect(containsVariableRef(str)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* string without {{ }}, containsVariableRef should return false', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }).filter(s => !s.includes('{{')),
          (str) => {
            expect(containsVariableRef(str)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* single variable reference string, isSingleVariableRef should return true', () => {
      fc.assert(
        fc.property(
          variableRefArb,
          (ref) => {
            expect(isSingleVariableRef(ref)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* string with multiple variable references, isSingleVariableRef should return false', () => {
      fc.assert(
        fc.property(
          variableRefArb,
          variableRefArb,
          (ref1, ref2) => {
            const combined = `${ref1} ${ref2}`
            expect(isSingleVariableRef(combined)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('7.3 变量引用验证 - 检查变量存在于工作流上下文', () => {
    it('*For any* existing variable reference, validateVariableRef should return exists=true', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          simpleValueArb,
          (varName, value) => {
            const variables = { [varName]: value }
            const result = validateVariableRef(varName, variables)
            expect(result.exists).toBe(true)
            expect(result.value).toEqual(value)
            expect(result.error).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* non-existing variable reference, validateVariableRef should return exists=false with error', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          (varName) => {
            const variables = {} // Empty context
            const result = validateVariableRef(varName, variables)
            expect(result.exists).toBe(false)
            expect(result.value).toBeUndefined()
            expect(result.error).toBeDefined()
            expect(result.error).toContain(varName)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* nested variable path, validateVariableRef should correctly resolve', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          validVariableNameArb,
          simpleValueArb,
          (parent, child, value) => {
            const variables = { [parent]: { [child]: value } }
            const path = `${parent}.${child}`
            const result = validateVariableRef(path, variables)
            expect(result.exists).toBe(true)
            expect(result.value).toEqual(value)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* value with mixed existing and missing variables, validateVariableRefs should identify all missing', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          validVariableNameArb,
          simpleValueArb,
          (existingVar, missingVar, value) => {
            fc.pre(existingVar !== missingVar) // Ensure different names
            const variables = { [existingVar]: value }
            const input = `{{${existingVar}}} and {{${missingVar}}}`
            const result = validateVariableRefs(input, variables)
            
            expect(result.missingVariables).not.toContain(existingVar)
            expect(result.missingVariables).toContain(missingVar)
            expect(result.isValid).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* value with all existing variables, validateVariableRefs should return isValid=true', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          simpleValueArb,
          (varName, value) => {
            const variables = { [varName]: value }
            const input = `prefix {{${varName}}} suffix`
            const result = validateVariableRefs(input, variables)
            
            expect(result.isValid).toBe(true)
            expect(result.missingVariables).toHaveLength(0)
            expect(result.errors).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('7.4 变量引用解析 - 执行前解析变量值', () => {
    it('*For any* top-level variable, resolveVariablePath should return correct value', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          simpleValueArb,
          (varName, value) => {
            const variables = { [varName]: value }
            const result = resolveVariablePath(varName, variables)
            expect(result).toEqual(value)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* nested variable path, resolveVariablePath should traverse correctly', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          validVariableNameArb,
          validVariableNameArb,
          simpleValueArb,
          (level1, level2, level3, value) => {
            const variables = { [level1]: { [level2]: { [level3]: value } } }
            const path = `${level1}.${level2}.${level3}`
            const result = resolveVariablePath(path, variables)
            expect(result).toEqual(value)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* non-existing path, resolveVariablePath should return undefined', () => {
      fc.assert(
        fc.property(
          validVariablePathArb,
          (path) => {
            const variables = {} // Empty context
            const result = resolveVariablePath(path, variables)
            expect(result).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('7.5 静态值和变量引用支持', () => {
    it('*For any* static string (no variables), extractVariableRefs should return empty array', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }).filter(s => !s.includes('{{')),
          (str) => {
            const refs = extractVariableRefs(str)
            expect(refs).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* string with N variable references, extractVariableRefs should return N paths', () => {
      fc.assert(
        fc.property(
          fc.array(validVariablePathArb, { minLength: 1, maxLength: 5 }),
          (paths) => {
            const uniquePaths = [...new Set(paths)]
            const input = uniquePaths.map(p => `{{${p}}}`).join(' ')
            const refs = extractVariableRefs(input)
            expect(refs).toHaveLength(uniquePaths.length)
            for (const path of uniquePaths) {
              expect(refs).toContain(path)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* object with nested variable references, extractVariableRefs should find all', () => {
      fc.assert(
        fc.property(
          validVariablePathArb,
          validVariablePathArb,
          (path1, path2) => {
            fc.pre(path1 !== path2)
            const input = {
              field1: `{{${path1}}}`,
              nested: {
                field2: `{{${path2}}}`,
              },
            }
            const refs = extractVariableRefs(input)
            expect(refs).toContain(path1)
            expect(refs).toContain(path2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* array with variable references, extractVariableRefs should find all', () => {
      fc.assert(
        fc.property(
          fc.array(validVariablePathArb, { minLength: 1, maxLength: 5 }),
          (paths) => {
            const uniquePaths = [...new Set(paths)]
            const input = uniquePaths.map(p => `{{${p}}}`)
            const refs = extractVariableRefs(input)
            expect(refs).toHaveLength(uniquePaths.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('UI 验证辅助函数', () => {
    it('*For any* available variables list, validateForUI should correctly validate references', () => {
      fc.assert(
        fc.property(
          availableVariablesArb.filter(vars => vars.length > 0),
          (availableVars) => {
            // Pick a random available variable
            const randomVar = availableVars[0]
            const input = randomVar.reference
            const result = validateForUI(input, availableVars)
            
            expect(result.isValid).toBe(true)
            expect(result.missingVariables).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* variable not in available list, validateForUI should return invalid', () => {
      fc.assert(
        fc.property(
          validVariablePathArb,
          availableVariablesArb,
          (path, availableVars) => {
            // Ensure the path is not in available variables
            fc.pre(!availableVars.some(v => v.path === path))
            
            const input = `{{${path}}}`
            const result = validateForUI(input, availableVars)
            
            expect(result.isValid).toBe(false)
            expect(result.missingVariables).toContain(path)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* partial path, getVariableSuggestions should filter matching variables', () => {
      fc.assert(
        fc.property(
          availableVariablesArb.filter(vars => vars.length > 0),
          (availableVars) => {
            // Get first variable and use part of its path as search
            const firstVar = availableVars[0]
            const partialPath = firstVar.path.slice(0, Math.max(1, Math.floor(firstVar.path.length / 2)))
            
            const suggestions = getVariableSuggestions(partialPath, availableVars)
            
            // Should include the original variable
            expect(suggestions.some(s => s.path === firstVar.path)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* empty partial path, getVariableSuggestions should return all variables', () => {
      fc.assert(
        fc.property(
          availableVariablesArb,
          (availableVars) => {
            const suggestions = getVariableSuggestions('', availableVars)
            expect(suggestions).toHaveLength(availableVars.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* valid result, formatValidationError should return null', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          simpleValueArb,
          (varName, value) => {
            const variables = { [varName]: value }
            const input = `{{${varName}}}`
            const result = validateVariableRefs(input, variables)
            
            const error = formatValidationError(result)
            expect(error).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* invalid result with missing variables, formatValidationError should return error message', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          (varName) => {
            const variables = {} // Empty context
            const input = `{{${varName}}}`
            const result = validateVariableRefs(input, variables)
            
            const error = formatValidationError(result)
            expect(error).not.toBeNull()
            expect(error).toContain(varName)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('工作流上下文构建', () => {
    it('buildAvailableVariablesFromWorkflow should return empty for non-existent node', () => {
      const nodes: Array<{ id: string; data: Record<string, unknown>; parentId?: string }> = []
      const edges: Array<{ source: string; target: string; data?: Record<string, unknown> }> = []
      
      const result = buildAvailableVariablesFromWorkflow(nodes, edges, 'non-existent')
      expect(result).toHaveLength(0)
    })

    it('buildAvailableVariablesFromWorkflow should include predecessor node outputs', () => {
      const nodes = [
        { id: 'node1', data: { name: 'Input', type: 'input', config: { fields: [{ id: 'f1', name: 'message' }] } } },
        { id: 'node2', data: { name: 'Process', type: 'process', config: {} } },
      ]
      const edges = [
        { source: 'node1', target: 'node2' },
      ]
      
      const result = buildAvailableVariablesFromWorkflow(nodes, edges, 'node2')
      
      // Should include input field from node1
      expect(result.some(v => v.path === 'Input.message')).toBe(true)
    })
  })
})
