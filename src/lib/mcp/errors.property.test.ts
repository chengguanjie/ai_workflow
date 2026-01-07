/**
 * MCP 错误处理属性测试
 *
 * 使用 fast-check 进行属性测试，验证 MCP 错误处理和重试逻辑的正确性
 * 
 * Feature: mcp-tool-integration
 * Property 8: MCP 错误处理与重试
 * **Validates: Requirements 4.5, 8.4, 8.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  MCPErrorCode,
  MCPError,
  createMCPError,
  classifyError,
  isRetryableError,
  isRetryableErrorCode,
  formatErrorForUI,
  formatErrorForLog,
  withRetry,
  withRetryResult,
  calculateRetryDelay,
  withTimeout,
  withTimeoutResult,
  TimeoutError,
  RETRYABLE_ERROR_CODES,
  ERROR_MESSAGES_ZH,
  ERROR_MESSAGES_EN,
  ERROR_SUGGESTIONS,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_TIMEOUT_CONFIG,
  type RetryConfig,
} from './errors'

// ============================================
// Generators
// ============================================

/**
 * 生成有效的 MCP 错误码
 */
const validErrorCodeArb = fc.constantFrom(...Object.values(MCPErrorCode))

/**
 * 生成可重试的错误码
 */
const retryableErrorCodeArb = fc.constantFrom(...RETRYABLE_ERROR_CODES)

/**
 * 生成不可重试的错误码
 */
const nonRetryableErrorCodeArb = fc.constantFrom(
  ...Object.values(MCPErrorCode).filter(code => !RETRYABLE_ERROR_CODES.includes(code))
)

/**
 * 生成错误消息
 */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })

/**
 * 生成网络错误消息
 */
const networkErrorMessageArb = fc.constantFrom(
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'fetch failed',
  'network error',
  'Failed to fetch',
)

/**
 * 生成认证错误消息
 */
const authErrorMessageArb = fc.constantFrom(
  '401 Unauthorized',
  '403 Forbidden',
  'invalid api key',
  'invalid token',
  'authentication failed',
  'permission denied',
)

/**
 * 生成超时错误消息（排除 ETIMEDOUT，因为它也匹配网络错误模式）
 */
const timeoutErrorMessageArb = fc.constantFrom(
  'timeout',
  'timed out',
  'deadline exceeded',
  'request timeout',
  'operation timed out',
)

/**
 * 生成有效的重试配置
 */
const validRetryConfigArb = fc.record({
  maxRetries: fc.integer({ min: 0, max: 10 }),
  initialDelayMs: fc.integer({ min: 100, max: 5000 }),
  maxDelayMs: fc.integer({ min: 1000, max: 30000 }),
  backoffMultiplier: fc.double({ min: 1.1, max: 3.0, noNaN: true }),
  jitterFactor: fc.option(fc.double({ min: 0, max: 0.5, noNaN: true }), { nil: undefined }),
})

/**
 * 生成有效的超时配置
 */
const validTimeoutConfigArb = fc.record({
  timeoutMs: fc.integer({ min: 100, max: 60000 }),
  errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
})

/**
 * 生成 HTTP 状态码
 */
const httpStatusCodeArb = fc.constantFrom(400, 401, 403, 404, 408, 429, 500, 502, 503, 504)

// ============================================
// Property 8: MCP 错误处理与重试
// Feature: mcp-tool-integration, Property 8: MCP 错误处理与重试
// **Validates: Requirements 4.5, 8.4, 8.5**
// ============================================

describe('Property 8: MCP 错误处理与重试', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('MCPError 类', () => {
    it('*For any* 有效的错误码和消息，MCPError 应正确创建', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            
            expect(error).toBeInstanceOf(Error)
            expect(error).toBeInstanceOf(MCPError)
            expect(error.code).toBe(code)
            expect(error.message).toBe(message)
            expect(error.name).toBe('MCPError')
            expect(error.timestamp).toBeInstanceOf(Date)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 可重试的错误码，MCPError.retryable 应为 true', () => {
      fc.assert(
        fc.property(
          retryableErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            expect(error.retryable).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 不可重试的错误码，MCPError.retryable 应为 false', () => {
      fc.assert(
        fc.property(
          nonRetryableErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            expect(error.retryable).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 错误码，getUserMessage 应返回用户友好的消息', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            
            const zhMessage = error.getUserMessage('zh')
            const enMessage = error.getUserMessage('en')
            
            expect(zhMessage).toBe(ERROR_MESSAGES_ZH[code])
            expect(enMessage).toBe(ERROR_MESSAGES_EN[code])
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 错误码，getSuggestions 应返回建议数组', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            const suggestions = error.getSuggestions()
            
            expect(Array.isArray(suggestions)).toBe(true)
            expect(suggestions).toEqual(ERROR_SUGGESTIONS[code])
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* MCPError，toJSON 应返回完整的错误信息', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            const json = error.toJSON()
            
            expect(json.name).toBe('MCPError')
            expect(json.code).toBe(code)
            expect(json.message).toBe(message)
            expect(json.userMessage).toBeDefined()
            expect(json.retryable).toBe(isRetryableErrorCode(code))
            expect(json.timestamp).toBeDefined()
            expect(Array.isArray(json.suggestions)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('错误分类', () => {
    it('*For any* 网络错误消息，classifyError 应返回 UNREACHABLE', () => {
      fc.assert(
        fc.property(
          networkErrorMessageArb,
          (message) => {
            const error = new Error(message)
            const code = classifyError(error)
            expect(code).toBe(MCPErrorCode.UNREACHABLE)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 认证错误消息，classifyError 应返回 AUTH_FAILED', () => {
      fc.assert(
        fc.property(
          authErrorMessageArb,
          (message) => {
            const error = new Error(message)
            const code = classifyError(error)
            expect(code).toBe(MCPErrorCode.AUTH_FAILED)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 超时错误消息，classifyError 应返回 TIMEOUT', () => {
      fc.assert(
        fc.property(
          timeoutErrorMessageArb,
          (message) => {
            const error = new Error(message)
            const code = classifyError(error)
            expect(code).toBe(MCPErrorCode.TIMEOUT)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* MCPError，classifyError 应返回原始错误码', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            const classified = classifyError(error)
            expect(classified).toBe(code)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('createMCPError', () => {
    it('*For any* 普通 Error，createMCPError 应返回 MCPError', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          (message) => {
            const error = new Error(message)
            const mcpError = createMCPError(error)
            
            expect(mcpError).toBeInstanceOf(MCPError)
            expect(mcpError.message).toBe(message)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* MCPError，createMCPError 应返回原始错误', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const original = new MCPError(code, message)
            const result = createMCPError(original)
            
            expect(result).toBe(original)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 字符串错误，createMCPError 应正确处理', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          (message) => {
            const mcpError = createMCPError(message)
            
            expect(mcpError).toBeInstanceOf(MCPError)
            expect(mcpError.message).toBe(message)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('isRetryableError', () => {
    it('*For any* 可重试错误码的 MCPError，isRetryableError 应返回 true', () => {
      fc.assert(
        fc.property(
          retryableErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            expect(isRetryableError(error)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 不可重试错误码的 MCPError，isRetryableError 应返回 false', () => {
      fc.assert(
        fc.property(
          nonRetryableErrorCodeArb,
          errorMessageArb,
          (code, message) => {
            const error = new MCPError(code, message)
            expect(isRetryableError(error)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('formatErrorForUI', () => {
    it('*For any* 错误，formatErrorForUI 应返回完整的 UI 格式', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          fc.constantFrom('zh' as const, 'en' as const),
          (code, message, locale) => {
            const error = new MCPError(code, message)
            const formatted = formatErrorForUI(error, locale)
            
            expect(formatted.title).toBeDefined()
            expect(formatted.message).toBeDefined()
            expect(formatted.code).toBe(code)
            expect(Array.isArray(formatted.suggestions)).toBe(true)
            expect(typeof formatted.retryable).toBe('boolean')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('formatErrorForLog', () => {
    it('*For any* 错误和上下文，formatErrorForLog 应返回完整的日志格式', () => {
      fc.assert(
        fc.property(
          validErrorCodeArb,
          errorMessageArb,
          fc.dictionary(fc.string(), fc.string(), { minKeys: 0, maxKeys: 3 }),
          (code, message, context) => {
            const error = new MCPError(code, message)
            const formatted = formatErrorForLog(error, context)
            
            expect(formatted.code).toBe(code)
            expect(formatted.message).toBe(message)
            expect(formatted.context).toEqual(context)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('重试延迟计算', () => {
    it('*For any* 重试配置，calculateRetryDelay 应返回合理的延迟', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          validRetryConfigArb,
          (attempt, config) => {
            const delay = calculateRetryDelay(attempt, config as RetryConfig)
            
            // 延迟应该是非负数
            expect(delay).toBeGreaterThanOrEqual(0)
            
            // 延迟不应超过最大延迟（加上抖动）
            const maxWithJitter = config.maxDelayMs * (1 + (config.jitterFactor || 0))
            expect(delay).toBeLessThanOrEqual(maxWithJitter + 1) // +1 for rounding
          }
        ),
        { numRuns: 100 }
      )
    })

    it('*For any* 重试配置，延迟应随尝试次数增加（指数退避）', () => {
      fc.assert(
        fc.property(
          validRetryConfigArb.filter(c => !c.jitterFactor), // 无抖动以便测试
          (config) => {
            const configWithoutJitter = { ...config, jitterFactor: undefined } as RetryConfig
            const delay1 = calculateRetryDelay(1, configWithoutJitter)
            const delay2 = calculateRetryDelay(2, configWithoutJitter)
            
            // 第二次延迟应该大于等于第一次（除非已达到最大值）
            if (delay1 < config.maxDelayMs) {
              expect(delay2).toBeGreaterThanOrEqual(delay1)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('withRetry', () => {
    it('*For any* 成功的函数，withRetry 应返回结果而不重试', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (result) => {
            const fn = vi.fn().mockResolvedValue(result)
            
            const actual = await withRetry(fn, { maxRetries: 3 })
            
            expect(actual).toBe(result)
            expect(fn).toHaveBeenCalledTimes(1)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('*For any* 不可重试的错误，withRetry 应立即抛出', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonRetryableErrorCodeArb,
          errorMessageArb,
          async (code, message) => {
            const error = new MCPError(code, message)
            const fn = vi.fn().mockRejectedValue(error)
            
            await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow()
            expect(fn).toHaveBeenCalledTimes(1)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('withRetryResult', () => {
    it('*For any* 成功的函数，withRetryResult 应返回 success: true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (result) => {
            const fn = vi.fn().mockResolvedValue(result)
            
            const actual = await withRetryResult(fn, { maxRetries: 3 })
            
            expect(actual.success).toBe(true)
            expect(actual.result).toBe(result)
            expect(actual.attempts).toBe(1)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('*For any* 失败的函数，withRetryResult 应返回 success: false', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonRetryableErrorCodeArb,
          errorMessageArb,
          async (code, message) => {
            const error = new MCPError(code, message)
            const fn = vi.fn().mockRejectedValue(error)
            
            const actual = await withRetryResult(fn, { maxRetries: 3 })
            
            expect(actual.success).toBe(false)
            expect(actual.error).toBeDefined()
            expect(actual.attempts).toBe(1)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('TimeoutError', () => {
    it('*For any* 超时时间，TimeoutError 应正确创建', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 60000 }),
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          (timeoutMs, message) => {
            const error = new TimeoutError(timeoutMs, message || undefined)
            
            expect(error).toBeInstanceOf(MCPError)
            expect(error).toBeInstanceOf(TimeoutError)
            expect(error.code).toBe(MCPErrorCode.TIMEOUT)
            expect(error.retryable).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('withTimeout', () => {
    it('*For any* 快速完成的 Promise，withTimeout 应返回结果', async () => {
      vi.useRealTimers() // 使用真实计时器
      
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (result) => {
            const promise = Promise.resolve(result)
            
            const actual = await withTimeout(promise, { timeoutMs: 1000 })
            
            expect(actual).toBe(result)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('withTimeoutResult', () => {
    it('*For any* 快速完成的 Promise，withTimeoutResult 应返回 success: true', async () => {
      vi.useRealTimers() // 使用真实计时器
      
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (result) => {
            const promise = Promise.resolve(result)
            
            const actual = await withTimeoutResult(promise, { timeoutMs: 1000 })
            
            expect(actual.success).toBe(true)
            expect(actual.result).toBe(result)
            expect(actual.timedOut).toBe(false)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('*For any* 失败的 Promise，withTimeoutResult 应返回 success: false', async () => {
      vi.useRealTimers() // 使用真实计时器
      
      await fc.assert(
        fc.asyncProperty(
          errorMessageArb,
          async (message) => {
            const promise = Promise.reject(new Error(message))
            
            const actual = await withTimeoutResult(promise, { timeoutMs: 1000 })
            
            expect(actual.success).toBe(false)
            expect(actual.timedOut).toBe(false)
            expect(actual.error).toBeDefined()
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})
