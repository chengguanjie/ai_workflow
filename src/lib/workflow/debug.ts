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
}

export interface DebugResult {
  status: 'success' | 'error' | 'skipped'
  output: Record<string, unknown>
  error?: string
  duration: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  logs?: string[]
}

export async function debugNode(request: DebugRequest): Promise<DebugResult> {
  const { workflowId, organizationId, userId, node, mockInputs, config } = request
  const startTime = Date.now()
  const logs: string[] = []

  logs.push(`[DEBUG] 开始调试节点: ${node.name} (${node.id})`)
  logs.push(`[DEBUG] 节点类型: ${node.type}`)

  const context: ExecutionContext = {
    executionId: `debug-${Date.now()}`,
    workflowId,
    organizationId,
    userId,
    nodeOutputs: new Map(),
    globalVariables: config.globalVariables || {},
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
    logs.push(`[DEBUG] 注入模拟输入: ${nodeName} = ${JSON.stringify(output).slice(0, 100)}...`)
  }

  try {
    const processor = getProcessor(node.type)

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
