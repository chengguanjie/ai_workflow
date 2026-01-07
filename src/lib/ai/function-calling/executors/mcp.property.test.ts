/**
 * MCP 工具执行器属性测试
 *
 * 使用 fast-check 进行属性测试，验证 MCP 工具执行器的正确性
 * 
 * Feature: mcp-tool-integration
 * Property 5: MCP 工具执行流程
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  MCPToolExecutor,
  resolveVariables,
  resolveVariablePath,
  resolveVariableString,
  validateVariableRefs,
  containsVariableRef,
} from './mcp'
import type { ToolExecutionContext } from '../types'

// ============================================
// Generators
// ============================================

/**
 * 生成有效的变量名（字母开头，可包含字母、数字、下划线）
 */
const validVariableNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,20}$/)

/**
 * 生成有效的变量路径（如 "input.message" 或 "node_1.output"）
 */
const validVariablePathArb = fc.array(validVariableNameArb, { minLength: 1, maxLength: 3 })
  .map(parts => parts.join('.'))

/**
 * 生成变量引用字符串 {{variable}}
 */
const variableRefArb = validVariablePathArb.map(path => `{{${path}}}`)

/**
 * 生成包含变量引用的字符串
 */
const stringWithVariableRefArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 20 }),
  variableRefArb,
  fc.string({ minLength: 0, maxLength: 20 })
).map(([prefix, varRef, suffix]) => `${prefix}${varRef}${suffix}`)

/**
 * 生成简单的变量值（字符串、数字、布尔值）
 */
const simpleValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean()
)

/**
 * 生成变量上下文对象
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
 * 生成有效的 MCP 服务器配置
 */
const validServerConfigArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  url: fc.webUrl({ validSchemes: ['https'] }),
  transport: fc.constantFrom('sse' as const, 'http' as const),
  authType: fc.constantFrom('none' as const, 'api-key' as const, 'bearer' as const),
  apiKey: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
  timeout: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
})

/**
 * 生成有效的工具名称
 */
const validToolNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/)

/**
 * 生成工具参数对象（不包含变量引用，用于简单测试）
 */
const simpleToolArgsArb = fc.dictionary(
  validVariableNameArb,
  simpleValueArb,
  { minKeys: 0, maxKeys: 5 }
)

/**
 * 生成测试执行上下文
 */
const testContextArb = fc.record({
  organizationId: fc.uuid(),
  userId: fc.uuid(),
  workflowId: fc.option(fc.uuid(), { nil: undefined }),
  executionId: fc.option(fc.uuid(), { nil: undefined }),
  testMode: fc.constant(true), // 始终使用测试模式
  variables: variablesContextArb,
})

/**
 * 生成一致的工具参数和变量上下文（确保变量引用存在于上下文中）
 */
const consistentArgsAndContextArb = fc.record({
  varName: validVariableNameArb,
  varValue: simpleValueArb,
  paramName: validVariableNameArb,
}).chain(({ varName, varValue, paramName }) => {
  return fc.record({
    toolArgs: fc.constant({ [paramName]: `{{${varName}}}` }),
    variables: fc.constant({ [varName]: varValue }),
  })
})

// ============================================
// Property 5: MCP 工具执行流程
// Feature: mcp-tool-integration, Property 5: MCP 工具执行流程
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
// ============================================

describe('Property 5: MCP 工具执行流程', () => {
  describe('变量引用检测', () => {
    it('*For any* 包含 {{variable}} 的字符串，containsVariableRef 应返回 true', () => {
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

    it('*For any* 不包含 {{}} 的普通字符串，containsVariableRef 应返回 false', () => {
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

    it('*For any* 非字符串值，containsVariableRef 应返回 false', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.string()),
            fc.dictionary(fc.string(), fc.string())
          ),
          (value) => {
            expect(containsVariableRef(value)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('变量路径解析', () => {
    it('*For any* 存在的顶级变量，resolveVariablePath 应返回正确的值', () => {
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

    it('*For any* 存在的嵌套变量，resolveVariablePath 应返回正确的值', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          validVariableNameArb,
          simpleValueArb,
          (parent, child, value) => {
            const variables = { [parent]: { [child]: value } }
            const path = `${parent}.${child}`
            const result = resolveVariablePath(path, variables)
            expect(result).toEqual(value)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 不存在的变量路径，resolveVariablePath 应返回 undefined', () => {
      fc.assert(
        fc.property(
          validVariablePathArb,
          (path) => {
            const variables = {} // 空上下文
            const result = resolveVariablePath(path, variables)
            expect(result).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('变量字符串解析', () => {
    it('*For any* 包含单个变量引用的字符串，resolveVariableString 应正确替换', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          (varName, value) => {
            const variables = { [varName]: value }
            const input = `Hello {{${varName}}}!`
            const result = resolveVariableString(input, variables)
            expect(result).toBe(`Hello ${value}!`)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 不存在的变量引用，resolveVariableString 应保留原始引用', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          (varName) => {
            const variables = {} // 空上下文
            const input = `{{${varName}}}`
            const result = resolveVariableString(input, variables)
            expect(result).toBe(input) // 保留原始
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 非字符串变量值，resolveVariableString 应将其 JSON 序列化', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.array(fc.integer(), { minLength: 1, maxLength: 3 })
          ),
          (varName, value) => {
            const variables = { [varName]: value }
            const input = `Value: {{${varName}}}`
            const result = resolveVariableString(input, variables)
            expect(result).toBe(`Value: ${JSON.stringify(value)}`)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('递归变量解析', () => {
    it('*For any* 对象中的变量引用，resolveVariables 应递归解析所有引用', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          (varName, value) => {
            const variables = { [varName]: value }
            const input = {
              field1: `{{${varName}}}`,
              field2: {
                nested: `prefix_{{${varName}}}_suffix`,
              },
            }
            const result = resolveVariables(input, variables) as Record<string, unknown>
            expect(result.field1).toBe(value)
            expect((result.field2 as Record<string, unknown>).nested).toBe(`prefix_${value}_suffix`)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 数组中的变量引用，resolveVariables 应解析数组元素', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          (varName, value) => {
            const variables = { [varName]: value }
            const input = [`{{${varName}}}`, 'static', `{{${varName}}}`]
            const result = resolveVariables(input, variables) as string[]
            expect(result[0]).toBe(value)
            expect(result[1]).toBe('static')
            expect(result[2]).toBe(value)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 单独的变量引用字符串，resolveVariables 应保留原始类型', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string(), { minLength: 1, maxLength: 3 })
          ),
          (varName, value) => {
            const variables = { [varName]: value }
            const input = `{{${varName}}}`
            const result = resolveVariables(input, variables)
            expect(result).toEqual(value)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 原始值（非字符串），resolveVariables 应原样返回', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (value) => {
            const result = resolveVariables(value, {})
            expect(result).toEqual(value)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('变量引用验证', () => {
    it('*For any* 存在的变量引用，validateVariableRefs 应返回空数组', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          simpleValueArb,
          (varName, value) => {
            const variables = { [varName]: value }
            const input = `{{${varName}}}`
            const missing = validateVariableRefs(input, variables)
            expect(missing).toEqual([])
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 不存在的变量引用，validateVariableRefs 应返回缺失的变量路径', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          (varName) => {
            const variables = {} // 空上下文
            const input = `{{${varName}}}`
            const missing = validateVariableRefs(input, variables)
            expect(missing).toContain(varName)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 混合存在和不存在的变量引用，validateVariableRefs 应只返回缺失的', () => {
      fc.assert(
        fc.property(
          validVariableNameArb,
          validVariableNameArb.filter(n => n !== 'existing'),
          simpleValueArb,
          (existingVar, missingVar, value) => {
            fc.pre(existingVar !== missingVar) // 确保两个变量名不同
            const variables = { [existingVar]: value }
            const input = `{{${existingVar}}} and {{${missingVar}}}`
            const missing = validateVariableRefs(input, variables)
            expect(missing).not.toContain(existingVar)
            expect(missing).toContain(missingVar)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('MCP 执行器测试模式', () => {
    it('*For any* 有效的 MCP 配置和工具参数（无变量引用），测试模式应返回成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          validServerConfigArb,
          validToolNameArb,
          simpleToolArgsArb,
          testContextArb,
          async (serverConfig, toolName, toolArgs, context) => {
            const executor = new MCPToolExecutor()
            const result = await executor.execute(
              {
                serverConfig,
                toolName,
                toolArgs,
              },
              context as ToolExecutionContext
            )
            
            expect(result.success).toBe(true)
            expect(result.result).toBeDefined()
            expect((result.result as Record<string, unknown>).testMode).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 有效的 MCP 配置和包含有效变量引用的工具参数，测试模式应返回成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          validServerConfigArb,
          validToolNameArb,
          consistentArgsAndContextArb,
          fc.uuid(),
          fc.uuid(),
          async (serverConfig, toolName, { toolArgs, variables }, orgId, userId) => {
            const executor = new MCPToolExecutor()
            const result = await executor.execute(
              {
                serverConfig,
                toolName,
                toolArgs,
              },
              {
                organizationId: orgId,
                userId: userId,
                testMode: true,
                variables,
              } as ToolExecutionContext
            )
            
            expect(result.success).toBe(true)
            expect(result.result).toBeDefined()
            expect((result.result as Record<string, unknown>).testMode).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 缺少 serverConfig 的请求，应返回错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          validToolNameArb,
          testContextArb,
          async (toolName, context) => {
            const executor = new MCPToolExecutor()
            const result = await executor.execute(
              {
                toolName,
                toolArgs: {},
              },
              context as ToolExecutionContext
            )
            
            expect(result.success).toBe(false)
            expect(result.error).toContain('serverConfig')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 缺少 toolName 的请求，应返回错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          validServerConfigArb,
          testContextArb,
          async (serverConfig, context) => {
            const executor = new MCPToolExecutor()
            const result = await executor.execute(
              {
                serverConfig,
                toolArgs: {},
              },
              context as ToolExecutionContext
            )
            
            expect(result.success).toBe(false)
            expect(result.error).toContain('toolName')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 无效的服务器 URL，应返回错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          validServerConfigArb,
          validToolNameArb,
          testContextArb,
          async (serverConfig, toolName, context) => {
            const invalidConfig = { ...serverConfig, url: 'not-a-valid-url' }
            const executor = new MCPToolExecutor()
            const result = await executor.execute(
              {
                serverConfig: invalidConfig,
                toolName,
                toolArgs: {},
              },
              context as ToolExecutionContext
            )
            
            expect(result.success).toBe(false)
            expect(result.error).toContain('URL')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 包含不存在变量引用的工具参数，应返回错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          validServerConfigArb,
          validToolNameArb,
          validVariableNameArb,
          fc.record({
            organizationId: fc.uuid(),
            userId: fc.uuid(),
            testMode: fc.constant(true),
            variables: fc.constant({}), // 空变量上下文
          }),
          async (serverConfig, toolName, missingVar, context) => {
            const executor = new MCPToolExecutor()
            const result = await executor.execute(
              {
                serverConfig,
                toolName,
                toolArgs: { param: `{{${missingVar}}}` },
              },
              context as ToolExecutionContext
            )
            
            expect(result.success).toBe(false)
            expect(result.error).toContain('变量引用未找到')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('执行器定义', () => {
    it('MCPToolExecutor 应返回有效的工具定义', () => {
      const executor = new MCPToolExecutor()
      const definition = executor.getDefinition()
      
      expect(definition.name).toBe('mcp_tool')
      expect(definition.description).toBeDefined()
      expect(definition.parameters).toBeDefined()
      expect(Array.isArray(definition.parameters)).toBe(true)
      expect(definition.parameters.length).toBeGreaterThan(0)
      
      // 验证必需参数存在
      const paramNames = definition.parameters.map(p => p.name)
      expect(paramNames).toContain('serverConfig')
      expect(paramNames).toContain('toolName')
      expect(paramNames).toContain('toolArgs')
    })

    it('MCPToolExecutor 的属性应正确设置', () => {
      const executor = new MCPToolExecutor()
      
      expect(executor.name).toBe('mcp_tool')
      expect(executor.category).toBe('mcp')
      expect(executor.description).toBeDefined()
    })
  })
})
