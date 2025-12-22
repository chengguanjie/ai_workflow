// Anthropic (Claude) API Provider

import type { AIProvider, ChatRequest, ChatResponse, Model } from '../types'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'

export class AnthropicProvider implements AIProvider {
  name = 'anthropic'

  async chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse> {
    const url = baseUrl || DEFAULT_ANTHROPIC_BASE_URL

    // 提取 system message
    const systemMessage = request.messages.find(m => m.role === 'system')
    const otherMessages = request.messages.filter(m => m.role !== 'system')

    const response = await fetchWithTimeout(`${url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: request.model,
        messages: otherMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        system: systemMessage?.content,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
      }),
      timeoutMs: 90_000,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()

    // Anthropic 返回的是 content 数组
    const content = data.content
      ?.filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('') || ''

    return {
      content,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      finishReason: data.stop_reason || 'stop',
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
