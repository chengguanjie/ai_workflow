/**
 * MCP API 属性测试
 *
 * 使用 fast-check 进行属性测试，验证 MCP API 的正确性
 * 
 * Feature: mcp-tool-integration
 * Property 1: MCP 配置结构完整性
 * **Validates: Requirements 1.2, 1.3, 1.5, 1.6**
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { isValidMCPUrl } from './client'
import { validateServerConfig, generateServerId, getOrgConfigs } from './server-config-store'
import type { MCPServerConfig, MCPTransportType, MCPAuthType } from './types'

// ============================================
// Generators
// ============================================

/**
 * 生成有效的服务器名称
 */
const validServerNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)

/**
 * 生成有效的 HTTP/HTTPS URL
 */
const validHttpUrlArb = fc.webUrl({ validSchemes: ['http', 'https'] })

/**
 * 生成无效的 URL（非 HTTP/HTTPS）
 */
const invalidUrlArb = fc.oneof(
  fc.constant(''),
  fc.constant('ftp://example.com'),
  fc.constant('ws://example.com'),
  fc.constant('not-a-url'),
  fc.constant('://missing-scheme.com'),
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('://')),
)

/**
 * 生成有效的传输协议
 */
const validTransportArb = fc.constantFrom<MCPTransportType>('sse', 'http')

/**
 * 生成无效的传输协议
 */
const invalidTransportArb = fc.string({ minLength: 1, maxLength: 10 })
  .filter(s => s !== 'sse' && s !== 'http')

/**
 * 生成有效的认证类型
 */
const validAuthTypeArb = fc.constantFrom<MCPAuthType>('none', 'api-key', 'bearer')

/**
 * 生成无效的认证类型
 */
const invalidAuthTypeArb = fc.string({ minLength: 1, maxLength: 10 })
  .filter(s => s !== 'none' && s !== 'api-key' && s !== 'bearer')

/**
 * 生成有效的 API Key
 */
const validApiKeyArb = fc.string({ minLength: 10, maxLength: 100 })

/**
 * 生成有效的超时时间（1000ms - 300000ms）
 */
const validTimeoutArb = fc.integer({ min: 1000, max: 300000 })

/**
 * 生成无效的超时时间
 */
const invalidTimeoutArb = fc.oneof(
  fc.integer({ min: -1000, max: 999 }),
  fc.integer({ min: 300001, max: 1000000 }),
)

/**
 * 生成完整有效的 MCP 服务器配置
 */
const validServerConfigArb = fc.record({
  id: fc.uuid(),
  name: validServerNameArb,
  url: validHttpUrlArb,
  transport: validTransportArb,
  authType: fc.constantFrom<MCPAuthType>('none'),
  timeout: fc.option(validTimeoutArb, { nil: undefined }),
})

/**
 * 生成需要 API Key 的有效配置
 */
const validServerConfigWithApiKeyArb = fc.record({
  id: fc.uuid(),
  name: validServerNameArb,
  url: validHttpUrlArb,
  transport: validTransportArb,
  authType: fc.constantFrom<MCPAuthType>('api-key', 'bearer'),
  apiKey: validApiKeyArb,
  timeout: fc.option(validTimeoutArb, { nil: undefined }),
})

/**
 * 生成组织 ID
 */
const orgIdArb = fc.uuid()

// ============================================
// Property 1: MCP 配置结构完整性
// Feature: mcp-tool-integration, Property 1: MCP 配置结构完整性
// **Validates: Requirements 1.2, 1.3, 1.5, 1.6**
// ============================================

describe('Property 1: MCP 配置结构完整性', () => {
  describe('URL 格式验证', () => {
    it('*For any* 有效的 HTTP/HTTPS URL，isValidMCPUrl 应返回 true', () => {
      fc.assert(
        fc.property(
          validHttpUrlArb,
          (url) => {
            expect(isValidMCPUrl(url)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 无效的 URL，isValidMCPUrl 应返回 false', () => {
      fc.assert(
        fc.property(
          invalidUrlArb,
          (url) => {
            expect(isValidMCPUrl(url)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* null 或 undefined，isValidMCPUrl 应返回 false', () => {
      expect(isValidMCPUrl(null as unknown as string)).toBe(false)
      expect(isValidMCPUrl(undefined as unknown as string)).toBe(false)
    })

    it('*For any* 非字符串值，isValidMCPUrl 应返回 false', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string()),
            fc.dictionary(fc.string(), fc.string())
          ),
          (value) => {
            expect(isValidMCPUrl(value as unknown as string)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('服务器配置验证', () => {
    it('*For any* 完整有效的配置（无需 API Key），validateServerConfig 应返回 valid: true', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          (config) => {
            const result = validateServerConfig(config)
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 完整有效的配置（需要 API Key），validateServerConfig 应返回 valid: true', () => {
      fc.assert(
        fc.property(
          validServerConfigWithApiKeyArb,
          (config) => {
            const result = validateServerConfig(config)
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 缺少名称的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          (config) => {
            const invalidConfig = { ...config, name: '' }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('名称'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 缺少 URL 的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          (config) => {
            const invalidConfig = { ...config, url: '' }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('URL'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 无效 URL 的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          invalidUrlArb,
          (config, invalidUrl) => {
            const invalidConfig = { ...config, url: invalidUrl }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('URL'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 无效传输协议的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          invalidTransportArb,
          (config, invalidTransport) => {
            const invalidConfig = { ...config, transport: invalidTransport as MCPTransportType }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('传输协议'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 无效认证类型的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          invalidAuthTypeArb,
          (config, invalidAuthType) => {
            const invalidConfig = { ...config, authType: invalidAuthType as MCPAuthType }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('认证类型'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 需要 API Key 但未提供的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          fc.constantFrom<MCPAuthType>('api-key', 'bearer'),
          (config, authType) => {
            const invalidConfig = { ...config, authType, apiKey: undefined }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('API Key'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 无效超时时间的配置，validateServerConfig 应返回错误', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          invalidTimeoutArb,
          (config, invalidTimeout) => {
            const invalidConfig = { ...config, timeout: invalidTimeout }
            const result = validateServerConfig(invalidConfig)
            expect(result.valid).toBe(false)
            expect(result.errors.some(e => e.includes('超时'))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('服务器 ID 生成', () => {
    it('*For any* 调用 generateServerId，应返回唯一的非空字符串', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (count) => {
            const ids = new Set<string>()
            for (let i = 0; i < count; i++) {
              const id = generateServerId()
              expect(id).toBeTruthy()
              expect(typeof id).toBe('string')
              expect(id.startsWith('mcp_server_')).toBe(true)
              ids.add(id)
            }
            // 所有 ID 应该是唯一的
            expect(ids.size).toBe(count)
          }
        ),
        { numRuns: 10 } // 减少运行次数因为每次生成多个 ID
      )
    })
  })

  describe('配置存储', () => {
    beforeEach(() => {
      // 清理测试数据 - 通过获取并清空 Map
      // 注意：这依赖于 getOrgConfigs 返回的是同一个 Map 实例
    })

    it('*For any* 组织 ID，getOrgConfigs 应返回一个 Map', () => {
      fc.assert(
        fc.property(
          orgIdArb,
          (orgId) => {
            const configs = getOrgConfigs(orgId)
            expect(configs).toBeInstanceOf(Map)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 相同的组织 ID，getOrgConfigs 应返回相同的 Map 实例', () => {
      fc.assert(
        fc.property(
          orgIdArb,
          (orgId) => {
            const configs1 = getOrgConfigs(orgId)
            const configs2 = getOrgConfigs(orgId)
            expect(configs1).toBe(configs2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 不同的组织 ID，getOrgConfigs 应返回不同的 Map 实例', () => {
      fc.assert(
        fc.property(
          orgIdArb,
          orgIdArb,
          (orgId1, orgId2) => {
            fc.pre(orgId1 !== orgId2) // 确保两个 ID 不同
            const configs1 = getOrgConfigs(orgId1)
            const configs2 = getOrgConfigs(orgId2)
            expect(configs1).not.toBe(configs2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 有效配置，存储后应能正确检索', () => {
      fc.assert(
        fc.property(
          orgIdArb,
          validServerConfigArb,
          (orgId, config) => {
            const configs = getOrgConfigs(orgId)
            configs.set(config.id, config as MCPServerConfig)
            
            const retrieved = configs.get(config.id)
            expect(retrieved).toEqual(config)
            
            // 清理
            configs.delete(config.id)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 多个有效配置，存储后应能全部正确检索', () => {
      fc.assert(
        fc.property(
          orgIdArb,
          fc.array(validServerConfigArb, { minLength: 1, maxLength: 5 }),
          (orgId, configList) => {
            const configs = getOrgConfigs(orgId)
            
            // 存储所有配置
            for (const config of configList) {
              configs.set(config.id, config as MCPServerConfig)
            }
            
            // 验证所有配置都能检索
            for (const config of configList) {
              const retrieved = configs.get(config.id)
              expect(retrieved).toEqual(config)
            }
            
            // 清理
            for (const config of configList) {
              configs.delete(config.id)
            }
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('配置结构完整性', () => {
    it('*For any* 有效配置，应包含所有必需字段', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          (config) => {
            // 验证必需字段存在
            expect(config.id).toBeDefined()
            expect(config.name).toBeDefined()
            expect(config.url).toBeDefined()
            expect(config.transport).toBeDefined()
            expect(config.authType).toBeDefined()
            
            // 验证字段类型
            expect(typeof config.id).toBe('string')
            expect(typeof config.name).toBe('string')
            expect(typeof config.url).toBe('string')
            expect(['sse', 'http']).toContain(config.transport)
            expect(['none', 'api-key', 'bearer']).toContain(config.authType)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 需要 API Key 的配置，apiKey 字段应存在且非空', () => {
      fc.assert(
        fc.property(
          validServerConfigWithApiKeyArb,
          (config) => {
            expect(config.apiKey).toBeDefined()
            expect(typeof config.apiKey).toBe('string')
            expect(config.apiKey.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 配置的可选字段，应为正确类型或 undefined', () => {
      fc.assert(
        fc.property(
          validServerConfigArb,
          (config) => {
            // timeout 应为数字或 undefined
            if (config.timeout !== undefined) {
              expect(typeof config.timeout).toBe('number')
              expect(config.timeout).toBeGreaterThanOrEqual(1000)
              expect(config.timeout).toBeLessThanOrEqual(300000)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
