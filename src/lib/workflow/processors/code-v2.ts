/**
 * 代码节点处理器 V2
 * 使用 Task Runner 沙盒执行框架
 *
 * 特性：
 * - V8 隔离执行（isolated-vm）用于 JavaScript/TypeScript
 * - Docker 容器隔离用于 Python
 * - 精确的资源限制（内存、CPU、时间）
 * - 执行队列防止过载
 * - 完整的审计日志
 *
 * 注意：此模块使用动态导入以避免在客户端构建时包含服务端依赖
 */

import { randomUUID } from 'crypto'
import type { NodeConfig, CodeNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables } from '../utils'

// 类型导入（不会包含在运行时）
import type {
  ExecutionLanguage,
  ResourceLimits,
} from '@/lib/code-executor/task-runner'

// 默认资源限制（避免静态导入 DEFAULT_RESOURCE_LIMITS）
const DEFAULT_LIMITS: ResourceLimits = {
  maxExecutionTime: 30000, // 30 秒
  maxMemory: 128, // 128 MB
  maxOutputSize: 1024 * 1024, // 1 MB
  maxCpuTime: 10000,
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 100,
  maxNetworkConnections: 0,
}

// 是否启用 Task Runner 框架
let taskRunnerEnabled = false
let taskRunnerInitialized = false

/**
 * 启用/禁用 Task Runner 框架
 */
export function setTaskRunnerEnabled(enabled: boolean): void {
  taskRunnerEnabled = enabled
}

/**
 * 检查 Task Runner 是否启用
 */
export function isTaskRunnerEnabled(): boolean {
  return taskRunnerEnabled
}

/**
 * 初始化 Task Runner 框架
 * 使用动态导入以避免在客户端构建时包含服务端依赖
 */
export async function initializeTaskRunner(options?: {
  enabledRunners?: Array<'isolated-vm' | 'docker' | 'native'>
  dockerEnabled?: boolean
  auditEnabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma?: any
}): Promise<void> {
  if (taskRunnerInitialized) return

  try {
    // 动态导入服务端模块
    const { initializeRunnerFactory, getAuditService } = await import('@/lib/code-executor/task-runner')

    await initializeRunnerFactory({
      enabledRunners: options?.enabledRunners ?? ['isolated-vm', 'native'],
      docker: {
        enabled: options?.dockerEnabled ?? false,
      },
      auditService: getAuditService(),
    })

    taskRunnerInitialized = true
    taskRunnerEnabled = true
  } catch (error) {
    console.error('[CodeNodeProcessor] Failed to initialize Task Runner:', error)
    taskRunnerEnabled = false
  }
}

/**
 * 代码节点处理器 V2
 */
export class CodeNodeProcessorV2 implements NodeProcessor {
  nodeType = 'CODE'

  // 资源限制配置
  private defaultLimits: ResourceLimits = {
    ...DEFAULT_LIMITS,
  }

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const codeNode = node as CodeNodeConfig

    try {
      let code = codeNode.config?.code || ''
      const language = (codeNode.config?.language || 'javascript') as ExecutionLanguage

      if (!code.trim()) {
        throw new Error('代码不能为空')
      }

      // 替换变量
      code = replaceVariables(code, context)

      // 收集输入数据
      const inputs: Record<string, unknown> = {}
      for (const [, output] of context.nodeOutputs) {
        if (output.status === 'success') {
          inputs[output.nodeName] = output.data
        }
      }

      // 获取节点配置的资源限制
      const limits = this.getResourceLimits(codeNode)

      // 动态导入并执行代码
      const { executeCode } = await import('@/lib/code-executor/task-runner')
      const result = await executeCode(
        code,
        language,
        {
          executionId: randomUUID(),
          workflowId: context.workflowId,
          nodeId: node.id,
          userId: context.userId,
          inputs,
        },
        limits
      )

      if (!result.success) {
        throw new Error(result.error || '代码执行失败')
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          output: result.output,
          type: result.outputType,
          formattedOutput: result.formattedOutput,
          logs: result.logs.map(log => `[${log.level.toUpperCase()}] ${log.message}`),
          logCount: result.logs.length,
          executionTime: result.metrics.executionTime,
          memoryUsed: result.metrics.memoryUsed,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '代码执行失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 获取资源限制配置
   */
  private getResourceLimits(node: CodeNodeConfig): Partial<ResourceLimits> {
    const config = node.config

    return {
      maxExecutionTime: config?.timeout ?? this.defaultLimits.maxExecutionTime,
      maxMemory: config?.maxMemory ?? this.defaultLimits.maxMemory,
      maxOutputSize: config?.maxOutputSize ?? this.defaultLimits.maxOutputSize,
    }
  }
}

export const codeNodeProcessorV2 = new CodeNodeProcessorV2()
