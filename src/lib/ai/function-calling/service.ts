/**
 * AI Function Calling 服务
 * 
 * 处理 AI 返回的工具调用请求，执行工具，并将结果返回给 AI
 */

import type {
  ToolDefinition,
  ToolCall,
  ToolCallResult,
  ToolExecutionContext,
  ChatRequestWithTools,
  ChatResponseWithTools,
  OpenAITool,
  ClaudeTool,
  ClaudeToolUse,
} from './types'
import { convertTools, getProviderFormat } from './converter'
import { toolRegistry } from './executors'

/**
 * Function Calling 服务配置
 */
export interface FunctionCallingServiceConfig {
  /** 最大工具调用轮次 */
  maxToolCallRounds?: number
  /** 是否启用调试日志 */
  debug?: boolean
  /** 工具调用超时（毫秒） */
  toolCallTimeout?: number
}

const DEFAULT_CONFIG: Required<FunctionCallingServiceConfig> = {
  maxToolCallRounds: 10,
  debug: false,
  toolCallTimeout: 60000,
}

/**
 * Function Calling 服务
 */
export class FunctionCallingService {
  private config: Required<FunctionCallingServiceConfig>

  constructor(config?: FunctionCallingServiceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 获取可用工具的定义（转换为指定提供商格式）
   */
  getToolsForProvider(
    provider: string,
    toolNames?: string[]
  ): OpenAITool[] | ClaudeTool[] {
    const format = getProviderFormat(provider)
    let definitions: ToolDefinition[]

    if (toolNames && toolNames.length > 0) {
      // 只返回指定的工具
      definitions = toolNames
        .map(name => toolRegistry.get(name)?.getDefinition())
        .filter((d): d is ToolDefinition => d !== undefined)
    } else {
      // 返回所有已注册的工具
      definitions = toolRegistry.getAllDefinitions()
    }

    return convertTools(definitions, format) as OpenAITool[] | ClaudeTool[]
  }

  /**
   * 解析 AI 响应中的工具调用
   */
  parseToolCalls(
    response: unknown,
    provider: string
  ): ToolCall[] {
    const format = getProviderFormat(provider)

    if (format === 'claude') {
      return this.parseClaudeToolCalls(response)
    }

    return this.parseOpenAIToolCalls(response)
  }

  /**
   * 解析 OpenAI 格式的工具调用
   */
  private parseOpenAIToolCalls(response: unknown): ToolCall[] {
    const data = response as {
      choices?: Array<{
        message?: {
          tool_calls?: ToolCall[]
        }
      }>
    }

    const toolCalls = data?.choices?.[0]?.message?.tool_calls
    if (!toolCalls || !Array.isArray(toolCalls)) {
      return []
    }

    return toolCalls.filter(tc => tc.type === 'function')
  }

  /**
   * 解析 Claude 格式的工具调用
   */
  private parseClaudeToolCalls(response: unknown): ToolCall[] {
    const data = response as {
      content?: Array<ClaudeToolUse | { type: string }>
    }

    if (!data?.content || !Array.isArray(data.content)) {
      return []
    }

    return data.content
      .filter((c): c is ClaudeToolUse => c.type === 'tool_use')
      .map(toolUse => ({
        id: toolUse.id,
        type: 'function' as const,
        function: {
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input),
        },
      }))
  }

  /**
   * 执行单个工具调用
   */
  async executeToolCall(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    const { name, arguments: argsString } = toolCall.function

    if (this.config.debug) {
      console.log(`[FunctionCalling] 执行工具: ${name}`, argsString)
    }

    // 解析参数
    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsString)
    } catch {
      return {
        toolCallId: toolCall.id,
        toolName: name,
        success: false,
        error: `无效的工具参数 JSON: ${argsString}`,
      }
    }

    // 执行工具
    const result = await toolRegistry.execute(name, args, context)
    result.toolCallId = toolCall.id

    if (this.config.debug) {
      console.log(`[FunctionCalling] 工具执行结果:`, result)
    }

    return result
  }

  /**
   * 批量执行工具调用
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolCallResult[]> {
    const results = await Promise.all(
      toolCalls.map(tc => this.executeToolCall(tc, context))
    )
    return results
  }

  /**
   * 构建工具调用结果消息（OpenAI 格式）
   */
  buildToolResultMessages(
    toolCalls: ToolCall[],
    results: ToolCallResult[]
  ): Array<{ role: 'tool'; tool_call_id: string; content: string }> {
    return results.map((result, index) => ({
      role: 'tool' as const,
      tool_call_id: toolCalls[index].id,
      content: JSON.stringify({
        success: result.success,
        result: result.result,
        error: result.error,
      }),
    }))
  }

  /**
   * 构建工具调用结果消息（Claude 格式）
   */
  buildClaudeToolResultMessages(
    results: ToolCallResult[]
  ): Array<{
    type: 'tool_result'
    tool_use_id: string
    content: string
    is_error?: boolean
  }> {
    return results.map(result => ({
      type: 'tool_result' as const,
      tool_use_id: result.toolCallId,
      content: result.success
        ? JSON.stringify(result.result)
        : `Error: ${result.error}`,
      is_error: !result.success,
    }))
  }

  /**
   * 判断响应是否需要工具调用
   */
  requiresToolCall(response: ChatResponseWithTools): boolean {
    return (
      response.finishReason === 'tool_calls' ||
      (response.toolCalls !== undefined && response.toolCalls.length > 0)
    )
  }

  /**
   * 执行完整的 Function Calling 循环
   * 
   * 自动处理工具调用、执行工具、将结果返回给 AI，直到 AI 生成最终响应
   */
  async runWithTools<TRequest extends ChatRequestWithTools>(
    chatFn: (request: TRequest) => Promise<ChatResponseWithTools>,
    initialRequest: TRequest,
    context: ToolExecutionContext,
    provider: string
  ): Promise<{
    response: ChatResponseWithTools
    toolCalls: Array<{ call: ToolCall; result: ToolCallResult }>
    rounds: number
  }> {
    let currentRequest = { ...initialRequest }
    const allToolCalls: Array<{ call: ToolCall; result: ToolCallResult }> = []
    let rounds = 0

    while (rounds < this.config.maxToolCallRounds) {
      rounds++

      if (this.config.debug) {
        console.log(`[FunctionCalling] 第 ${rounds} 轮对话`)
      }

      const response = await chatFn(currentRequest)

      // 如果没有工具调用，返回最终响应
      if (!this.requiresToolCall(response)) {
        return { response, toolCalls: allToolCalls, rounds }
      }

      // 解析并执行工具调用
      const toolCalls = response.toolCalls || []
      const results = await this.executeToolCalls(toolCalls, context)

      // 记录工具调用
      for (let i = 0; i < toolCalls.length; i++) {
        allToolCalls.push({ call: toolCalls[i], result: results[i] })
      }

      // 构建新的请求，包含工具调用结果
      const format = getProviderFormat(provider)

      if (format === 'claude') {
        // Claude 格式：将工具调用和结果作为 content 数组
        currentRequest = {
          ...currentRequest,
          messages: [
            ...currentRequest.messages,
            {
              role: 'assistant',
              content: response.content || '',
              tool_calls: toolCalls,
            },
            {
              role: 'user',
              content: this.buildClaudeToolResultMessages(results),
            },
          ],
        } as TRequest
      } else {
        // OpenAI 格式
        currentRequest = {
          ...currentRequest,
          messages: [
            ...currentRequest.messages,
            {
              role: 'assistant',
              content: response.content || '',
              tool_calls: toolCalls,
            },
            ...this.buildToolResultMessages(toolCalls, results),
          ],
        } as TRequest
      }
    }

    throw new Error(`工具调用轮次超过限制 (${this.config.maxToolCallRounds})`)
  }

  /**
   * 注册自定义工具
   */
  registerTool(executor: {
    name: string
    description: string
    category: string
    execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolCallResult>
    getDefinition: () => ToolDefinition
  }): void {
    toolRegistry.register(executor)
  }

  /**
   * 获取已注册的工具列表
   */
  getRegisteredTools(): string[] {
    return toolRegistry.getRegisteredTools()
  }

  /**
   * 获取所有工具定义
   */
  getAllToolDefinitions(): ToolDefinition[] {
    return toolRegistry.getAllDefinitions()
  }
}

// 默认服务实例
export const functionCallingService = new FunctionCallingService()
