/**
 * MCP 配置持久化属性测试
 *
 * 使用 fast-check 进行属性测试，验证 MCP 配置持久化功能的正确性
 * 
 * Feature: mcp-tool-integration, Property 6: MCP 配置持久化往返
 * **Validates: Requirements 6.1, 6.2, 6.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  serializeMCPConfig,
  deserializeMCPConfig,
  validateMCPConfig,
  exportMCPConfig,
  importMCPConfig,
  exportMCPConfigToJSON,
  importMCPConfigFromJSON,
  isValidMCPServerUrl,
  extractMCPConfigFromNodeConfig,
  mcpConfigToNodeConfig,
} from './config-persistence'
import type {
  MCPToolNodeConfig,
  MCPServerConfig,
  MCPSelectedTool,
  MCPTransportType,
  MCPAuthType,
} from './types'

// ============================================
// Mock crypto module for testing
// ============================================

// Mock the crypto module to avoid encryption issues in tests
vi.mock('@/lib/crypto', () => ({
  encryptApiKey: vi.fn((key: string) => `encrypted_${key}`),
  safeDecryptApiKey: vi.fn((encrypted: string) => encrypted.replace('encrypted_', '')),
}))

// ============================================
// Generators
// ============================================

/**
 * 生成有效的传输协议
 */
const transportArb: fc.Arbitrary<MCPTransportType> = fc.constantFrom('sse', 'http')

/**
 * 生成有效的认证类型
 */
const authTypeArb: fc.Arbitrary<MCPAuthType> = fc.constantFrom('none', 'api-key', 'bearer')

/**
 * 生成有效的 MCP 服务器 URL
 */
const validMCPUrlArb = fc.webUrl({ validSchemes: ['https'] })

/**
 * 生成有效的服务器名称
 */
const serverNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)

/**
 * 生成有效的 API Key
 */
const apiKeyArb = fc.option(
  fc.string({ minLength: 8, maxLength: 64 })
    .filter(s => s.trim().length > 0),
  { nil: undefined }
)

/**
 * 生成有效的超时时间
 */
const timeoutArb = fc.integer({ min: 1000, max: 300000 })

/**
 * 生成有效的参数映射
 */
const parameterMappingsArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  fc.oneof(
    fc.string({ maxLength: 100 }),
    fc.constant('{{input.value}}'),
    fc.constant('{{node_1.output}}'),
  )
)

/**
 * 生成有效的选中工具
 */
const selectedToolArb: fc.Arbitrary<MCPSelectedTool> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  enabled: fc.boolean(),
  parameterMappings: parameterMappingsArb,
})

/**
 * 生成有效的 MCP 服务器配置
 */
const mcpServerConfigArb: fc.Arbitrary<MCPServerConfig> = fc.record({
  id: fc.uuid(),
  name: serverNameArb,
  url: validMCPUrlArb,
  transport: transportArb,
  authType: authTypeArb,
  apiKey: apiKeyArb,
  timeout: fc.option(timeoutArb, { nil: undefined }),
  isPreset: fc.option(fc.boolean(), { nil: undefined }),
  presetType: fc.option(fc.constantFrom('modelscope', 'custom'), { nil: undefined }),
})

/**
 * 生成有效的 MCP 工具节点配置
 */
const mcpToolNodeConfigArb: fc.Arbitrary<MCPToolNodeConfig> = fc.record({
  mcpServer: mcpServerConfigArb,
  selectedTools: fc.array(selectedToolArb, { minLength: 0, maxLength: 5 }),
  retryOnError: fc.option(fc.boolean(), { nil: undefined }),
  maxRetries: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
  timeoutMs: fc.option(timeoutArb, { nil: undefined }),
})

// ============================================
// Property 6: MCP 配置持久化往返
// Feature: mcp-tool-integration, Property 6: MCP 配置持久化往返
// **Validates: Requirements 6.1, 6.2, 6.5**
// ============================================

describe('Property 6: MCP 配置持久化往返', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('序列化/反序列化往返', () => {
    it('*For any* 有效的 MCP 配置，序列化后反序列化应保持配置等价', async () => {
      await fc.assert(
        fc.asyncProperty(
          mcpToolNodeConfigArb,
          async (config) => {
            // 序列化（不加密，用于测试）
            const serialized = await serializeMCPConfig(config, false)
            
            // 反序列化
            const deserialized = await deserializeMCPConfig(serialized, false)
            
            // 验证核心字段保持一致
            expect(deserialized.mcpServer.id).toBe(config.mcpServer.id)
            expect(deserialized.mcpServer.name).toBe(config.mcpServer.name)
            expect(deserialized.mcpServer.url).toBe(config.mcpServer.url)
            expect(deserialized.mcpServer.transport).toBe(config.mcpServer.transport)
            expect(deserialized.mcpServer.authType).toBe(config.mcpServer.authType)
            expect(deserialized.mcpServer.timeout).toBe(config.mcpServer.timeout)
            expect(deserialized.mcpServer.isPreset).toBe(config.mcpServer.isPreset)
            expect(deserialized.mcpServer.presetType).toBe(config.mcpServer.presetType)
            
            // 验证选中工具保持一致
            expect(deserialized.selectedTools.length).toBe(config.selectedTools.length)
            for (let i = 0; i < config.selectedTools.length; i++) {
              expect(deserialized.selectedTools[i].name).toBe(config.selectedTools[i].name)
              expect(deserialized.selectedTools[i].enabled).toBe(config.selectedTools[i].enabled)
            }
            
            // 验证其他配置保持一致
            expect(deserialized.retryOnError).toBe(config.retryOnError)
            expect(deserialized.maxRetries).toBe(config.maxRetries)
            expect(deserialized.timeoutMs).toBe(config.timeoutMs)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 带 API Key 的配置，序列化后 API Key 应被标记为加密', async () => {
      const configWithApiKey: MCPToolNodeConfig = {
        mcpServer: {
          id: 'test-id',
          name: 'Test Server',
          url: 'https://example.com/mcp',
          transport: 'http',
          authType: 'api-key',
          apiKey: 'my-secret-key',
        },
        selectedTools: [],
      }
      
      const serialized = await serializeMCPConfig(configWithApiKey, true)
      
      // API Key 应该被加密
      expect(serialized.mcpServer.apiKeyEncrypted).toBeDefined()
      expect(serialized.mcpServer.isApiKeyEncrypted).toBe(true)
      // 原始 API Key 不应该直接存储
      expect(serialized.mcpServer.apiKeyEncrypted).not.toBe('my-secret-key')
    })
  })

  describe('导出/导入往返', () => {
    it('*For any* 有效的 MCP 配置，导出后导入应保持配置等价（除 API Key 外）', () => {
      fc.assert(
        fc.property(
          mcpToolNodeConfigArb,
          (config) => {
            // 导出
            const exported = exportMCPConfig(config)
            
            // 导入
            const imported = importMCPConfig(exported)
            
            // 验证核心字段保持一致
            expect(imported.mcpServer.name).toBe(config.mcpServer.name)
            expect(imported.mcpServer.url).toBe(config.mcpServer.url)
            expect(imported.mcpServer.transport).toBe(config.mcpServer.transport)
            expect(imported.mcpServer.authType).toBe(config.mcpServer.authType)
            expect(imported.mcpServer.timeout).toBe(config.mcpServer.timeout)
            expect(imported.mcpServer.isPreset).toBe(config.mcpServer.isPreset)
            expect(imported.mcpServer.presetType).toBe(config.mcpServer.presetType)
            
            // API Key 不应该被导出
            expect(imported.mcpServer.apiKey).toBeUndefined()
            
            // 验证选中工具保持一致
            expect(imported.selectedTools.length).toBe(config.selectedTools.length)
            for (let i = 0; i < config.selectedTools.length; i++) {
              expect(imported.selectedTools[i].name).toBe(config.selectedTools[i].name)
              expect(imported.selectedTools[i].enabled).toBe(config.selectedTools[i].enabled)
            }
            
            // 验证其他配置保持一致
            expect(imported.retryOnError).toBe(config.retryOnError)
            expect(imported.maxRetries).toBe(config.maxRetries)
            expect(imported.timeoutMs).toBe(config.timeoutMs)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 有效的 MCP 配置，JSON 导出后导入应保持配置等价', () => {
      fc.assert(
        fc.property(
          mcpToolNodeConfigArb,
          (config) => {
            // 导出为 JSON
            const json = exportMCPConfigToJSON(config)
            
            // 验证 JSON 是有效的
            expect(() => JSON.parse(json)).not.toThrow()
            
            // 导入
            const { config: imported, validation } = importMCPConfigFromJSON(json)
            
            // 验证导入成功
            expect(imported).not.toBeNull()
            expect(validation.valid).toBe(true)
            
            if (imported) {
              // 验证核心字段保持一致
              expect(imported.mcpServer.name).toBe(config.mcpServer.name)
              expect(imported.mcpServer.url).toBe(config.mcpServer.url)
              expect(imported.mcpServer.transport).toBe(config.mcpServer.transport)
              expect(imported.mcpServer.authType).toBe(config.mcpServer.authType)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('导出的配置不应包含敏感信息', () => {
      const configWithSecrets: MCPToolNodeConfig = {
        mcpServer: {
          id: 'test-id',
          name: 'Test Server',
          url: 'https://example.com/mcp',
          transport: 'http',
          authType: 'api-key',
          apiKey: 'super-secret-api-key-12345',
        },
        selectedTools: [],
      }
      
      const exported = exportMCPConfig(configWithSecrets)
      const json = JSON.stringify(exported)
      
      // JSON 中不应包含 API Key
      expect(json).not.toContain('super-secret-api-key-12345')
      expect(json).not.toContain('apiKey')
    })
  })

  describe('配置验证', () => {
    it('*For any* 有效的 MCP 配置，验证应通过', () => {
      fc.assert(
        fc.property(
          mcpToolNodeConfigArb,
          (config) => {
            const result = validateMCPConfig(config)
            
            // 有效配置应该没有错误
            expect(result.errors.length).toBe(0)
            expect(result.valid).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('缺少 URL 的配置应验证失败', () => {
      const invalidConfig = {
        mcpServer: {
          id: 'test-id',
          name: 'Test Server',
          url: '',
          transport: 'http' as MCPTransportType,
          authType: 'none' as MCPAuthType,
        },
        selectedTools: [],
      }
      
      const result = validateMCPConfig(invalidConfig)
      
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(e => e.includes('URL'))).toBe(true)
    })

    it('无效 URL 格式的配置应验证失败', () => {
      const invalidConfig = {
        mcpServer: {
          id: 'test-id',
          name: 'Test Server',
          url: 'not-a-valid-url',
          transport: 'http' as MCPTransportType,
          authType: 'none' as MCPAuthType,
        },
        selectedTools: [],
      }
      
      const result = validateMCPConfig(invalidConfig)
      
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('URL'))).toBe(true)
    })

    it('需要 API Key 但未提供时应产生警告', () => {
      const configNeedingApiKey = {
        mcpServer: {
          id: 'test-id',
          name: 'Test Server',
          url: 'https://example.com/mcp',
          transport: 'http' as MCPTransportType,
          authType: 'api-key' as MCPAuthType,
          // 没有提供 apiKey
        },
        selectedTools: [],
      }
      
      const result = validateMCPConfig(configNeedingApiKey)
      
      // 应该有警告但不是错误
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.includes('API Key'))).toBe(true)
    })
  })

  describe('节点配置转换', () => {
    it('*For any* 有效的 MCP 配置，转换为节点配置后应能提取回来', () => {
      fc.assert(
        fc.property(
          mcpToolNodeConfigArb,
          (config) => {
            // 转换为节点配置格式
            const nodeConfig = mcpConfigToNodeConfig(config)
            
            // 从节点配置提取
            const extracted = extractMCPConfigFromNodeConfig(nodeConfig)
            
            // 验证提取成功
            expect(extracted).not.toBeNull()
            
            if (extracted && extracted.mcpServer) {
              // 验证核心字段保持一致
              expect(extracted.mcpServer.name).toBe(config.mcpServer.name)
              expect(extracted.mcpServer.url).toBe(config.mcpServer.url)
              expect(extracted.mcpServer.transport).toBe(config.mcpServer.transport)
              expect(extracted.mcpServer.authType).toBe(config.mcpServer.authType)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('非 MCP 配置的节点配置应返回 null', () => {
      const nonMCPConfig = {
        someOtherField: 'value',
        anotherField: 123,
      }
      
      const extracted = extractMCPConfigFromNodeConfig(nonMCPConfig)
      
      expect(extracted).toBeNull()
    })
  })

  describe('URL 验证', () => {
    it('*For any* 有效的 HTTPS URL，isValidMCPServerUrl 应返回 true', () => {
      fc.assert(
        fc.property(
          validMCPUrlArb,
          (url) => {
            const result = isValidMCPServerUrl(url)
            expect(result).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('无效的 URL 应返回 false', () => {
      expect(isValidMCPServerUrl('')).toBe(false)
      expect(isValidMCPServerUrl('not-a-url')).toBe(false)
      expect(isValidMCPServerUrl('ftp://example.com')).toBe(false)
    })
  })

  describe('JSON 导入错误处理', () => {
    it('无效的 JSON 应返回解析错误', () => {
      const { config, validation } = importMCPConfigFromJSON('not valid json')
      
      expect(config).toBeNull()
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.includes('JSON'))).toBe(true)
    })

    it('缺少必要字段的 JSON 应返回格式错误', () => {
      const { config, validation } = importMCPConfigFromJSON('{"foo": "bar"}')
      
      expect(config).toBeNull()
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.includes('格式'))).toBe(true)
    })
  })
})
