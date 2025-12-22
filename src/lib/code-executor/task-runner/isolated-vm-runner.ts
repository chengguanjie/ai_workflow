/**
 * Isolated VM Task Runner
 * 使用 isolated-vm 提供 V8 隔离环境执行 JavaScript/TypeScript
 *
 * 特性：
 * - 完全的 V8 隔离，代码在独立的 Isolate 中运行
 * - 精确的内存限制
 * - CPU 时间限制
 * - 安全的变量注入
 */

import type {
  ExecutionLanguage,
  ExecutionContext,
  ExecutionResult,
  ResourceLimits,
  LogEntry,
} from './types'
import { createRequire } from 'node:module'
import { BaseTaskRunner, LogCollector } from './base-runner'
import type { RunnerType } from './types'

// isolated-vm 类型定义
interface IsolatedVM {
  Isolate: new (options?: { memoryLimit: number }) => IsolateInstance
}

interface IsolateInstance {
  createContextSync(): ContextInstance
  dispose(): void
  compileScriptSync(code: string): ScriptInstance
  getHeapStatistics(): { used_heap_size: number }
}

interface ContextInstance {
  global: ReferenceInstance
  release(): void
}

interface ReferenceInstance {
  setSync(key: string, value: unknown): void
  getSync(key: string): unknown
  deref(): unknown
}

interface ScriptInstance {
  runSync(context: ContextInstance, options?: { timeout?: number }): unknown
}

// 运行时加载 isolated-vm
let ivm: IsolatedVM | null = null
let ivmLoadError: Error | null = null
let ivmLoaded = false

async function loadIsolatedVM(): Promise<IsolatedVM | null> {
  if (ivmLoaded) {
    return ivm
  }

  try {
    // isolated-vm 是可选依赖：使用动态 require 避免在构建期强制解析该模块
    const require = createRequire(import.meta.url)
    const moduleName = 'isolated-vm'
    const isolatedVmModule = require(moduleName) as unknown
    const maybeModule = isolatedVmModule as { default?: IsolatedVM }
    ivm = maybeModule.default ?? (isolatedVmModule as IsolatedVM)
    ivmLoaded = true
    return ivm
  } catch (error) {
    ivmLoadError = error instanceof Error ? error : new Error(String(error))
    ivmLoaded = true
    return null
  }
}

/**
 * Isolated VM 执行器
 */
export class IsolatedVMRunner extends BaseTaskRunner {
  readonly type: RunnerType = 'isolated-vm'
  readonly supportedLanguages: ExecutionLanguage[] = ['javascript', 'typescript']

  private isolatePool: IsolateInstance[] = []
  private maxPoolSize: number
  private defaultMemoryLimit: number

  constructor(options?: {
    maxPoolSize?: number
    defaultMemoryLimit?: number // MB
  }) {
    super()
    this.maxPoolSize = options?.maxPoolSize ?? 5
    this.defaultMemoryLimit = options?.defaultMemoryLimit ?? 128
  }

  /**
   * 检查 isolated-vm 是否可用
   */
  async isAvailable(): Promise<boolean> {
    const vm = await loadIsolatedVM()
    return vm !== null
  }

  /**
   * 执行代码
   */
  async execute(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>
  ): Promise<ExecutionResult> {
    // 检查语言支持
    if (!this.supportedLanguages.includes(language)) {
      return this.createErrorResult(
        `IsolatedVMRunner 不支持 ${language} 语言`,
        new Date()
      )
    }

    return this.executeWithTracking(code, language, context, limits)
  }

  /**
   * 内部执行实现
   */
  protected async executeInternal(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits: ResourceLimits
  ): Promise<ExecutionResult> {
    const startedAt = new Date()
    const logCollector = new LogCollector()

    // 加载 isolated-vm
    const vm = await loadIsolatedVM()
    if (!vm) {
      // 降级到内置沙箱
      return this.executeFallback(code, context, limits, logCollector, startedAt)
    }

    let isolate: IsolateInstance | null = null
    let contextInstance: ContextInstance | null = null

    try {
      // 创建或获取 Isolate
      const memoryLimit = Math.min(limits.maxMemory, 512) // 最大 512MB
      isolate = this.getOrCreateIsolate(vm, memoryLimit)

      // 创建执行上下文
      contextInstance = isolate.createContextSync()
      const jail = contextInstance.global

      // 注入安全的全局对象
      this.injectGlobals(jail, context.inputs, logCollector)

      // 包装代码
      const wrappedCode = this.wrapCode(code, language)

      // 编译并执行
      const script = isolate.compileScriptSync(wrappedCode)
      const timeout = limits.maxExecutionTime

      const result = await this.executeWithTimeout(
        Promise.resolve(script.runSync(contextInstance, { timeout })),
        timeout,
        '代码执行超时'
      )

      // 获取内存使用
      const heapStats = isolate.getHeapStatistics()

      return {
        success: true,
        output: result,
        formattedOutput: this.formatOutput(result),
        outputType: this.getOutputType(result),
        logs: logCollector.getLogs(),
        metrics: {
          executionTime: Date.now() - startedAt.getTime(),
          memoryUsed: heapStats.used_heap_size,
          startedAt,
          completedAt: new Date(),
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      return this.createErrorResult(
        errorMessage,
        startedAt,
        errorStack,
        logCollector.getLogs()
      )
    } finally {
      // 清理资源
      if (contextInstance) {
        try {
          contextInstance.release()
        } catch {
          // 忽略清理错误
        }
      }
      // 将 isolate 返回池中或销毁
      if (isolate) {
        this.returnIsolate(isolate)
      }
    }
  }

  /**
   * 获取或创建 Isolate
   */
  private getOrCreateIsolate(vm: IsolatedVM, memoryLimit: number): IsolateInstance {
    // 尝试从池中获取
    const isolate = this.isolatePool.pop()
    if (isolate) {
      return isolate
    }

    // 创建新的 Isolate
    return new vm.Isolate({ memoryLimit })
  }

  /**
   * 返回 Isolate 到池中
   */
  private returnIsolate(isolate: IsolateInstance): void {
    if (this.isolatePool.length < this.maxPoolSize) {
      this.isolatePool.push(isolate)
    } else {
      // 池已满，销毁
      try {
        isolate.dispose()
      } catch {
        // 忽略销毁错误
      }
    }
  }

  /**
   * 注入安全的全局对象
   */
  private injectGlobals(
    jail: ReferenceInstance,
    inputs: Record<string, unknown>,
    logCollector: LogCollector
  ): void {
    // 注入 inputs
    jail.setSync('inputs', JSON.parse(JSON.stringify(inputs)))

    // 注入安全的全局对象
    jail.setSync('JSON', {
      parse: JSON.parse,
      stringify: JSON.stringify,
    })

    // 注入 Math
    jail.setSync('Math', Math)

    // 注入日志收集器（通过回调）
    const createLogger = (level: LogEntry['level']) => {
      return (...args: unknown[]) => {
        logCollector.add(level, ...args)
      }
    }

    jail.setSync('console', {
      log: createLogger('log'),
      info: createLogger('info'),
      warn: createLogger('warn'),
      error: createLogger('error'),
      debug: createLogger('debug'),
    })

    // 注入基础类型构造函数
    jail.setSync('Array', Array)
    jail.setSync('Object', Object)
    jail.setSync('String', String)
    jail.setSync('Number', Number)
    jail.setSync('Boolean', Boolean)
    jail.setSync('Date', Date)
    jail.setSync('RegExp', RegExp)
    jail.setSync('Map', Map)
    jail.setSync('Set', Set)
    jail.setSync('Promise', Promise)

    // 注入工具函数
    jail.setSync('parseInt', parseInt)
    jail.setSync('parseFloat', parseFloat)
    jail.setSync('isNaN', isNaN)
    jail.setSync('isFinite', isFinite)
    jail.setSync('encodeURIComponent', encodeURIComponent)
    jail.setSync('decodeURIComponent', decodeURIComponent)
  }

  /**
   * 包装代码
   */
  private wrapCode(code: string, language: ExecutionLanguage): string {
    // TypeScript 需要先转译（这里简化处理，实际应使用 TypeScript 编译器）
    if (language === 'typescript') {
      // 简单的 TypeScript 处理：移除类型注解
      code = this.stripTypeAnnotations(code)
    }

    return `
      (function() {
        "use strict";
        ${code}
      })()
    `
  }

  /**
   * 简单的类型注解移除（生产环境应使用 TypeScript 编译器）
   */
  private stripTypeAnnotations(code: string): string {
    // 移除类型注解（简化版本）
    return code
      .replace(/:\s*(string|number|boolean|any|void|object|unknown)\b/g, '')
      .replace(/:\s*\w+\[\]/g, '')
      .replace(/<[^>]+>/g, '') // 泛型
      .replace(/as\s+\w+/g, '') // 类型断言
      .replace(/interface\s+\w+\s*\{[^}]*\}/g, '') // 接口定义
      .replace(/type\s+\w+\s*=\s*[^;]+;/g, '') // 类型别名
  }

  /**
   * 降级到内置沙箱执行
   */
  private async executeFallback(
    code: string,
    context: ExecutionContext,
    limits: ResourceLimits,
    logCollector: LogCollector,
    startedAt: Date
  ): Promise<ExecutionResult> {
    // 使用 new Function 创建沙箱（安全性较低）
    const forbidden = [
      'require', 'process', 'global', '__dirname', '__filename',
      'module', 'exports', 'Buffer', 'fetch', 'XMLHttpRequest',
      'WebSocket', 'eval', 'Function', 'Proxy', 'Reflect',
      'importScripts', 'Worker', 'SharedWorker',
    ]

    const safeGlobals: Record<string, unknown> = {
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      inputs: context.inputs,
      console: logCollector.createConsole(),
    }

    try {
      const wrappedCode = `
        "use strict";
        ${forbidden.map(f => `const ${f} = undefined;`).join('\n')}

        let __result__;
        try {
          __result__ = (function() {
            ${code}
          })();
        } catch (e) {
          throw e;
        }
        __result__;
      `

      const fn = new Function(...Object.keys(safeGlobals), wrappedCode)

      const result = await this.executeWithTimeout(
        Promise.resolve(fn(...Object.values(safeGlobals))),
        limits.maxExecutionTime,
        '代码执行超时'
      )

      return {
        success: true,
        output: result,
        formattedOutput: this.formatOutput(result),
        outputType: this.getOutputType(result),
        logs: logCollector.getLogs(),
        metrics: {
          executionTime: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return this.createErrorResult(
        errorMessage,
        startedAt,
        error instanceof Error ? error.stack : undefined,
        logCollector.getLogs()
      )
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await super.cleanup()

    // 销毁所有池化的 Isolate
    for (const isolate of this.isolatePool) {
      try {
        isolate.dispose()
      } catch {
        // 忽略销毁错误
      }
    }
    this.isolatePool = []
  }
}

// 导出单例
let defaultRunner: IsolatedVMRunner | null = null

export function getIsolatedVMRunner(): IsolatedVMRunner {
  if (!defaultRunner) {
    defaultRunner = new IsolatedVMRunner()
  }
  return defaultRunner
}

/**
 * 检查 isolated-vm 加载错误
 */
export function getIsolatedVMError(): Error | null {
  return ivmLoadError
}
