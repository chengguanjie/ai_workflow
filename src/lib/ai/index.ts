// AI 服务管理器

import type { AIProvider, AIProviderType, ChatRequest, ChatResponse, Model, TranscriptionOptions, TranscriptionResponse } from './types'
import { shensuanProvider } from './providers/shensuan'
import { openRouterProvider } from './providers/openrouter'
import { openAIProvider } from './providers/openai'
import { anthropicProvider } from './providers/anthropic'
import { validateContextSize, estimateTokenCount, getModelContextLimit } from './token-utils'

export * from './types'

class AIService {
  private providers: Map<AIProviderType, AIProvider> = new Map()

  constructor() {
    this.providers.set('SHENSUAN', shensuanProvider)
    this.providers.set('OPENROUTER', openRouterProvider)
    this.providers.set('OPENAI', openAIProvider)
    this.providers.set('ANTHROPIC', anthropicProvider)
  }

  getProvider(type: AIProviderType): AIProvider {
    const provider = this.providers.get(type)
    if (!provider) {
      throw new Error(`Unknown AI provider: ${type}`)
    }
    return provider
  }

  async chat(
    providerType: AIProviderType,
    request: ChatRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ChatResponse> {
    // 验证上下文大小
    const model = request.model
    const maxResponseTokens = request.maxTokens || 2000

    // 计算输入的总token数
    let totalInputTokens = 0

    // 处理消息内容
    for (const message of request.messages || []) {
      if (typeof message.content === 'string') {
        totalInputTokens += estimateTokenCount(message.content)
      } else if (Array.isArray(message.content)) {
        // 处理多模态消息
        for (const part of message.content) {
          if (part.type === 'text') {
            totalInputTokens += estimateTokenCount(part.text)
          }
          // 图片通常占用约85 tokens
          if (part.type === 'image_url') {
            totalInputTokens += 85
          }
        }
      }
    }

    // 验证是否超出模型限制
    validateContextSize(
      '', // validateContextSize expects text, we already calculated tokens. Pass empty string to avoid re-calculating.
      model,
      maxResponseTokens
    )

    const contextLimit = getModelContextLimit(model)
    const totalTokensNeeded = totalInputTokens + maxResponseTokens

    if (totalTokensNeeded > contextLimit) {
      const error = new Error(
        `Context limit exceeded: ${totalInputTokens} (input) + ${maxResponseTokens} (max output) = ${totalTokensNeeded} > ${contextLimit} (model limit for ${model})`
      )
      const extendedError = error as unknown as Record<string, unknown>
      extendedError.code = 'CONTEXT_LIMIT_EXCEEDED'
      extendedError.inputTokens = totalInputTokens
      extendedError.maxResponseTokens = maxResponseTokens
      extendedError.totalTokensNeeded = totalTokensNeeded
      extendedError.contextLimit = contextLimit
      throw error
    }

    // 记录token使用情况
    console.log(`[AI Service] Model: ${model}, Input tokens: ${totalInputTokens}, Max response: ${maxResponseTokens}, Total: ${totalTokensNeeded}/${contextLimit}`)

    const provider = this.getProvider(providerType)
    return provider.chat(request, apiKey, baseUrl)
  }

  async listModels(
    providerType: AIProviderType,
    apiKey: string,
    baseUrl?: string
  ): Promise<Model[]> {
    const provider = this.getProvider(providerType)
    if (!provider.listModels) {
      return []
    }
    return provider.listModels(apiKey, baseUrl)
  }

  async transcribeAudio(
    providerType: AIProviderType,
    audioData: ArrayBuffer,
    options: TranscriptionOptions,
    apiKey: string,
    baseUrl?: string
  ): Promise<TranscriptionResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.transcribeAudio) {
      throw new Error(`Provider ${providerType} does not support audio transcription`)
    }
    return provider.transcribeAudio(audioData, options, apiKey, baseUrl)
  }

  async transcribeAudioFromUrl(
    providerType: AIProviderType,
    audioUrl: string,
    options: TranscriptionOptions,
    apiKey: string,
    baseUrl?: string
  ): Promise<TranscriptionResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.transcribeAudioFromUrl) {
      throw new Error(`Provider ${providerType} does not support audio transcription from URL`)
    }
    return provider.transcribeAudioFromUrl(audioUrl, options, apiKey, baseUrl)
  }

  supportsTranscription(providerType: AIProviderType): boolean {
    const provider = this.providers.get(providerType)
    return !!(provider?.transcribeAudio || provider?.transcribeAudioFromUrl)
  }

  getSupportedProviders(): AIProviderType[] {
    return Array.from(this.providers.keys())
  }

  getTranscriptionProviders(): AIProviderType[] {
    return Array.from(this.providers.entries())
      .filter(([, provider]) => !!provider.transcribeAudio)
      .map(([type]) => type)
  }
}

export const aiService = new AIService()
