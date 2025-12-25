/**
 * Task Runner 模块导出
 * 服务端代码沙盒执行框架
 */

// 类型导出
export type {
  ExecutionLanguage,
  RunnerType,
  ResourceLimits,
  ExecutionContext,
  ExecutionMetrics,
  LogEntry,
  ExecutionResult,
  TaskRunnerConfig,
  AuditLogEntry,
  TaskRunner,
  TaskRunnerFactory,
  AuditLogService,
} from './types'

export {
  DEFAULT_RESOURCE_LIMITS,
  LANGUAGE_DEFAULTS,
} from './types'

// 基础类导出
export { BaseTaskRunner, LogCollector } from './base-runner'

// 执行器导出
export { IsolatedVMRunner, getIsolatedVMRunner, getIsolatedVMError } from './isolated-vm-runner'
export { DockerRunner, getDockerRunner, type DockerRunnerConfig } from './docker-runner'
export { NativeRunner, getNativeRunner } from './native-runner'

// 工厂导出
export {
  TaskRunnerFactoryImpl,
  getRunnerFactory,
  initializeRunnerFactory,
  type RunnerFactoryConfig,
} from './runner-factory'

// 队列导出
export {
  ExecutionQueue,
  getExecutionQueue,
  executeCode,
  type ExecutionQueueConfig,
  type QueueStats,
} from './execution-queue'

// 审计服务导出
export {
  AuditLogServiceImpl,
  InMemoryAuditStorage,
  DatabaseAuditStorage,
  getAuditService,
  initDatabaseAuditService,
  type AuditLogStorage,
  type AuditQueryFilters,
} from './audit-service'
import type { PrismaClient } from '@prisma/client'

/**
 * 便捷初始化函数
 * 一次性初始化整个代码执行框架
 */
export async function initializeCodeExecutor(options?: {
  enabledRunners?: Array<'isolated-vm' | 'docker' | 'native'>
  dockerConfig?: {
    pythonImage?: string
    nodeImage?: string
    networkMode?: 'none' | 'bridge' | 'host'
    enabled?: boolean
  }
  queueConfig?: {
    maxConcurrency?: number
    maxQueueSize?: number
    queueTimeout?: number
  }
  auditEnabled?: boolean
  prisma?: PrismaClient
}): Promise<{
  factory: import('./runner-factory').TaskRunnerFactoryImpl
  queue: import('./execution-queue').ExecutionQueue
  audit: import('./audit-service').AuditLogServiceImpl
}> {
  const { initializeRunnerFactory } = await import('./runner-factory')
  const { getExecutionQueue } = await import('./execution-queue')
  const { getAuditService, initDatabaseAuditService } = await import('./audit-service')

  // 初始化审计服务
  const audit = options?.prisma
    ? initDatabaseAuditService(options.prisma)
    : getAuditService()

  if (options?.auditEnabled === false) {
    audit.setEnabled(false)
  }

  // 初始化执行器工厂
  const factory = await initializeRunnerFactory({
    enabledRunners: options?.enabledRunners,
    docker: options?.dockerConfig,
    auditService: audit,
  })

  // 获取执行队列
  const queue = getExecutionQueue(options?.queueConfig)

  return { factory, queue, audit }
}

/**
 * 获取代码执行能力摘要
 */
export async function getCodeExecutorCapabilities(): Promise<{
  languages: Array<{
    language: string
    available: boolean
    runner: string | null
  }>
  runners: Array<{
    type: string
    available: boolean
    languages: string[]
  }>
}> {
  const { getRunnerFactory } = await import('./runner-factory')
  const factory = getRunnerFactory()
  await factory.initialize()

  const status = await factory.getStatusSummary()

  return {
    languages: [
      {
        language: 'javascript',
        available: status.languageMapping.javascript !== null,
        runner: status.languageMapping.javascript,
      },
      {
        language: 'typescript',
        available: status.languageMapping.typescript !== null,
        runner: status.languageMapping.typescript,
      },
      {
        language: 'python',
        available: status.languageMapping.python !== null,
        runner: status.languageMapping.python,
      },
      {
        language: 'sql',
        available: status.languageMapping.sql !== null,
        runner: status.languageMapping.sql,
      },
    ],
    runners: status.runners.map(r => ({
      type: r.type,
      available: r.available,
      languages: r.languages,
    })),
  }
}
