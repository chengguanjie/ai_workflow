// Anthropic (Claude) API Provider with Function Calling Support

import type { AIProvider, ChatRequest, ChatResponse, Model } from '../types'
import type { ClaudeTool, ToolCall, ChatResponseWithTools, ClaudeToolUse } from '../function-calling/types'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * 扩展的聊天请求（支持工具）
 */
export interface AnthropicChatRequest extends ChatRequest {
  tools?: ClaudeTool[]
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string }
}

export class AnthropicProvider implements AIProvider {
  name = 'anthropic'

  /**
   * 检测是否为 thinking 模型（需要 extended thinking 配置）
   */
  private isThinkingModel(model: string): boolean {
    const lower = model.toLowerCase()
    // Claude thinking 模型使用 :thinking 后缀
    if (lower.includes(':thinking')) return true
    // DeepSeek thinking 模型使用 -think 后缀或 reasoner 关键字
    if (lower.includes('deepseek') && (lower.includes('-think') || lower.includes('reasoner'))) return true
    return false
  }

  async chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse> {
    const response = await this.chatWithTools(request as AnthropicChatRequest, apiKey, baseUrl)
    return {
      content: response.content,
      usage: response.usage,
      finishReason: response.finishReason,
      model: response.model,
    }
  }

  /**
   * 带工具支持的聊天
   */
  async chatWithTools(
    request: AnthropicChatRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ChatResponseWithTools> {
    const url = baseUrl || DEFAULT_ANTHROPIC_BASE_URL

    // 提取 system message
    const systemMessage = request.messages.find(m => m.role === 'system')
    const otherMessages = request.messages.filter(m => m.role !== 'system')

    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages: otherMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      system: systemMessage?.content,
      // Anthropic API 要求 max_tokens 参数，使用较高的默认值
      max_tokens: request.maxTokens || 8192,
      temperature: request.temperature ?? 0.7,
    }

    // Claude thinking 模型需要额外的 thinking 配置
    if (this.isThinkingModel(request.model)) {
      const budgetTokens = Math.min((request.maxTokens || 8000) * 2, 16000)
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens
      }
      console.log('[Anthropic] 检测到 thinking 模型，添加 thinking 配置:', {
        model: request.model,
        budget_tokens: budgetTokens
      })
    }

    // 添加工具配置
    if (request.tools && request.tools.length > 0) {
      requestBody.tools = request.tools
      if (request.tool_choice) {
        requestBody.tool_choice = request.tool_choice
      }
    }

    console.log('[Anthropic] 发送请求:', {
      url: `${url}/v1/messages`,
      model: request.model,
      toolCount: request.tools?.length || 0,
      messageCount: otherMessages.length,
    })

    const startTime = Date.now()
    const response = await fetchWithTimeout(`${url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(requestBody),
      timeoutMs: 120_000,
      retries: 2,
      retryDelay: 2000,
    })

    console.log(`[Anthropic] 收到响应: ${response.status}, 耗时 ${Date.now() - startTime}ms`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('[Anthropic] API 错误:', { status: response.status, error })
      throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()

    // 解析内容和工具调用
    let textContent = ''
    const toolCalls: ToolCall[] = []

    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text
        } else if (block.type === 'tool_use') {
          const toolUse = block as ClaudeToolUse
          toolCalls.push({
            id: toolUse.id,
            type: 'function',
            function: {
              name: toolUse.name,
              arguments: JSON.stringify(toolUse.input),
            },
          })
        }
      }
    }

    // 确定结束原因
    let finishReason: ChatResponseWithTools['finishReason'] = 'stop'
    if (data.stop_reason === 'tool_use' || toolCalls.length > 0) {
      finishReason = 'tool_calls'
    } else if (data.stop_reason === 'max_tokens') {
      finishReason = 'length'
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      finishReason,
      model: data.model,
    }
  }

  async listModels(): Promise<Model[]> {
    // Anthropic 没有 list models API，返回已知模型
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
    ]
  }
}

export const anthropicProvider = new AnthropicProvider()
