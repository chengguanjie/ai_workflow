/**
 * 节点调试模块
 *
 * 支持单节点独立运行，用于开发和调试工作流
 */

import type { NodeConfig, WorkflowConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from './types'
import { getProcessor } from './processors'
import type { DebugLogData } from './debug-events'
import { redactDeep } from '@/lib/observability/redaction'

/**
 * 日志回调函数类型
 * 用于流式输出日志
 */
export type OnLogCallback = (log: DebugLogData) => void

export interface DebugRequest {
  workflowId: string
  organizationId: string
  userId: string
  node: NodeConfig
  mockInputs: Record<string, Record<string, unknown>>
  config: WorkflowConfig
  /** Optional internal timeout for processor execution (ms). */
  timeoutMs?: number
  importedFiles?: Array<{ name: string; content: string; type: string }>
}

/**
 * 流式调试请求
 * 扩展 DebugRequest，添加日志回调
 */
export interface DebugStreamRequest extends DebugRequest {
  /** 日志回调函数，用于实时推送日志 */
  onLog?: OnLogCallback
}

export interface DebugResult {
  status: 'success' | 'error' | 'skipped' | 'paused'
  output: Record<string, unknown>
  error?: string
  duration: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  logs?: string[]
  /** Approval request ID when node is paused for approval */
  approvalRequestId?: string
}

export async function debugNode(request: DebugRequest): Promise<DebugResult> {
  const { workflowId, organizationId, userId, node, mockInputs, config, importedFiles, timeoutMs } = request
  const startTime = Date.now()
  const logs: string[] = []

  // 早期记录，确保即使出错也能看到基本信息
  logs.push(`[${new Date().toLocaleTimeString()}] 🔹 开始调试节点: ${node.name} (${node.type})`)

  /* Structured logs for detailed debugging */
  const executionLogs: Array<{
    type: 'info' | 'step' | 'success' | 'warning' | 'error'
    message: string
    step?: string
    data?: unknown
    timestamp: Date
  }> = []

  const addLog = (type: 'info' | 'step' | 'success' | 'warning' | 'error', message: string, step?: string, data?: unknown) => {
    const safeData = data === undefined ? undefined : redactDeep(data)

    // 1. Add to structured logs
    executionLogs.push({
      type,
      message,
      step,
      data: safeData,
      timestamp: new Date()
    })

    // 2. Add to legacy string logs for UI display
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    let icon = '🔹'
    if (type === 'step') icon = '⚡'
    if (type === 'success') icon = '✅'
    if (type === 'warning') icon = '⚠️'
    if (type === 'error') icon = '❌'

    let logMsg = `[${timeStr}] ${icon} ${message}`
    if (step) logMsg = `[${timeStr}] ${icon} [${step}] ${message}`

    logs.push(logMsg)

    // Log data if present (formatted)
    if (safeData) {
      if (typeof safeData === 'object') {
        try {
          logs.push(`  ${JSON.stringify(safeData, null, 2).split('\n').join('\n  ')}`)
        } catch {
          logs.push(`  [Data] ${String(safeData)}`)
        }
      } else {
        logs.push(`  [Data] ${String(safeData)}`)
      }
    }
  }

  const context: ExecutionContext = {
    executionId: `debug-${Date.now()}`,
    workflowId,
    organizationId,
    userId,
    nodeOutputs: new Map(),
    globalVariables: config.globalVariables || {},
    aiConfigs: new Map(),
    logs: executionLogs,
    addLog,
    importedFiles
  }

  addLog('info', `开始调试节点: ${node.name}`, 'INIT', { nodeId: node.id, type: node.type })

  // 检查节点配置
  const nodeConfig = node.config as {
    enableToolCalling?: boolean
    tools?: Array<{ enabled?: boolean; type?: string; name?: string }>
    model?: string
    aiConfigId?: string
  }

  addLog('info', '节点配置检查', 'CONFIG', {
    hasTools: Boolean(nodeConfig?.tools?.length),
    enabledTools: nodeConfig?.tools?.filter(t => t.enabled)?.map(t => ({ type: t.type, name: t.name })),
    enableToolCalling: nodeConfig?.enableToolCalling,
    model: nodeConfig?.model,
    aiConfigId: nodeConfig?.aiConfigId,
  })

  if (importedFiles && importedFiles.length > 0) {
    addLog('info', `注入导入文件: ${importedFiles.length} 个文件`, 'INPUT', { files: importedFiles.map(f => f.name) })
  }

  for (const [nodeName, output] of Object.entries(mockInputs)) {
    const mockOutput: NodeOutput = {
      nodeId: nodeName,
      nodeName: nodeName,
      nodeType: 'MOCK',
      status: 'success',
      data: output,
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    }
    context.nodeOutputs.set(nodeName, mockOutput)
    addLog('info', `注入模拟输入: ${nodeName}`, 'INPUT', output)
  }

  try {
    let processor = getProcessor(node.type)
    addLog('info', `获取处理器: ${node.type}`, 'PROCESSOR', { found: Boolean(processor) })

    // 如果是 PROCESS 节点且启用了工具调用，切换到带工具的处理器
    // 检查两种情况：1) 显式设置了 enableToolCalling  2) 有已启用的工具
    const hasEnabledTools = nodeConfig?.tools?.some(tool => tool.enabled) || false
    const shouldUseToolProcessor = nodeConfig?.enableToolCalling || hasEnabledTools

    addLog('info', '工具调用检查', 'TOOLS', {
      hasEnabledTools,
      enableToolCalling: nodeConfig?.enableToolCalling,
      shouldUseToolProcessor,
    })

    if (node.type === 'PROCESS' && shouldUseToolProcessor) {
      const toolProcessor = getProcessor('PROCESS_WITH_TOOLS')
      if (toolProcessor) {
        processor = toolProcessor
        addLog('info', '检测到工具调用配置，自动切换至支持工具的处理器', 'SYSTEM')
        if (hasEnabledTools) {
          const enabledToolTypes = nodeConfig?.tools?.filter(t => t.enabled).map(t => t.type) || []
          addLog('info', `已启用的工具: ${enabledToolTypes.join(', ')}`, 'TOOLS')
        }
      } else {
        addLog('warning', '无法获取 PROCESS_WITH_TOOLS 处理器', 'SYSTEM')
      }
    }

    if (!processor) {
      addLog('error', `未找到节点处理器: ${node.type}`, 'PROCESSOR')
      return {
        status: 'error',
        output: {},
        error: `未找到节点处理器: ${node.type}`,
        duration: Date.now() - startTime,
        logs,
      }
    }

    addLog('step', `开始执行节点处理器: ${processor.nodeType}`, 'EXECUTE')

    // 使用 Promise.race 添加内部超时保护
    // 注意：多轮工具调用可能需要较长时间，每轮包括 AI 调用 + 工具执行
    const processorTimeout = timeoutMs ?? 240_000 // 默认 240 秒，允许较慢的网关/模型响应
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`处理器执行超时 (${processorTimeout / 1000}秒)`))
      }, processorTimeout)
    })

    const result = await Promise.race([
      processor.process(node, context),
      timeoutPromise,
    ])

    addLog('success', `节点执行完成，状态: ${result.status}`, 'COMPLETE')
    if (result.error) {
      addLog('error', `错误信息: ${result.error}`, 'COMPLETE')
    }

    return {
      status: result.status,
      output: result.data,
      error: result.error,
      duration: Date.now() - startTime,
      tokenUsage: result.tokenUsage,
      logs,
      approvalRequestId: result.approvalRequestId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    addLog('error', `执行异常: ${errorMessage}`, 'ERROR')

    // 添加堆栈信息以便调试
    if (error instanceof Error && error.stack) {
      addLog('error', `错误堆栈: ${error.stack.split('\n').slice(0, 5).join(' -> ')}`, 'ERROR')
    }

    return {
      status: 'error',
      output: {},
      error: errorMessage,
      duration: Date.now() - startTime,
      logs,
    }
  }
}

/**
 * 流式调试节点
 *
 * 与 debugNode 功能相同，但支持通过 onLog 回调实时推送日志
 * Requirements: 2.2
 *
 * @param request 流式调试请求，包含 onLog 回调
 * @returns 调试结果
 */
export async function debugNodeWithStream(request: DebugStreamRequest): Promise<DebugResult> {
  const { workflowId, organizationId, userId, node, mockInputs, config, importedFiles, onLog, timeoutMs } = request
  const startTime = Date.now()
  const logs: string[] = []

  // 早期记录，确保即使出错也能看到基本信息
  logs.push(`[${new Date().toLocaleTimeString()}] 🔹 开始调试节点: ${node.name} (${node.type})`)

  /* Structured logs for detailed debugging */
  const executionLogs: Array<{
    type: 'info' | 'step' | 'success' | 'warning' | 'error'
    message: string
    step?: string
    data?: unknown
    timestamp: Date
  }> = []

  /**
   * 添加日志的函数
   * 同时支持结构化日志、字符串日志和流式回调
   */
  const addLog = (type: 'info' | 'step' | 'success' | 'warning' | 'error', message: string, step?: string, data?: unknown) => {
    const timestamp = new Date()

    // 1. Add to structured logs
    executionLogs.push({
      type,
      message,
      step,
      data,
      timestamp
    })

    // 2. Add to legacy string logs for UI display
    const timeStr = timestamp.toLocaleTimeString('zh-CN', { hour12: false })
    let icon = '🔹'
    if (type === 'step') icon = '⚡'
    if (type === 'success') icon = '✅'
    if (type === 'warning') icon = '⚠️'
    if (type === 'error') icon = '❌'

    let logMsg = `[${timeStr}] ${icon} ${message}`
    if (step) logMsg = `[${timeStr}] ${icon} [${step}] ${message}`

    logs.push(logMsg)

    // Log data if present (formatted)
    if (data) {
      if (typeof data === 'object') {
        try {
          logs.push(`  ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}`)
        } catch {
          logs.push(`  [Data] ${String(data)}`)
        }
      } else {
        logs.push(`  [Data] ${String(data)}`)
      }
    }

    // 3. 调用流式回调，实时推送日志
    if (onLog) {
      onLog({
        level: type,
        message,
        step,
        data,
        timestamp: timestamp.toISOString(),
      })
    }
  }

  const context: ExecutionContext = {
    executionId: `debug-${Date.now()}`,
    workflowId,
    organizationId,
    userId,
    nodeOutputs: new Map(),
    globalVariables: config.globalVariables || {},
    aiConfigs: new Map(),
    logs: executionLogs,
    addLog,
    importedFiles
  }

  addLog('info', `开始调试节点: ${node.name}`, 'INIT', { nodeId: node.id, type: node.type })

  // 检查节点配置
  const nodeConfig = node.config as {
    enableToolCalling?: boolean
    tools?: Array<{ enabled?: boolean; type?: string; name?: string }>
    model?: string
    aiConfigId?: string
  }

  addLog('info', '节点配置检查', 'CONFIG', {
    hasTools: Boolean(nodeConfig?.tools?.length),
    enabledTools: nodeConfig?.tools?.filter(t => t.enabled)?.map(t => ({ type: t.type, name: t.name })),
    enableToolCalling: nodeConfig?.enableToolCalling,
    model: nodeConfig?.model,
    aiConfigId: nodeConfig?.aiConfigId,
  })

  if (importedFiles && importedFiles.length > 0) {
    addLog('info', `注入导入文件: ${importedFiles.length} 个文件`, 'INPUT', { files: importedFiles.map(f => f.name) })
  }

  for (const [nodeName, output] of Object.entries(mockInputs)) {
    const mockOutput: NodeOutput = {
      nodeId: nodeName,
      nodeName: nodeName,
      nodeType: 'MOCK',
      status: 'success',
      data: output,
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    }
    context.nodeOutputs.set(nodeName, mockOutput)
    addLog('info', `注入模拟输入: ${nodeName}`, 'INPUT', output)
  }

  try {
    let processor = getProcessor(node.type)
    addLog('info', `获取处理器: ${node.type}`, 'PROCESSOR', { found: Boolean(processor) })

    // 如果是 PROCESS 节点且启用了工具调用，切换到带工具的处理器
    const hasEnabledTools = nodeConfig?.tools?.some(tool => tool.enabled) || false
    const shouldUseToolProcessor = nodeConfig?.enableToolCalling || hasEnabledTools

    addLog('info', '工具调用检查', 'TOOLS', {
      hasEnabledTools,
      enableToolCalling: nodeConfig?.enableToolCalling,
      shouldUseToolProcessor,
    })

    if (node.type === 'PROCESS' && shouldUseToolProcessor) {
      const toolProcessor = getProcessor('PROCESS_WITH_TOOLS')
      if (toolProcessor) {
        processor = toolProcessor
        addLog('info', '检测到工具调用配置，自动切换至支持工具的处理器', 'SYSTEM')
        if (hasEnabledTools) {
          const enabledToolTypes = nodeConfig?.tools?.filter(t => t.enabled).map(t => t.type) || []
          addLog('info', `已启用的工具: ${enabledToolTypes.join(', ')}`, 'TOOLS')
        }
      } else {
        addLog('warning', '无法获取 PROCESS_WITH_TOOLS 处理器', 'SYSTEM')
      }
    }

    if (!processor) {
      addLog('error', `未找到节点处理器: ${node.type}`, 'PROCESSOR')
      return {
        status: 'error',
        output: {},
        error: `未找到节点处理器: ${node.type}`,
        duration: Date.now() - startTime,
        logs,
      }
    }

    addLog('step', `开始执行节点处理器: ${processor.nodeType}`, 'EXECUTE')

    // 使用 Promise.race 添加内部超时保护
    const processorTimeout = timeoutMs ?? 240_000 // 默认 240 秒，允许较慢的网关/模型响应
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`处理器执行超时 (${processorTimeout / 1000}秒)`))
      }, processorTimeout)
    })

    const result = await Promise.race([
      processor.process(node, context),
      timeoutPromise,
    ])

    addLog('success', `节点执行完成，状态: ${result.status}`, 'COMPLETE')
    if (result.error) {
      addLog('error', `错误信息: ${result.error}`, 'COMPLETE')
    }

    return {
      status: result.status,
      output: result.data,
      error: result.error,
      duration: Date.now() - startTime,
      tokenUsage: result.tokenUsage,
      logs,
      approvalRequestId: result.approvalRequestId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    addLog('error', `执行异常: ${errorMessage}`, 'ERROR')

    // 添加堆栈信息以便调试
    if (error instanceof Error && error.stack) {
      addLog('error', `错误堆栈: ${error.stack.split('\n').slice(0, 5).join(' -> ')}`, 'ERROR')
    }

    return {
      status: 'error',
      output: {},
      error: errorMessage,
      duration: Date.now() - startTime,
      logs,
    }
  }
}

export function createMockContext(
  workflowId: string,
  organizationId: string,
  userId: string,
  mockInputs: Record<string, Record<string, unknown>> = {},
  globalVariables: Record<string, unknown> = {}
): ExecutionContext {
  const context: ExecutionContext = {
    executionId: `mock-${Date.now()}`,
    workflowId,
    organizationId,
    userId,
    nodeOutputs: new Map(),
    globalVariables,
    aiConfigs: new Map(),
  }

  for (const [nodeName, output] of Object.entries(mockInputs)) {
    const mockOutput: NodeOutput = {
      nodeId: nodeName,
      nodeName: nodeName,
      nodeType: 'MOCK',
      status: 'success',
      data: output,
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    }
    context.nodeOutputs.set(nodeName, mockOutput)
  }

  return context
}
