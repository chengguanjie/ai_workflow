/**
 * Task Runner 类型定义
 * 服务端代码沙盒执行框架
 */

/**
 * 支持的执行语言
 */
export type ExecutionLanguage = 'javascript' | 'typescript' | 'python' | 'sql'

/**
 * 执行器类型
 */
export type RunnerType = 'isolated-vm' | 'docker' | 'native'

/**
 * 资源限制配置
 */
export interface ResourceLimits {
  /** 最大执行时间 (ms) */
  maxExecutionTime: number
  /** 最大内存使用 (MB) */
  maxMemory: number
  /** 最大 CPU 使用时间 (ms) */
  maxCpuTime?: number
  /** 最大输出大小 (bytes) */
  maxOutputSize?: number
  /** 最大单文件大小 (bytes) */
  maxFileSize?: number
  /** 最大文件数量 */
  maxFiles?: number
  /** 最大网络连接数 (0 = 禁用) */
  maxNetworkConnections?: number
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  /** 执行 ID */
  executionId: string
  /** 工作流 ID */
  workflowId?: string
  /** 节点 ID */
  nodeId?: string
  /** 用户 ID */
  userId?: string
  /** 注入的变量 */
  inputs: Record<string, unknown>
  /** 允许的模块白名单 */
  allowedModules?: string[]
  /** 环境变量 */
  envVars?: Record<string, string>
}

/**
 * 执行指标
 */
export interface ExecutionMetrics {
  /** 实际执行时间 (ms) */
  executionTime: number
  /** 内存使用峰值 (bytes) */
  memoryUsed?: number
  /** CPU 使用时间 (ms) */
  cpuTime?: number
  /** 开始时间 */
  startedAt: Date
  /** 结束时间 */
  completedAt: Date
}

/**
 * 日志条目
 */
export interface LogEntry {
  /** 日志级别 */
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  /** 日志消息 */
  message: string
  /** 时间戳 */
  timestamp: Date
  /** 额外数据 */
  data?: unknown
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean
  /** 返回值 */
  output: unknown
  /** 格式化的输出 */
  formattedOutput: string
  /** 输出类型 */
  outputType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined' | 'error'
  /** 控制台日志 */
  logs: LogEntry[]
  /** 执行指标 */
  metrics: ExecutionMetrics
  /** 错误信息 */
  error?: string
  /** 错误堆栈 */
  errorStack?: string
}

/**
 * Task Runner 配置
 */
export interface TaskRunnerConfig {
  /** 执行器类型 */
  runnerType: RunnerType
  /** 支持的语言 */
  supportedLanguages: ExecutionLanguage[]
  /** 资源限制 */
  limits: ResourceLimits
  /** 允许的模块白名单 */
  allowedModules?: string[]
  /** Docker 配置 (仅 docker 类型) */
  docker?: {
    image: string
    network?: 'none' | 'bridge' | 'host'
    user?: string
  }
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /** 事件 ID */
  id: string
  /** 事件类型 */
  eventType: 'execution_start' | 'execution_complete' | 'execution_error' | 'resource_limit' | 'security_violation'
  /** 执行 ID */
  executionId: string
  /** 用户 ID */
  userId?: string
  /** 工作流 ID */
  workflowId?: string
  /** 节点 ID */
  nodeId?: string
  /** 语言 */
  language: ExecutionLanguage
  /** 执行器类型 */
  runnerType: RunnerType
  /** 代码哈希 (用于审计，不存储完整代码) */
  codeHash: string
  /** 执行指标 */
  metrics?: ExecutionMetrics
  /** 错误信息 */
  error?: string
  /** 时间戳 */
  timestamp: Date
  /** 额外元数据 */
  metadata?: Record<string, unknown>
}

/**
 * Task Runner 接口
 */
export interface TaskRunner {
  /** 执行器类型 */
  readonly type: RunnerType
  /** 支持的语言 */
  readonly supportedLanguages: ExecutionLanguage[]

  /**
   * 执行代码
   * @param code 要执行的代码
   * @param language 语言类型
   * @param context 执行上下文
   * @param limits 资源限制
   */
  execute(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>
  ): Promise<ExecutionResult>

  /**
   * 检查执行器是否可用
   */
  isAvailable(): Promise<boolean>

  /**
   * 终止正在执行的任务
   * @param executionId 执行 ID
   */
  terminate(executionId: string): Promise<void>

  /**
   * 获取执行器状态
   */
  getStatus(): Promise<{
    available: boolean
    runningTasks: number
    queuedTasks: number
  }>

  /**
   * 清理资源
   */
  cleanup(): Promise<void>
}

/**
 * Task Runner 工厂接口
 */
export interface TaskRunnerFactory {
  /**
   * 创建执行器实例
   * @param config 配置
   */
  create(config: TaskRunnerConfig): TaskRunner

  /**
   * 获取指定语言的最佳执行器
   * @param language 语言类型
   */
  getRunnerForLanguage(language: ExecutionLanguage): TaskRunner | null

  /**
   * 注册执行器
   * @param runner 执行器实例
   */
  register(runner: TaskRunner): void

  /**
   * 获取所有可用执行器
   */
  getAllRunners(): TaskRunner[]
}

/**
 * 审计日志服务接口
 */
export interface AuditLogService {
  /**
   * 记录审计日志
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void>

  /**
   * 查询审计日志
   */
  query(filters: {
    userId?: string
    workflowId?: string
    nodeId?: string
    eventType?: AuditLogEntry['eventType']
    startTime?: Date
    endTime?: Date
    limit?: number
    offset?: number
  }): Promise<AuditLogEntry[]>
}

/**
 * 默认资源限制
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxExecutionTime: 30000, // 30 秒
  maxMemory: 128, // 128 MB
  maxCpuTime: 10000, // 10 秒 CPU 时间
  maxOutputSize: 1024 * 1024, // 1 MB
}

/**
 * 各语言的默认配置
 */
export const LANGUAGE_DEFAULTS: Record<ExecutionLanguage, {
  preferredRunner: RunnerType
  limits: Partial<ResourceLimits>
}> = {
  javascript: {
    preferredRunner: 'isolated-vm',
    limits: {
      maxExecutionTime: 10000,
      maxMemory: 64,
    },
  },
  typescript: {
    preferredRunner: 'isolated-vm',
    limits: {
      maxExecutionTime: 15000,
      maxMemory: 128,
    },
  },
  python: {
    preferredRunner: 'docker',
    limits: {
      maxExecutionTime: 30000,
      maxMemory: 256,
    },
  },
  sql: {
    preferredRunner: 'native',
    limits: {
      maxExecutionTime: 60000,
      maxMemory: 512,
    },
  },
}
