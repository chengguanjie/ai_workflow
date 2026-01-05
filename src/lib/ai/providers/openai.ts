// OpenAI API Provider with Function Calling Support

import type { AIProvider, ChatRequest, ChatResponse, Model } from '../types'
import type { OpenAITool, ToolCall, ChatResponseWithTools } from '../function-calling/types'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

/**
 * 扩展的聊天请求（支持工具）
 */
export interface OpenAIChatRequest extends ChatRequest {
  tools?: OpenAITool[]
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
}

export class OpenAIProvider implements AIProvider {
  name = 'openai'

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
    const response = await this.chatWithTools(request as OpenAIChatRequest, apiKey, baseUrl)
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
    request: OpenAIChatRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ChatResponseWithTools> {
    const url = baseUrl || DEFAULT_OPENAI_BASE_URL
    
    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: false,
    }

    // Claude thinking 模型需要额外的 thinking 配置
    if (this.isThinkingModel(request.model)) {
      const budgetTokens = Math.min((request.maxTokens || 8000) * 2, 16000)
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens
      }
      console.log('[OpenAI Provider] 检测到 thinking 模型，添加 thinking 配置:', {
        model: request.model,
        budget_tokens: budgetTokens
      })
    }

    // 添加工具配置
    if (request.tools && request.tools.length > 0) {
      requestBody.tools = request.tools
      
      // 优化 tool_choice 处理：当 required 且只有一个工具时，使用具体工具名
      if (request.tool_choice === 'required' && request.tools.length === 1) {
        requestBody.tool_choice = {
          type: 'function',
          function: { name: request.tools[0].function.name }
        }
      } else {
        requestBody.tool_choice = request.tool_choice || 'auto'
      }
    }

    const response = await fetchWithTimeout(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      timeoutMs: 90_000,
      retries: 2,
      retryDelay: 2000,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]

    // 调试日志：查看原始响应结构
    console.log('[OpenAI Provider] 原始响应:', JSON.stringify({
      finish_reason: choice?.finish_reason,
      has_tool_calls: !!choice?.message?.tool_calls,
      tool_calls_count: choice?.message?.tool_calls?.length,
      has_function_call: !!choice?.message?.function_call,
      content_preview: choice?.message?.content?.slice(0, 100),
    }))

    // 解析工具调用 - 支持多种格式
    let toolCalls: ToolCall[] | undefined
    const message = choice?.message

    // 标准 OpenAI 格式：tool_calls 数组
    if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc: {
        id: string
        type: string
        function: { name: string; arguments: string }
      }) => ({
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }))
    }
    // 旧格式：function_call 对象（某些代理可能使用）
    else if (message?.function_call && message.function_call.name) {
      toolCalls = [{
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'function' as const,
        function: {
          name: message.function_call.name,
          arguments: message.function_call.arguments || '{}',
        }
      }]
    }

    return {
      content: choice?.message?.content || '',
      toolCalls,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      finishReason: choice?.finish_reason === 'tool_calls' ? 'tool_calls' : 
                    choice?.finish_reason === 'function_call' ? 'tool_calls' :
                    choice?.finish_reason === 'length' ? 'length' :
                    choice?.finish_reason === 'content_filter' ? 'content_filter' : 'stop',
      model: data.model,
    }
  }

  async listModels(apiKey: string, baseUrl?: string): Promise<Model[]> {
    const url = baseUrl || DEFAULT_OPENAI_BASE_URL
    const response = await fetchWithTimeout(`${url}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeoutMs: 30_000,
      retries: 2,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const data = await response.json()

    // 只返回 chat 模型
    const chatModels = data.data
      .filter((model: { id: string }) =>
        model.id.includes('gpt') || model.id.includes('o1')
      )
      .map((model: { id: string }) => ({
        id: model.id,
        name: model.id,
        provider: 'openai',
      }))

    return chatModels
  }
}

export const openAIProvider = new OpenAIProvider()
