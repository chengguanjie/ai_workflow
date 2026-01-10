// OpenRouter API Provider

import type { AIProvider, ChatRequest, ChatResponse, Model } from '../types'
import { fetchTextWithTimeout } from '@/lib/http/fetch-with-timeout'

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter'

  async chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse> {
    const url = baseUrl || DEFAULT_OPENROUTER_BASE_URL
    
    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      stream: false,
    }
    
    // 只有明确指定了 maxTokens 才传递给 API
    if (request.maxTokens) {
      requestBody.max_tokens = request.maxTokens
    }
    
    const { response, text } = await fetchTextWithTimeout(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': 'AI Workflow',
        // Some OpenAI-compatible gateways are flaky with connection pooling.
        // Close keep-alive to reduce `other side closed` errors.
        Connection: 'close',
      },
      body: JSON.stringify(requestBody),
      timeoutMs: 180_000,
      retries: 5,
      retryDelay: 2000,
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} - ${text}`)
    }

    const data = JSON.parse(text) as any

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
    const url = baseUrl || DEFAULT_OPENROUTER_BASE_URL
    const { response, text } = await fetchTextWithTimeout(`${url}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeoutMs: 30_000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const data = JSON.parse(text) as any

    return data.data.map((model: { id: string; name?: string; context_length?: number; pricing?: { prompt: string; completion: string } }) => ({
      id: model.id,
      name: model.name || model.id,
      provider: 'openrouter',
      contextLength: model.context_length,
      pricing: model.pricing
        ? {
            prompt: parseFloat(model.pricing.prompt),
            completion: parseFloat(model.pricing.completion),
          }
        : undefined,
    }))
  }
}

export const openRouterProvider = new OpenRouterProvider()
