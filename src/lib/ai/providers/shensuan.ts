// 胜算云 API Provider (OpenAI 兼容)

import type { AIProvider, ChatRequest, ChatResponse, Model } from '../types'

const SHENSUAN_BASE_URL = process.env.SHENSUAN_BASE_URL || 'https://api.siliconflow.cn/v1'

export class ShensuanProvider implements AIProvider {
  name = 'shensuan'

  async chat(request: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const response = await fetch(`${SHENSUAN_BASE_URL}/chat/completions`, {
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
      const error = await response.text()
      throw new Error(`Shensuan API error: ${response.status} - ${error}`)
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

  async listModels(apiKey: string): Promise<Model[]> {
    const response = await fetch(`${SHENSUAN_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const data = await response.json()

    return data.data.map((model: { id: string }) => ({
      id: model.id,
      name: model.id,
      provider: 'shensuan',
    }))
  }
}

export const shensuanProvider = new ShensuanProvider()
