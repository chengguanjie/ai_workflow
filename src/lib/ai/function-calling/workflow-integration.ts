/**
 * 工作流集成模块
 * 
 * 将 Function Calling 功能集成到工作流执行中
 */

import type { NodeOutput, ExecutionContext } from '@/lib/workflow/types'
import type { ToolCall, ToolCallResult, ToolExecutionContext, OpenAITool } from './types'
import { functionCallingService, toolRegistry } from './index'
import { toOpenAIFormat } from './converter'

/**
 * 工作流工具调用上下文
 */
export function createToolContext(
  executionContext: ExecutionContext
): ToolExecutionContext {
  return {
    executionId: executionContext.executionId,
    workflowId: executionContext.workflowId,
    organizationId: executionContext.organizationId,
    userId: executionContext.userId,
    testMode: false,
    variables: executionContext.globalVariables,
  }
}

/**
 * 为工作流节点准备工具列表
 */
export function prepareToolsForNode(
  enabledTools?: string[]
): OpenAITool[] {
  const definitions = enabledTools && enabledTools.length > 0
    ? enabledTools
        .map(name => toolRegistry.get(name)?.getDefinition())
        .filter((d): d is NonNullable<typeof d> => d !== undefined)
    : toolRegistry.getAllDefinitions()

  return definitions.map(toOpenAIFormat)
}

/**
 * 处理 AI 返回的工具调用
 */
export async function handleToolCalls(
  toolCalls: ToolCall[],
  context: ToolExecutionContext
): Promise<{
  results: ToolCallResult[]
  allSuccessful: boolean
  errors: string[]
}> {
  const results = await functionCallingService.executeToolCalls(toolCalls, context)
  
  const errors: string[] = []
  for (const result of results) {
    if (!result.success && result.error) {
      errors.push(`${result.toolName}: ${result.error}`)
    }
  }

  return {
    results,
    allSuccessful: errors.length === 0,
    errors,
  }
}

/**
 * 构建工具调用结果的节点输出
 */
export function buildToolCallsOutput(
  nodeId: string,
  nodeName: string,
  toolCalls: ToolCall[],
  results: ToolCallResult[],
  startedAt: Date
): NodeOutput {
  const completedAt = new Date()
  const hasErrors = results.some(r => !r.success)

  return {
    nodeId,
    nodeName,
    nodeType: 'PROCESS',
    status: hasErrors ? 'error' : 'success',
    data: {
      toolCalls: toolCalls.map((tc, i) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
        result: results[i]?.result,
        success: results[i]?.success,
        error: results[i]?.error,
        duration: results[i]?.duration,
      })),
    },
    error: hasErrors
      ? results.filter(r => !r.success).map(r => `${r.toolName}: ${r.error}`).join('; ')
      : undefined,
    startedAt,
    completedAt,
    duration: completedAt.getTime() - startedAt.getTime(),
  }
}

/**
 * 格式化工具调用结果为消息内容
 */
export function formatToolResultsForMessage(results: ToolCallResult[]): string {
  return results.map(r => {
    if (r.success) {
      return `[${r.toolName}] 成功: ${JSON.stringify(r.result)}`
    } else {
      return `[${r.toolName}] 失败: ${r.error}`
    }
  }).join('\n')
}

/**
 * 检查响应是否包含工具调用
 */
export function hasToolCalls(response: { toolCalls?: ToolCall[] }): boolean {
  return response.toolCalls !== undefined && response.toolCalls.length > 0
}

/**
 * 工具调用统计
 */
export interface ToolCallStats {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  totalDuration: number
  toolUsage: Record<string, number>
}

/**
 * 计算工具调用统计
 */
export function calculateToolCallStats(results: ToolCallResult[]): ToolCallStats {
  const stats: ToolCallStats = {
    totalCalls: results.length,
    successfulCalls: 0,
    failedCalls: 0,
    totalDuration: 0,
    toolUsage: {},
  }

  for (const result of results) {
    if (result.success) {
      stats.successfulCalls++
    } else {
      stats.failedCalls++
    }
    stats.totalDuration += result.duration || 0
    stats.toolUsage[result.toolName] = (stats.toolUsage[result.toolName] || 0) + 1
  }

  return stats
}
