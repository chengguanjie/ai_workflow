// OpenAI API Provider

import type { AIProvider, ChatRequest, ChatResponse, Model } from '../types'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export class OpenAIProvider implements AIProvider {
  name = 'openai'

  async chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse> {
    const url = baseUrl || DEFAULT_OPENAI_BASE_URL
    const response = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: false,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()

    return {
      content: data.choices[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      finishReason: data.choices[0]?.finish_reason || 'stop',
      model: data.model,
    }
  }

  async listModels(apiKey: string, baseUrl?: string): Promise<Model[]> {
    const url = baseUrl || DEFAULT_OPENAI_BASE_URL
    const response = await fetch(`${url}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
