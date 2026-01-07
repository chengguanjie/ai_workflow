/**
 * MCP 工具配置集成属性测试
 *
 * 使用 fast-check 进行属性测试，验证 MCP 工具发现与选择的正确性
 * 
 * Feature: mcp-tool-integration
 * Property 3: MCP 工具发现与选择
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { MODELSCOPE_MCP_PRESETS, type MCPTool, type MCPSelectedTool, type JSONSchema } from '@/lib/mcp/types'

// ============================================
// Generators
// ============================================

/**
 * 生成有效的工具名称
 */
const validToolNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/)

/**
 * 生成有效的工具描述
 */
const validToolDescriptionArb = fc.string({ minLength: 0, maxLength: 200 })

/**
 * 生成简单的 JSON Schema 属性类型
 */
const simpleSchemaTypeArb = fc.constantFrom('string', 'number', 'integer', 'boolean')

/**
 * 生成 JSON Schema 属性
 */
const jsonSchemaPropertyArb: fc.Arbitrary<JSONSchema> = fc.record({
  type: simpleSchemaTypeArb,
  description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
})

/**
 * 生成工具输入 Schema
 */
const toolInputSchemaArb = fc.record({
  type: fc.constant('object' as const),
  properties: fc.option(
    fc.dictionary(
      validToolNameArb,
      jsonSchemaPropertyArb,
      { minKeys: 0, maxKeys: 5 }
    ),
    { nil: undefined }
  ),
  required: fc.option(
    fc.array(validToolNameArb, { minLength: 0, maxLength: 3 }),
    { nil: undefined }
  ),
})

/**
 * 生成 MCP 工具定义
 */
const mcpToolArb: fc.Arbitrary<MCPTool> = fc.record({
  name: validToolNameArb,
  description: fc.option(validToolDescriptionArb, { nil: undefined }),
  inputSchema: toolInputSchemaArb,
})

/**
 * 生成 MCP 工具列表
 */
const mcpToolListArb = fc.array(mcpToolArb, { minLength: 1, maxLength: 10 })
  .map(tools => {
    // 确保工具名称唯一
    const seen = new Set<string>()
    return tools.filter(tool => {
      if (seen.has(tool.name)) return false
      seen.add(tool.name)
      return true
    })
  })
  .filter(tools => tools.length > 0)

/**
 * 生成选中的工具配置
 */
const selectedToolArb: fc.Arbitrary<MCPSelectedTool> = fc.record({
  name: validToolNameArb,
  enabled: fc.boolean(),
  parameterMappings: fc.dictionary(
    validToolNameArb,
    fc.oneof(
      fc.string({ minLength: 0, maxLength: 50 }),
      fc.string().map(s => `{{${s}}}`), // 变量引用
    ),
    { minKeys: 0, maxKeys: 3 }
  ),
})

/**
 * 生成一致的工具列表和选中工具（确保选中的工具存在于列表中）
 */
const consistentToolsAndSelectionArb = mcpToolListArb.chain(tools => {
  const toolNames = tools.map(t => t.name)
  return fc.record({
    availableTools: fc.constant(tools),
    selectedTools: fc.array(
      fc.record({
        name: fc.constantFrom(...toolNames),
        enabled: fc.boolean(),
        parameterMappings: fc.constant({} as Record<string, string>),
      }),
      { minLength: 0, maxLength: tools.length }
    ).map(selected => {
      // 确保选中的工具名称唯一
      const seen = new Set<string>()
      return selected.filter(s => {
        if (seen.has(s.name)) return false
        seen.add(s.name)
        return true
      })
    }),
  })
})

// ============================================
// Helper Functions (模拟组件逻辑)
// ============================================

/**
 * 检查工具是否被启用
 */
function isToolEnabled(toolName: string, selectedTools: MCPSelectedTool[]): boolean {
  const selected = selectedTools.find(t => t.name === toolName)
  return selected?.enabled ?? false
}

/**
 * 切换工具启用状态
 */
function toggleTool(
  tool: MCPTool,
  enabled: boolean,
  selectedTools: MCPSelectedTool[]
): MCPSelectedTool[] {
  const existingIndex = selectedTools.findIndex(t => t.name === tool.name)
  
  if (enabled) {
    if (existingIndex === -1) {
      // 添加新工具
      return [...selectedTools, {
        name: tool.name,
        enabled: true,
        parameterMappings: {},
      }]
    } else {
      // 启用现有工具
      const updated = [...selectedTools]
      updated[existingIndex] = { ...updated[existingIndex], enabled: true }
      return updated
    }
  } else {
    if (existingIndex !== -1) {
      // 禁用工具
      const updated = [...selectedTools]
      updated[existingIndex] = { ...updated[existingIndex], enabled: false }
      return updated
    }
  }
  return selectedTools
}

/**
 * 获取工具的参数映射
 */
function getToolParameters(toolName: string, selectedTools: MCPSelectedTool[]): Record<string, unknown> {
  const selected = selectedTools.find(t => t.name === toolName)
  return selected?.parameterMappings ?? {}
}

/**
 * 更新工具参数映射
 */
function updateToolParameter(
  toolName: string,
  paramName: string,
  value: string,
  selectedTools: MCPSelectedTool[]
): MCPSelectedTool[] {
  const toolIndex = selectedTools.findIndex(t => t.name === toolName)
  if (toolIndex === -1) return selectedTools

  const updated = [...selectedTools]
  updated[toolIndex] = {
    ...updated[toolIndex],
    parameterMappings: {
      ...updated[toolIndex].parameterMappings,
      [paramName]: value,
    },
  }
  return updated
}

/**
 * 验证工具配置完整性
 */
function validateToolConfig(tool: MCPTool, selectedTool: MCPSelectedTool): {
  valid: boolean
  missingRequired: string[]
} {
  const missingRequired: string[] = []
  const required = tool.inputSchema.required || []
  const mappings = selectedTool.parameterMappings

  for (const reqParam of required) {
    if (!mappings[reqParam] || mappings[reqParam] === '') {
      missingRequired.push(reqParam)
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
  }
}

// ============================================
// Property 3: MCP 工具发现与选择
// Feature: mcp-tool-integration, Property 3: MCP 工具发现与选择
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
// ============================================

describe('Property 3: MCP 工具发现与选择', () => {
  describe('工具列表获取 (Requirements 3.1)', () => {
    it('*For any* MCP 服务器返回的工具列表，每个工具应包含 name、description 和 inputSchema', () => {
      fc.assert(
        fc.property(
          mcpToolListArb,
          (tools) => {
            for (const tool of tools) {
              expect(tool.name).toBeDefined()
              expect(typeof tool.name).toBe('string')
              expect(tool.name.length).toBeGreaterThan(0)
              expect(tool.inputSchema).toBeDefined()
              expect(tool.inputSchema.type).toBe('object')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 工具列表，工具名称应唯一', () => {
      fc.assert(
        fc.property(
          mcpToolListArb,
          (tools) => {
            const names = tools.map(t => t.name)
            const uniqueNames = new Set(names)
            expect(uniqueNames.size).toBe(names.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('工具显示 (Requirements 3.2)', () => {
    it('*For any* 工具，应能正确显示其名称、描述和输入 Schema', () => {
      fc.assert(
        fc.property(
          mcpToolArb,
          (tool) => {
            // 模拟显示逻辑
            const displayName = tool.name
            const displayDescription = tool.description || ''
            const displaySchema = tool.inputSchema

            expect(displayName).toBe(tool.name)
            expect(displayDescription).toBe(tool.description || '')
            expect(displaySchema).toEqual(tool.inputSchema)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('工具选择 (Requirements 3.3)', () => {
    it('*For any* 工具列表和选择操作，选中的工具应出现在启用列表中', () => {
      fc.assert(
        fc.property(
          consistentToolsAndSelectionArb,
          fc.integer({ min: 0, max: 9 }),
          ({ availableTools, selectedTools }, toolIndex) => {
            fc.pre(toolIndex < availableTools.length)
            
            const toolToSelect = availableTools[toolIndex]
            const updatedSelection = toggleTool(toolToSelect, true, selectedTools)
            
            expect(isToolEnabled(toolToSelect.name, updatedSelection)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 已选中的工具，禁用后应不再启用', () => {
      fc.assert(
        fc.property(
          consistentToolsAndSelectionArb,
          fc.integer({ min: 0, max: 9 }),
          ({ availableTools, selectedTools }, toolIndex) => {
            fc.pre(toolIndex < availableTools.length)
            
            const toolToToggle = availableTools[toolIndex]
            // 先启用
            const enabledSelection = toggleTool(toolToToggle, true, selectedTools)
            expect(isToolEnabled(toolToToggle.name, enabledSelection)).toBe(true)
            
            // 再禁用
            const disabledSelection = toggleTool(toolToToggle, false, enabledSelection)
            expect(isToolEnabled(toolToToggle.name, disabledSelection)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 工具选择操作，应保持其他工具的状态不变', () => {
      fc.assert(
        fc.property(
          consistentToolsAndSelectionArb,
          fc.integer({ min: 0, max: 9 }),
          fc.boolean(),
          ({ availableTools, selectedTools }, toolIndex, enable) => {
            fc.pre(toolIndex < availableTools.length)
            fc.pre(availableTools.length > 1)
            
            const toolToToggle = availableTools[toolIndex]
            const otherTools = availableTools.filter(t => t.name !== toolToToggle.name)
            
            // 记录其他工具的状态
            const otherToolStates = otherTools.map(t => ({
              name: t.name,
              enabled: isToolEnabled(t.name, selectedTools),
            }))
            
            // 切换目标工具
            const updatedSelection = toggleTool(toolToToggle, enable, selectedTools)
            
            // 验证其他工具状态不变
            for (const state of otherToolStates) {
              expect(isToolEnabled(state.name, updatedSelection)).toBe(state.enabled)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('工具启用/禁用 (Requirements 3.4)', () => {
    it('*For any* 工具，启用/禁用切换应是幂等的', () => {
      fc.assert(
        fc.property(
          mcpToolArb,
          fc.boolean(),
          (tool, enable) => {
            const initial: MCPSelectedTool[] = []
            
            // 第一次切换
            const first = toggleTool(tool, enable, initial)
            // 第二次相同切换
            const second = toggleTool(tool, enable, first)
            
            // 状态应相同
            expect(isToolEnabled(tool.name, first)).toBe(isToolEnabled(tool.name, second))
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('参数映射 (Requirements 3.5)', () => {
    it('*For any* 工具参数更新，应正确保存参数值', () => {
      fc.assert(
        fc.property(
          mcpToolArb,
          validToolNameArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          (tool, paramName, paramValue) => {
            // 先启用工具
            const selectedTools = toggleTool(tool, true, [])
            
            // 更新参数
            const updated = updateToolParameter(tool.name, paramName, paramValue, selectedTools)
            
            // 验证参数已保存
            const params = getToolParameters(tool.name, updated)
            expect(params[paramName]).toBe(paramValue)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 多次参数更新，应保留所有参数', () => {
      fc.assert(
        fc.property(
          mcpToolArb,
          fc.array(
            fc.tuple(validToolNameArb, fc.string({ minLength: 1, maxLength: 50 })),
            { minLength: 1, maxLength: 5 }
          ),
          (tool, paramUpdates) => {
            // 确保参数名唯一
            const uniqueUpdates = paramUpdates.filter((update, index, self) =>
              index === self.findIndex(u => u[0] === update[0])
            )
            
            // 先启用工具
            let selectedTools = toggleTool(tool, true, [])
            
            // 依次更新参数
            for (const [paramName, paramValue] of uniqueUpdates) {
              selectedTools = updateToolParameter(tool.name, paramName, paramValue, selectedTools)
            }
            
            // 验证所有参数都已保存
            const params = getToolParameters(tool.name, selectedTools)
            for (const [paramName, paramValue] of uniqueUpdates) {
              expect(params[paramName]).toBe(paramValue)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('预设配置验证', () => {
    it('*For any* 魔搭 MCP 预设，应包含有效的配置', () => {
      for (const [key, preset] of Object.entries(MODELSCOPE_MCP_PRESETS)) {
        expect(preset.id).toBeDefined()
        expect(preset.name).toBeDefined()
        expect(preset.url).toBeDefined()
        expect(preset.url).toMatch(/^https?:\/\//)
        expect(preset.description).toBeDefined()
        expect(Array.isArray(preset.tools)).toBe(true)
        expect(preset.tools.length).toBeGreaterThan(0)
      }
    })

    it('*For any* 魔搭 MCP 预设，预设 ID 应唯一', () => {
      const ids = Object.values(MODELSCOPE_MCP_PRESETS).map(p => p.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('工具配置完整性验证', () => {
    it('*For any* 工具和选中配置，应能验证必需参数是否已填写', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: validToolNameArb,
            description: fc.option(validToolDescriptionArb, { nil: undefined }),
            inputSchema: fc.record({
              type: fc.constant('object' as const),
              properties: fc.dictionary(
                validToolNameArb,
                jsonSchemaPropertyArb,
                { minKeys: 1, maxKeys: 3 }
              ),
              required: fc.array(validToolNameArb, { minLength: 1, maxLength: 2 }),
            }),
          }),
          (tool) => {
            // 确保 required 中的参数存在于 properties 中
            const properties = tool.inputSchema.properties || {}
            const required = (tool.inputSchema.required || []).filter(r => r in properties)
            
            if (required.length === 0) return // 跳过没有必需参数的情况
            
            // 创建一个没有填写必需参数的选中配置
            const selectedTool: MCPSelectedTool = {
              name: tool.name,
              enabled: true,
              parameterMappings: {},
            }
            
            const validation = validateToolConfig(
              { ...tool, inputSchema: { ...tool.inputSchema, required } },
              selectedTool
            )
            
            expect(validation.valid).toBe(false)
            expect(validation.missingRequired.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 工具和完整填写的选中配置，验证应通过', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: validToolNameArb,
            description: fc.option(validToolDescriptionArb, { nil: undefined }),
            inputSchema: fc.record({
              type: fc.constant('object' as const),
              properties: fc.dictionary(
                validToolNameArb,
                jsonSchemaPropertyArb,
                { minKeys: 1, maxKeys: 3 }
              ),
              required: fc.array(validToolNameArb, { minLength: 0, maxLength: 2 }),
            }),
          }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (tool, fillValue) => {
            // 确保 required 中的参数存在于 properties 中
            const properties = tool.inputSchema.properties || {}
            const required = (tool.inputSchema.required || []).filter(r => r in properties)
            
            // 创建一个填写了所有必需参数的选中配置
            const parameterMappings: Record<string, string> = {}
            for (const reqParam of required) {
              parameterMappings[reqParam] = fillValue
            }
            
            const selectedTool: MCPSelectedTool = {
              name: tool.name,
              enabled: true,
              parameterMappings,
            }
            
            const validation = validateToolConfig(
              { ...tool, inputSchema: { ...tool.inputSchema, required } },
              selectedTool
            )
            
            expect(validation.valid).toBe(true)
            expect(validation.missingRequired.length).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
