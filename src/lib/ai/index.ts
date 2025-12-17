// AI 服务管理器

import type { AIProvider, AIProviderType, ChatRequest, ChatResponse, Model } from './types'
import { shensuanProvider } from './providers/shensuan'
import { openRouterProvider } from './providers/openrouter'

export * from './types'

class AIService {
  private providers: Map<AIProviderType, AIProvider> = new Map()

  constructor() {
    this.providers.set('SHENSUAN', shensuanProvider)
    this.providers.set('OPENROUTER', openRouterProvider)
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
    apiKey: string
  ): Promise<ChatResponse> {
    const provider = this.getProvider(providerType)
    return provider.chat(request, apiKey)
  }

  async listModels(
    providerType: AIProviderType,
    apiKey: string
  ): Promise<Model[]> {
    const provider = this.getProvider(providerType)
    if (!provider.listModels) {
      return []
    }
    return provider.listModels(apiKey)
  }
}

export const aiService = new AIService()
