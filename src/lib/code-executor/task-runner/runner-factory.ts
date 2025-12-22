/**
 * Task Runner 工厂
 * 管理和分配不同类型的代码执行器
 */

import type {
  TaskRunner,
  TaskRunnerFactory,
  TaskRunnerConfig,
  ExecutionLanguage,
  RunnerType,
  AuditLogService,
} from './types'
import { LANGUAGE_DEFAULTS } from './types'
import { IsolatedVMRunner } from './isolated-vm-runner'
import { DockerRunner, type DockerRunnerConfig } from './docker-runner'
import { NativeRunner } from './native-runner'

/**
 * 工厂配置
 */
export interface RunnerFactoryConfig {
  /** 启用的执行器类型 */
  enabledRunners?: RunnerType[]
  /** Docker 配置 */
  docker?: DockerRunnerConfig
  /** 审计日志服务 */
  auditService?: AuditLogService
  /** 是否自动选择最佳执行器 */
  autoSelect?: boolean
}

/**
 * Task Runner 工厂实现
 */
export class TaskRunnerFactoryImpl implements TaskRunnerFactory {
  private runners: Map<RunnerType, TaskRunner> = new Map()
  private languageRunnerMap: Map<ExecutionLanguage, TaskRunner> = new Map()
  private config: RunnerFactoryConfig
  private initialized = false

  constructor(config?: RunnerFactoryConfig) {
    this.config = {
      enabledRunners: config?.enabledRunners ?? ['isolated-vm', 'docker', 'native'],
      docker: config?.docker,
      auditService: config?.auditService,
      autoSelect: config?.autoSelect ?? true,
    }
  }

  /**
   * 初始化工厂
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const enabledRunners = this.config.enabledRunners ?? []

    // 创建并注册执行器
    if (enabledRunners.includes('isolated-vm')) {
      const runner = new IsolatedVMRunner()
      if (this.config.auditService) {
        runner.setAuditService(this.config.auditService)
      }
      this.register(runner)
    }

    if (enabledRunners.includes('docker')) {
      const runner = new DockerRunner(this.config.docker)
      if (this.config.auditService) {
        runner.setAuditService(this.config.auditService)
      }
      this.register(runner)
    }

    if (enabledRunners.includes('native')) {
      const runner = new NativeRunner()
      if (this.config.auditService) {
        runner.setAuditService(this.config.auditService)
      }
      this.register(runner)
    }

    // 自动配置语言到执行器的映射
    if (this.config.autoSelect) {
      await this.configureLanguageMapping()
    }

    this.initialized = true
  }

  /**
   * 创建执行器实例
   */
  create(config: TaskRunnerConfig): TaskRunner {
    switch (config.runnerType) {
      case 'isolated-vm':
        return new IsolatedVMRunner()
      case 'docker':
        return new DockerRunner(this.config.docker)
      case 'native':
        return new NativeRunner()
      default:
        throw new Error(`未知的执行器类型: ${config.runnerType}`)
    }
  }

  /**
   * 获取指定语言的最佳执行器
   */
  getRunnerForLanguage(language: ExecutionLanguage): TaskRunner | null {
    // 首先检查预配置的映射
    const mappedRunner = this.languageRunnerMap.get(language)
    if (mappedRunner) {
      return mappedRunner
    }

    // 获取语言的首选执行器类型
    const defaults = LANGUAGE_DEFAULTS[language]
    if (defaults) {
      const preferredRunner = this.runners.get(defaults.preferredRunner)
      if (preferredRunner) {
        return preferredRunner
      }
    }

    // 查找任何支持该语言的执行器
    for (const runner of this.runners.values()) {
      if (runner.supportedLanguages.includes(language)) {
        return runner
      }
    }

    return null
  }

  /**
   * 注册执行器
   */
  register(runner: TaskRunner): void {
    this.runners.set(runner.type, runner)
  }

  /**
   * 获取所有可用执行器
   */
  getAllRunners(): TaskRunner[] {
    return Array.from(this.runners.values())
  }

  /**
   * 获取指定类型的执行器
   */
  getRunner(type: RunnerType): TaskRunner | null {
    return this.runners.get(type) ?? null
  }

  /**
   * 配置语言到执行器的映射
   */
  private async configureLanguageMapping(): Promise<void> {
    const languages: ExecutionLanguage[] = ['javascript', 'typescript', 'python', 'sql']

    for (const language of languages) {
      const defaults = LANGUAGE_DEFAULTS[language]
      if (!defaults) continue

      // 尝试首选执行器
      const preferredRunner = this.runners.get(defaults.preferredRunner)
      if (preferredRunner && await preferredRunner.isAvailable()) {
        this.languageRunnerMap.set(language, preferredRunner)
        continue
      }

      // 查找其他可用的执行器
      for (const runner of this.runners.values()) {
        if (runner.supportedLanguages.includes(language) && await runner.isAvailable()) {
          this.languageRunnerMap.set(language, runner)
          break
        }
      }
    }
  }

  /**
   * 获取执行器状态摘要
   */
  async getStatusSummary(): Promise<{
    runners: Array<{
      type: RunnerType
      available: boolean
      languages: ExecutionLanguage[]
      status: Awaited<ReturnType<TaskRunner['getStatus']>>
    }>
    languageMapping: Record<ExecutionLanguage, RunnerType | null>
  }> {
    const runners = await Promise.all(
      Array.from(this.runners.values()).map(async runner => ({
        type: runner.type,
        available: await runner.isAvailable(),
        languages: runner.supportedLanguages,
        status: await runner.getStatus(),
      }))
    )

    const languageMapping: Record<ExecutionLanguage, RunnerType | null> = {
      javascript: this.languageRunnerMap.get('javascript')?.type ?? null,
      typescript: this.languageRunnerMap.get('typescript')?.type ?? null,
      python: this.languageRunnerMap.get('python')?.type ?? null,
      sql: this.languageRunnerMap.get('sql')?.type ?? null,
    }

    return { runners, languageMapping }
  }

  /**
   * 清理所有执行器资源
   */
  async cleanup(): Promise<void> {
    await Promise.all(
      Array.from(this.runners.values()).map(runner => runner.cleanup())
    )
  }
}

// 全局工厂实例
let factoryInstance: TaskRunnerFactoryImpl | null = null

/**
 * 获取全局工厂实例
 */
export function getRunnerFactory(config?: RunnerFactoryConfig): TaskRunnerFactoryImpl {
  if (!factoryInstance) {
    factoryInstance = new TaskRunnerFactoryImpl(config)
  }
  return factoryInstance
}

/**
 * 初始化全局工厂
 */
export async function initializeRunnerFactory(config?: RunnerFactoryConfig): Promise<TaskRunnerFactoryImpl> {
  const factory = getRunnerFactory(config)
  await factory.initialize()
  return factory
}
