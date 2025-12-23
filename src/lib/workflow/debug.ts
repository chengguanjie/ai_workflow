/**
 * 节点调试模块
 * 
 * 支持单节点独立运行，用于开发和调试工作流
 */

import type { NodeConfig, WorkflowConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from './types'
import { getProcessor } from './processors'

export interface DebugRequest {
  workflowId: string
  organizationId: string
  userId: string
  node: NodeConfig
  mockInputs: Record<string, Record<string, unknown>>
  config: WorkflowConfig
  importedFiles?: Array<{ name: string; content: string; type: string }>
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
  const { workflowId, organizationId, userId, node, mockInputs, config, importedFiles } = request
  const startTime = Date.now()
  const logs: string[] = []

  /* Structured logs for detailed debugging */
  const executionLogs: any[] = []

  const addLog = (type: 'info' | 'step' | 'success' | 'warning' | 'error', message: string, step?: string, data?: unknown) => {
    // 1. Add to structured logs
    executionLogs.push({
      type,
      message,
      step,
      data,
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
    if (data) {
      if (typeof data === 'object') {
        try {
          logs.push(`  ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}`)
        } catch (e) {
          logs.push(`  [Data] ${String(data)}`)
        }
      } else {
        logs.push(`  [Data] ${String(data)}`)
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

    // 如果是 PROCESS 节点且启用了工具调用，切换到带工具的处理器
    if (node.type === 'PROCESS' && (node.config as any)?.enableToolCalling) {
      const toolProcessor = getProcessor('PROCESS_WITH_TOOLS')
      if (toolProcessor) {
        processor = toolProcessor
        addLog?.('info', '检测到工具调用配置，自动切换至支持工具的处理器', 'SYSTEM')
      }
    }

    if (!processor) {
      logs.push(`[DEBUG] 错误: 未找到节点处理器 ${node.type}`)
      return {
        status: 'error',
        output: {},
        error: `未找到节点处理器: ${node.type}`,
        duration: Date.now() - startTime,
        logs,
      }
    }

    logs.push(`[DEBUG] 执行节点处理器...`)
    const result = await processor.process(node, context)

    logs.push(`[DEBUG] 节点执行完成，状态: ${result.status}`)
    if (result.error) {
      logs.push(`[DEBUG] 错误信息: ${result.error}`)
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
    logs.push(`[DEBUG] 执行异常: ${errorMessage}`)

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
