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

    // 添加工具配置
    if (request.tools && request.tools.length > 0) {
      requestBody.tools = request.tools
      requestBody.tool_choice = request.tool_choice || 'auto'
    }

    const response = await fetchWithTimeout(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      timeoutMs: 90_000,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]

    // 解析工具调用
    let toolCalls: ToolCall[] | undefined
    if (choice?.message?.tool_calls) {
      toolCalls = choice.message.tool_calls.map((tc: {
        id: string
        type: string
        function: { name: string; arguments: string }
      }) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }))
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
