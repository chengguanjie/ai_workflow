// AI 服务管理器

import type { AIProvider, AIProviderType, ChatRequest, ChatResponse, Model, TranscriptionOptions, TranscriptionResponse } from './types'
import { shensuanProvider } from './providers/shensuan'
import { openRouterProvider } from './providers/openrouter'
import { openAIProvider } from './providers/openai'
import { anthropicProvider } from './providers/anthropic'

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
