/**
 * MCP 客户端属性测试
 *
 * 使用 fast-check 进行属性测试，验证 MCP 客户端功能的正确性
 * 
 * Feature: mcp-tool-integration
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { isValidMCPUrl } from './client'

// ============================================
// Generators
// ============================================

/**
 * 生成有效的 HTTP/HTTPS URL
 */
const validHttpUrlArb = fc.tuple(
  fc.constantFrom('http', 'https'),
  fc.webUrl({ validSchemes: ['http', 'https'] })
).map(([scheme, url]) => {
  // webUrl already generates valid URLs, but let's ensure the scheme
  const parsed = new URL(url)
  return `${scheme}://${parsed.host}${parsed.pathname}${parsed.search}`
})

/**
 * 生成有效的 HTTPS URL（更常用于 MCP）
 */
const validHttpsUrlArb = fc.webUrl({ validSchemes: ['https'] })

/**
 * 生成有效的 HTTP URL
 */
const validHttpOnlyUrlArb = fc.webUrl({ validSchemes: ['http'] })

/**
 * 生成无效的 URL 字符串（非 HTTP/HTTPS 协议）
 */
const invalidProtocolUrlArb = fc.tuple(
  fc.constantFrom('ftp', 'file', 'mailto', 'tel', 'data', 'javascript', 'ws', 'wss'),
  fc.domain(),
  fc.webPath()
).map(([scheme, domain, path]) => `${scheme}://${domain}${path}`)

/**
 * 生成完全无效的 URL 字符串
 */
const invalidUrlStringArb = fc.oneof(
  // 随机字符串（不是 URL）
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
    try {
      new URL(s)
      return false // 如果能解析，则过滤掉
    } catch {
      return true // 不能解析的才是我们要的
    }
  }),
  // 空字符串
  fc.constant(''),
  // 只有协议
  fc.constantFrom('http://', 'https://', 'http:', 'https:'),
  // 缺少协议
  fc.domain().map(d => d),
  // 相对路径
  fc.webPath().filter(p => !p.startsWith('http')),
)

/**
 * 生成边界情况的 URL
 */
const edgeCaseUrlArb = fc.oneof(
  // 带端口的 URL
  fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.domain(),
    fc.integer({ min: 1, max: 65535 })
  ).map(([scheme, domain, port]) => `${scheme}://${domain}:${port}`),
  // 带路径的 URL
  fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.domain(),
    fc.webPath()
  ).map(([scheme, domain, path]) => `${scheme}://${domain}${path}`),
  // 带查询参数的 URL
  fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.domain(),
    fc.webQueryParameters()
  ).map(([scheme, domain, query]) => `${scheme}://${domain}?${query}`),
  // localhost URL
  fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.integer({ min: 1, max: 65535 })
  ).map(([scheme, port]) => `${scheme}://localhost:${port}`),
  // IP 地址 URL
  fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.ipV4()
  ).map(([scheme, ip]) => `${scheme}://${ip}`),
)

// ============================================
// Property 2: URL 格式验证
// Feature: mcp-tool-integration, Property 2: URL 格式验证
// **Validates: Requirements 1.4**
// ============================================

describe('Property 2: URL 格式验证', () => {
  it('*For any* 有效的 HTTPS URL，isValidMCPUrl 应返回 true', () => {
    fc.assert(
      fc.property(
        validHttpsUrlArb,
        (url) => {
          const result = isValidMCPUrl(url)
          expect(result).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 有效的 HTTP URL，isValidMCPUrl 应返回 true', () => {
    fc.assert(
      fc.property(
        validHttpOnlyUrlArb,
        (url) => {
          const result = isValidMCPUrl(url)
          expect(result).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 非 HTTP/HTTPS 协议的 URL，isValidMCPUrl 应返回 false', () => {
    fc.assert(
      fc.property(
        invalidProtocolUrlArb,
        (url) => {
          const result = isValidMCPUrl(url)
          expect(result).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 无效的 URL 字符串，isValidMCPUrl 应返回 false', () => {
    fc.assert(
      fc.property(
        invalidUrlStringArb,
        (url) => {
          const result = isValidMCPUrl(url)
          expect(result).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 边界情况的有效 URL，isValidMCPUrl 应返回 true', () => {
    fc.assert(
      fc.property(
        edgeCaseUrlArb,
        (url) => {
          const result = isValidMCPUrl(url)
          expect(result).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('对于 null 和 undefined，isValidMCPUrl 应返回 false', () => {
    // @ts-expect-error - 测试非字符串输入
    expect(isValidMCPUrl(null)).toBe(false)
    // @ts-expect-error - 测试非字符串输入
    expect(isValidMCPUrl(undefined)).toBe(false)
  })

  it('对于非字符串类型，isValidMCPUrl 应返回 false', () => {
    // @ts-expect-error - 测试非字符串输入
    expect(isValidMCPUrl(123)).toBe(false)
    // @ts-expect-error - 测试非字符串输入
    expect(isValidMCPUrl({})).toBe(false)
    // @ts-expect-error - 测试非字符串输入
    expect(isValidMCPUrl([])).toBe(false)
    // @ts-expect-error - 测试非字符串输入
    expect(isValidMCPUrl(true)).toBe(false)
  })

  it('对于常见的 MCP 服务器 URL 格式，isValidMCPUrl 应返回 true', () => {
    // 魔搭 MCP 服务器
    expect(isValidMCPUrl('https://mcp.modelscope.cn/servers/fetch')).toBe(true)
    expect(isValidMCPUrl('https://mcp.modelscope.cn/servers/search')).toBe(true)
    
    // 本地开发服务器
    expect(isValidMCPUrl('http://localhost:3000')).toBe(true)
    expect(isValidMCPUrl('http://127.0.0.1:8080')).toBe(true)
    
    // 带路径的服务器
    expect(isValidMCPUrl('https://api.example.com/mcp/v1')).toBe(true)
    
    // 带查询参数的服务器
    expect(isValidMCPUrl('https://api.example.com/mcp?token=abc')).toBe(true)
  })

  it('URL 验证应该是幂等的', () => {
    fc.assert(
      fc.property(
        fc.oneof(validHttpsUrlArb, invalidUrlStringArb),
        (url) => {
          const result1 = isValidMCPUrl(url)
          const result2 = isValidMCPUrl(url)
          const result3 = isValidMCPUrl(url)
          
          // 多次调用应返回相同结果
          expect(result1).toBe(result2)
          expect(result2).toBe(result3)
        }
      ),
      { numRuns: 100 }
    )
  })
})
