/**
 * 调试事件属性测试
 *
 * 使用 fast-check 进行属性测试，验证调试日志功能的正确性
 * 
 * Feature: realtime-debug-logs
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  LOG_LEVEL_STYLES,
  formatLogMessage,
  formatJsonData,
  createLogEvent,
  createStatusEvent,
  createCompleteEvent,
  createErrorEvent,
  isDebugLogData,
  isDebugStatusData,
  isDebugCompleteData,
  isDebugErrorData,
  type LogLevel,
  type DebugLogData,
  type DebugLogEvent,
} from './debug-events'

// ============================================
// Generators
// ============================================

/**
 * 生成有效的日志级别
 */
const logLevelArb = fc.constantFrom<LogLevel>('info', 'step', 'success', 'warning', 'error')

/**
 * 生成安全的字符串键（排除 __proto__ 等特殊属性名）
 */
const safeStringKeyArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
  s => s !== '__proto__' && s !== 'constructor' && s !== 'prototype'
)

/**
 * 生成有效的调试日志数据
 */
const debugLogDataArb = fc.record({
  level: logLevelArb,
  message: fc.string({ minLength: 1, maxLength: 200 }),
  step: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  data: fc.option(fc.jsonValue(), { nil: undefined }),
  timestamp: fc.option(
    fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
      .map(ts => new Date(ts).toISOString()),
    { nil: undefined }
  ),
})

/**
 * 生成有效的状态
 */
const debugStatusArb = fc.constantFrom<'running' | 'completed' | 'failed'>('running', 'completed', 'failed')

/**
 * 生成有效的完成状态
 */
const completeStatusArb = fc.constantFrom<'success' | 'error' | 'skipped' | 'paused'>('success', 'error', 'skipped', 'paused')

// ============================================
// Property 3: 日志格式完整性
// Feature: realtime-debug-logs, Property 3: 日志格式完整性
// **Validates: Requirements 4.1, 4.2**
// ============================================

describe('Property 3: 日志格式完整性', () => {
  it('*For any* 日志级别，LOG_LEVEL_STYLES 应包含该级别的样式配置', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (level) => {
          const style = LOG_LEVEL_STYLES[level]
          
          // 样式配置应存在
          expect(style).toBeDefined()
          
          // 应包含图标
          expect(style.icon).toBeDefined()
          expect(typeof style.icon).toBe('string')
          expect(style.icon.length).toBeGreaterThan(0)
          
          // 应包含文字颜色类
          expect(style.color).toBeDefined()
          expect(typeof style.color).toBe('string')
          expect(style.color).toMatch(/^text-/)
          
          // 应包含背景颜色类
          expect(style.bgColor).toBeDefined()
          expect(typeof style.bgColor).toBe('string')
          expect(style.bgColor).toMatch(/^bg-/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 有效的日志数据，formatLogMessage 应返回包含时间戳和消息的字符串', () => {
    fc.assert(
      fc.property(
        debugLogDataArb,
        (log) => {
          const formatted = formatLogMessage(log)
          
          // 格式化结果应为非空字符串
          expect(typeof formatted).toBe('string')
          expect(formatted.length).toBeGreaterThan(0)
          
          // 应包含时间戳格式 [HH:MM:SS]
          expect(formatted).toMatch(/\[\d{1,2}:\d{2}:\d{2}\]/)
          
          // 应包含日志消息
          expect(formatted).toContain(log.message)
          
          // 应包含对应级别的图标
          const style = LOG_LEVEL_STYLES[log.level]
          expect(formatted).toContain(style.icon)
          
          // 如果有步骤信息，应包含步骤
          if (log.step) {
            expect(formatted).toContain(`[${log.step}]`)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 日志级别，不同级别应有不同的颜色样式', () => {
    const levels: LogLevel[] = ['info', 'step', 'success', 'warning', 'error']
    const colors = new Set<string>()
    
    for (const level of levels) {
      colors.add(LOG_LEVEL_STYLES[level].color)
    }
    
    // 所有级别应有不同的颜色
    expect(colors.size).toBe(levels.length)
  })

  it('*For any* 有效的日志数据，createLogEvent 应创建包含完整信息的事件', () => {
    fc.assert(
      fc.property(
        debugLogDataArb,
        (log) => {
          const event = createLogEvent(log)
          
          // 事件类型应为 log
          expect(event.type).toBe('log')
          
          // 应包含时间戳
          expect(event.timestamp).toBeDefined()
          expect(typeof event.timestamp).toBe('string')
          
          // 数据应包含原始日志信息
          expect(isDebugLogData(event.data)).toBe(true)
          const eventData = event.data as DebugLogData
          expect(eventData.level).toBe(log.level)
          expect(eventData.message).toBe(log.message)
          
          // 数据应包含时间戳
          expect(eventData.timestamp).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Property 4: JSON 数据格式化
// Feature: realtime-debug-logs, Property 4: JSON 数据格式化
// **Validates: Requirements 4.3**
// ============================================

describe('Property 4: JSON 数据格式化', () => {
  // Note: Avoid generating objects via plain JS assignment because `__proto__`
  // can mutate prototypes and make equality checks flaky. Generating JSON then
  // parsing it produces safe "data properties" per JSON.parse semantics.
  const safeJsonObjectArb = fc.json()
    .map((s) => JSON.parse(s) as unknown)
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v))

  /**
   * 规范化 JSON 值，将 -0 转换为 0
   * JSON 规范不区分 -0 和 0，所以 JSON.parse(JSON.stringify(-0)) 返回 0
   * 这个函数用于在比较前规范化值
   */
  const normalizeJsonValue = (value: unknown): unknown => {
    if (value === null || value === undefined) return value
    if (typeof value === 'number') {
      // 将 -0 转换为 0
      return Object.is(value, -0) ? 0 : value
    }
    if (Array.isArray(value)) {
      return value.map(normalizeJsonValue)
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        result[k] = normalizeJsonValue(v)
      }
      return result
    }
    return value
  }

  it('*For any* JSON 对象，formatJsonData 应返回格式化的 JSON 字符串', () => {
    fc.assert(
      fc.property(
        safeJsonObjectArb,
        (obj) => {
          const formatted = formatJsonData(obj)
          
          // 应返回字符串
          expect(typeof formatted).toBe('string')
          
          // 应能解析回等价对象（规范化 -0 为 0，因为 JSON 不区分它们）
          const parsed = JSON.parse(formatted)
          const normalizedObj = normalizeJsonValue(obj)
          expect(parsed).toEqual(normalizedObj)
          
          // 应包含缩进（格式化）
          if (Object.keys(obj).length > 0) {
            expect(formatted).toContain('\n')
            expect(formatted).toContain('  ') // 2空格缩进
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 数组，formatJsonData 应返回格式化的 JSON 字符串', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean())),
        (arr) => {
          const formatted = formatJsonData(arr)
          
          // 应返回字符串
          expect(typeof formatted).toBe('string')
          
          // 应能解析回等价数组
          const parsed = JSON.parse(formatted)
          expect(parsed).toEqual(arr)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 原始值，formatJsonData 应返回字符串表示', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        (value) => {
          const formatted = formatJsonData(value)
          
          // 应返回字符串
          expect(typeof formatted).toBe('string')
          
          // 字符串值应直接返回
          if (typeof value === 'string') {
            expect(formatted).toBe(value)
          } else {
            // 其他原始值应转为字符串
            expect(formatted).toBe(String(value))
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* null 或 undefined，formatJsonData 应返回空字符串', () => {
    expect(formatJsonData(null)).toBe('')
    expect(formatJsonData(undefined)).toBe('')
  })

  it('*For any* 嵌套对象，formatJsonData 应正确格式化所有层级', () => {
    fc.assert(
      fc.property(
        fc.record({
          level1: fc.record({
            level2: fc.record({
              value: fc.string(),
            }),
          }),
        }),
        (nested) => {
          const formatted = formatJsonData(nested)
          
          // 应能解析回等价对象
          const parsed = JSON.parse(formatted)
          expect(parsed).toEqual(nested)
          
          // 应包含多级缩进
          expect(formatted).toContain('    ') // 4空格表示2级缩进
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Property 2: 执行状态一致性
// Feature: realtime-debug-logs, Property 2: 执行状态一致性
// **Validates: Requirements 1.1, 1.4, 3.1, 3.3, 3.4**
// ============================================

describe('Property 2: 执行状态一致性', () => {
  it('*For any* 状态值，createStatusEvent 应创建正确类型的事件', () => {
    fc.assert(
      fc.property(
        debugStatusArb,
        (status) => {
          const event = createStatusEvent(status)
          
          // 事件类型应为 status
          expect(event.type).toBe('status')
          
          // 应包含时间戳
          expect(event.timestamp).toBeDefined()
          
          // 数据应为状态数据
          expect(isDebugStatusData(event.data)).toBe(true)
          
          // 状态值应正确
          if (isDebugStatusData(event.data)) {
            expect(event.data.status).toBe(status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 状态值和进度，createStatusEvent 应包含进度信息', () => {
    fc.assert(
      fc.property(
        debugStatusArb,
        fc.integer({ min: 0, max: 100 }),
        (status, progress) => {
          const event = createStatusEvent(status, progress)
          
          // 数据应包含进度
          if (isDebugStatusData(event.data)) {
            expect(event.data.progress).toBe(progress)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 完成状态和输出，createCompleteEvent 应创建正确的完成事件', () => {
    fc.assert(
      fc.property(
        completeStatusArb,
        fc.object(),
        fc.nat({ max: 60000 }),
        (status, output, duration) => {
          const result = {
            status,
            output,
            duration,
          }
          const event = createCompleteEvent(result)
          
          // 事件类型应为 complete
          expect(event.type).toBe('complete')
          
          // 应包含时间戳
          expect(event.timestamp).toBeDefined()
          
          // 数据应为完成数据
          expect(isDebugCompleteData(event.data)).toBe(true)
          
          // 数据应包含正确的状态和输出
          if (isDebugCompleteData(event.data)) {
            expect(event.data.status).toBe(status)
            expect(event.data.output).toEqual(output)
            expect(event.data.duration).toBe(duration)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 错误消息，createErrorEvent 应创建正确的错误事件', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.option(fc.string({ minLength: 1, maxLength: 1000 }), { nil: undefined }),
        (message, stack) => {
          const event = createErrorEvent(message, stack)
          
          // 事件类型应为 error
          expect(event.type).toBe('error')
          
          // 应包含时间戳
          expect(event.timestamp).toBeDefined()
          
          // 数据应为错误数据
          expect(isDebugErrorData(event.data)).toBe(true)
          
          // 数据应包含错误消息
          if (isDebugErrorData(event.data)) {
            expect(event.data.message).toBe(message)
            if (stack !== undefined) {
              expect(event.data.stack).toBe(stack)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 事件类型，类型守卫应正确识别事件数据类型', () => {
    // 测试日志事件
    fc.assert(
      fc.property(
        debugLogDataArb,
        (log) => {
          const event = createLogEvent(log)
          expect(isDebugLogData(event.data)).toBe(true)
          expect(isDebugStatusData(event.data)).toBe(false)
          expect(isDebugCompleteData(event.data)).toBe(false)
          expect(isDebugErrorData(event.data)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )

    // 测试状态事件
    fc.assert(
      fc.property(
        debugStatusArb,
        (status) => {
          const event = createStatusEvent(status)
          expect(isDebugLogData(event.data)).toBe(false)
          expect(isDebugStatusData(event.data)).toBe(true)
          expect(isDebugCompleteData(event.data)).toBe(false)
          expect(isDebugErrorData(event.data)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )

    // 测试完成事件
    fc.assert(
      fc.property(
        completeStatusArb,
        (status) => {
          const event = createCompleteEvent({ status, output: {}, duration: 1000 })
          expect(isDebugLogData(event.data)).toBe(false)
          expect(isDebugStatusData(event.data)).toBe(false)
          expect(isDebugCompleteData(event.data)).toBe(true)
          expect(isDebugErrorData(event.data)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )

    // 测试错误事件
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (message) => {
          const event = createErrorEvent(message)
          expect(isDebugLogData(event.data)).toBe(false)
          expect(isDebugStatusData(event.data)).toBe(false)
          expect(isDebugCompleteData(event.data)).toBe(false)
          expect(isDebugErrorData(event.data)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })
})
