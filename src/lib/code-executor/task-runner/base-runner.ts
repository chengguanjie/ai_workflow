/**
 * Task Runner 基础抽象类
 * 提供共享功能如日志记录、输出格式化、资源限制检查等
 */

import { createHash } from 'crypto'
import type {
  TaskRunner,
  RunnerType,
  ExecutionLanguage,
  ExecutionContext,
  ExecutionResult,
  ResourceLimits,
  LogEntry,
  AuditLogEntry,
  AuditLogService,
} from './types'
import { DEFAULT_RESOURCE_LIMITS } from './types'

/**
 * 执行状态跟踪
 */
interface ExecutionState {
  executionId: string
  startedAt: Date
  abortController?: AbortController
  status: 'running' | 'completed' | 'terminated' | 'error'
}

/**
 * Task Runner 基础抽象类
 */
export abstract class BaseTaskRunner implements TaskRunner {
  abstract readonly type: RunnerType
  abstract readonly supportedLanguages: ExecutionLanguage[]

  protected runningExecutions: Map<string, ExecutionState> = new Map()
  protected auditService?: AuditLogService

  constructor(options?: { auditService?: AuditLogService }) {
    this.auditService = options?.auditService
  }

  /**
   * 设置审计服务
   */
  setAuditService(service: AuditLogService): void {
    this.auditService = service
  }

  /**
   * 执行代码 - 抽象方法，由子类实现
   */
  abstract execute(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>
  ): Promise<ExecutionResult>

  /**
   * 检查执行器是否可用 - 抽象方法
   */
  abstract isAvailable(): Promise<boolean>

  /**
   * 内部执行实现 - 子类实现具体逻辑
   */
  protected abstract executeInternal(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits: ResourceLimits,
    state: ExecutionState
  ): Promise<ExecutionResult>

  /**
   * 包装执行过程，添加审计日志和状态跟踪
   */
  protected async executeWithTracking(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>
  ): Promise<ExecutionResult> {
    const effectiveLimits = this.mergeResourceLimits(limits)
    const startedAt = new Date()

    // 创建执行状态
    const state: ExecutionState = {
      executionId: context.executionId,
      startedAt,
      abortController: new AbortController(),
      status: 'running',
    }
    this.runningExecutions.set(context.executionId, state)

    // 记录开始审计日志
    await this.logAudit({
      eventType: 'execution_start',
      executionId: context.executionId,
      userId: context.userId,
      workflowId: context.workflowId,
      nodeId: context.nodeId,
      language,
      runnerType: this.type,
      codeHash: this.hashCode(code),
    })

    try {
      // 执行代码
      const result = await this.executeInternal(code, language, context, effectiveLimits, state)

      state.status = 'completed'

      // 记录完成审计日志
      await this.logAudit({
        eventType: result.success ? 'execution_complete' : 'execution_error',
        executionId: context.executionId,
        userId: context.userId,
        workflowId: context.workflowId,
        nodeId: context.nodeId,
        language,
        runnerType: this.type,
        codeHash: this.hashCode(code),
        metrics: result.metrics,
        error: result.error,
      })

      return result
    } catch (error) {
      state.status = 'error'
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 记录错误审计日志
      await this.logAudit({
        eventType: 'execution_error',
        executionId: context.executionId,
        userId: context.userId,
        workflowId: context.workflowId,
        nodeId: context.nodeId,
        language,
        runnerType: this.type,
        codeHash: this.hashCode(code),
        error: errorMessage,
      })

      return this.createErrorResult(errorMessage, startedAt)
    } finally {
      this.runningExecutions.delete(context.executionId)
    }
  }

  /**
   * 终止执行
   */
  async terminate(executionId: string): Promise<void> {
    const state = this.runningExecutions.get(executionId)
    if (state) {
      state.status = 'terminated'
      state.abortController?.abort()
      this.runningExecutions.delete(executionId)
    }
  }

  /**
   * 获取执行器状态
   */
  async getStatus(): Promise<{
    available: boolean
    runningTasks: number
    queuedTasks: number
  }> {
    const available = await this.isAvailable()
    return {
      available,
      runningTasks: this.runningExecutions.size,
      queuedTasks: 0, // 由队列管理器处理
    }
  }

  /**
   * 清理资源 - 可由子类覆盖
   */
  async cleanup(): Promise<void> {
    // 终止所有运行中的任务
    const executions = Array.from(this.runningExecutions.keys())
    await Promise.all(executions.map(id => this.terminate(id)))
  }

  /**
   * 合并资源限制配置
   */
  protected mergeResourceLimits(overrides?: Partial<ResourceLimits>): ResourceLimits {
    return {
      ...DEFAULT_RESOURCE_LIMITS,
      ...overrides,
    }
  }

  /**
   * 计算代码哈希
   */
  protected hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex').slice(0, 16)
  }

  /**
   * 创建成功结果
   */
  protected createSuccessResult(
    output: unknown,
    logs: LogEntry[],
    startedAt: Date
  ): ExecutionResult {
    const completedAt = new Date()
    return {
      success: true,
      output,
      formattedOutput: this.formatOutput(output),
      outputType: this.getOutputType(output),
      logs,
      metrics: {
        executionTime: completedAt.getTime() - startedAt.getTime(),
        startedAt,
        completedAt,
      },
    }
  }

  /**
   * 创建错误结果
   */
  protected createErrorResult(
    error: string,
    startedAt: Date,
    errorStack?: string,
    logs: LogEntry[] = []
  ): ExecutionResult {
    const completedAt = new Date()
    return {
      success: false,
      output: null,
      formattedOutput: `Error: ${error}`,
      outputType: 'error',
      logs,
      metrics: {
        executionTime: completedAt.getTime() - startedAt.getTime(),
        startedAt,
        completedAt,
      },
      error,
      errorStack,
    }
  }

  /**
   * 格式化输出
   */
  protected formatOutput(value: unknown, maxDepth: number = 3, currentDepth: number = 0): string {
    if (currentDepth > maxDepth) {
      return '[...]'
    }

    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'function') return '[Function]'
    if (value instanceof Error) return `Error: ${value.message}`
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return value.toString()

    if (value instanceof Map) {
      const entries = Array.from(value.entries())
      return `Map(${entries.length}) { ${entries.slice(0, 5).map(([k, v]) =>
        `${this.formatOutput(k, maxDepth, currentDepth + 1)} => ${this.formatOutput(v, maxDepth, currentDepth + 1)}`
      ).join(', ')}${entries.length > 5 ? ', ...' : ''} }`
    }

    if (value instanceof Set) {
      const items = Array.from(value)
      return `Set(${items.length}) { ${items.slice(0, 5).map(v =>
        this.formatOutput(v, maxDepth, currentDepth + 1)
      ).join(', ')}${items.length > 5 ? ', ...' : ''} }`
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]'
      if (currentDepth >= maxDepth) return `[Array(${value.length})]`

      const items = value.slice(0, 10).map(v =>
        this.formatOutput(v, maxDepth, currentDepth + 1)
      )
      return `[${items.join(', ')}${value.length > 10 ? `, ... (${value.length - 10} more)` : ''}]`
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as object)
      if (keys.length === 0) return '{}'
      if (currentDepth >= maxDepth) return `{Object(${keys.length} keys)}`

      const entries = keys.slice(0, 10).map(k =>
        `${k}: ${this.formatOutput((value as Record<string, unknown>)[k], maxDepth, currentDepth + 1)}`
      )
      return `{ ${entries.join(', ')}${keys.length > 10 ? `, ... (${keys.length - 10} more)` : ''} }`
    }

    if (typeof value === 'string') {
      if (value.length > 500) {
        return `"${value.slice(0, 500)}..." (${value.length} chars)`
      }
      return JSON.stringify(value)
    }

    return String(value)
  }

  /**
   * 获取输出类型
   */
  protected getOutputType(value: unknown): ExecutionResult['outputType'] {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (Array.isArray(value)) return 'array'
    if (value instanceof Error) return 'error'
    const type = typeof value
    if (type === 'object') return 'object'
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return type as ExecutionResult['outputType']
    }
    return 'string'
  }

  /**
   * 创建日志条目
   */
  protected createLogEntry(
    level: LogEntry['level'],
    message: string,
    data?: unknown
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date(),
      data,
    }
  }

  /**
   * 记录审计日志
   */
  protected async logAudit(
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
  ): Promise<void> {
    if (this.auditService) {
      try {
        await this.auditService.log(entry)
      } catch {
        // 审计日志失败不应影响执行
        console.error('[TaskRunner] Failed to log audit entry')
      }
    }
  }

  /**
   * 检查是否超时
   */
  protected isTimedOut(startedAt: Date, maxExecutionTime: number): boolean {
    return Date.now() - startedAt.getTime() > maxExecutionTime
  }

  /**
   * 创建超时 Promise
   */
  protected createTimeoutPromise<T>(
    ms: number,
    message: string = '执行超时'
  ): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${message} (${ms}ms)`)), ms)
    })
  }

  /**
   * 带超时执行
   */
  protected async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = '执行超时'
  ): Promise<T> {
    return Promise.race([
      promise,
      this.createTimeoutPromise<T>(timeoutMs, timeoutMessage),
    ])
  }
}

/**
 * 日志收集器
 * 用于在沙盒环境中收集 console 输出
 */
export class LogCollector {
  private logs: LogEntry[] = []
  private maxEntries: number

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries
  }

  add(level: LogEntry['level'], ...args: unknown[]): void {
    if (this.logs.length >= this.maxEntries) {
      return
    }

    const message = args
      .map(arg => {
        if (typeof arg === 'string') return arg
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      })
      .join(' ')

    this.logs.push({
      level,
      message,
      timestamp: new Date(),
    })
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clear(): void {
    this.logs = []
  }

  /**
   * 创建模拟 console 对象
   */
  createConsole(): Console {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const collector = this
    return {
      log: (...args: unknown[]) => collector.add('log', ...args),
      info: (...args: unknown[]) => collector.add('info', ...args),
      warn: (...args: unknown[]) => collector.add('warn', ...args),
      error: (...args: unknown[]) => collector.add('error', ...args),
      debug: (...args: unknown[]) => collector.add('debug', ...args),
      // 其他 console 方法的空实现
      assert: () => {},
      clear: () => collector.clear(),
      count: () => {},
      countReset: () => {},
      dir: () => {},
      dirxml: () => {},
      group: () => {},
      groupCollapsed: () => {},
      groupEnd: () => {},
      table: (data: unknown) => collector.add('log', data),
      time: () => {},
      timeEnd: () => {},
      timeLog: () => {},
      timeStamp: () => {},
      trace: () => {},
      profile: () => {},
      profileEnd: () => {},
      Console: console.Console,
    } as Console
  }
}
