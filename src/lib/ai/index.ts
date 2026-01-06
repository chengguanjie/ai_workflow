// AI 服务管理器

import type {
  AIProvider,
  AIProviderType,
  ChatRequest,
  ChatResponse,
  Model,
  TranscriptionOptions,
  TranscriptionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  TTSRequest,
  TTSResponse,
  EmbeddingRequest,
  EmbeddingResponse
} from './types'
import { shensuanProvider } from './providers/shensuan'
import { openRouterProvider } from './providers/openrouter'
import { openAIProvider } from './providers/openai'
import { anthropicProvider } from './providers/anthropic'
import { validateContextSize, estimateTokenCount, getModelContextLimit } from './token-utils'

export * from './types'

// 导出 Function Calling 模块
export * from './function-calling'

// 导出上下文构建器
export * from './context-builder'

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
    // 如果未指定 maxTokens，使用模型上下文限制的一半作为预估（让模型自行决定输出长度）
    const contextLimit = getModelContextLimit(model)
    const maxResponseTokens = request.maxTokens || Math.min(contextLimit / 2, 16384)

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

  // ========================================
  // 多模态生成方法
  // ========================================

  /**
   * 图片生成
   */
  async generateImage(
    providerType: AIProviderType,
    request: ImageGenerationRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ImageGenerationResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.generateImage) {
      throw new Error(`Provider ${providerType} does not support image generation`)
    }
    console.log(`[AI Service] Image generation: model=${request.model}, prompt=${request.prompt.substring(0, 50)}...`)
    return provider.generateImage(request, apiKey, baseUrl)
  }

  /**
   * 视频生成（提交任务）
   */
  async generateVideo(
    providerType: AIProviderType,
    request: VideoGenerationRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<VideoGenerationResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.generateVideo) {
      throw new Error(`Provider ${providerType} does not support video generation`)
    }
    console.log(`[AI Service] Video generation: model=${request.model}, prompt=${request.prompt.substring(0, 50)}...`)
    return provider.generateVideo(request, apiKey, baseUrl)
  }

  /**
   * 查询视频生成任务状态
   */
  async getVideoTaskStatus(
    providerType: AIProviderType,
    taskId: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<VideoGenerationResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.getVideoTaskStatus) {
      throw new Error(`Provider ${providerType} does not support video task status query`)
    }
    return provider.getVideoTaskStatus(taskId, apiKey, baseUrl)
  }

  /**
   * 等待视频生成完成
   */
  async waitForVideoCompletion(
    providerType: AIProviderType,
    taskId: string,
    apiKey: string,
    baseUrl?: string,
    options?: {
      maxWaitTime?: number  // 最大等待时间（毫秒），默认 5 分钟
      pollInterval?: number  // 轮询间隔（毫秒），默认 3 秒
    }
  ): Promise<VideoGenerationResponse> {
    const maxWaitTime = options?.maxWaitTime || 5 * 60 * 1000
    const pollInterval = options?.pollInterval || 3000
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getVideoTaskStatus(providerType, taskId, apiKey, baseUrl)

      if (status.status === 'completed') {
        return status
      }

      if (status.status === 'failed') {
        throw new Error(`视频生成失败: ${status.error || '未知错误'}`)
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`视频生成超时：已等待 ${maxWaitTime / 1000} 秒`)
  }

  /**
   * 文本转语音
   */
  async textToSpeech(
    providerType: AIProviderType,
    request: TTSRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<TTSResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.textToSpeech) {
      throw new Error(`Provider ${providerType} does not support text-to-speech`)
    }
    console.log(`[AI Service] TTS: model=${request.model}, text=${request.input.substring(0, 50)}...`)
    return provider.textToSpeech(request, apiKey, baseUrl)
  }

  /**
   * 向量嵌入
   */
  async createEmbedding(
    providerType: AIProviderType,
    request: EmbeddingRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<EmbeddingResponse> {
    const provider = this.getProvider(providerType)
    if (!provider.createEmbedding) {
      throw new Error(`Provider ${providerType} does not support embeddings`)
    }
    const inputPreview = Array.isArray(request.input)
      ? `${request.input.length} texts`
      : request.input.substring(0, 50)
    console.log(`[AI Service] Embedding: model=${request.model}, input=${inputPreview}...`)
    return provider.createEmbedding(request, apiKey, baseUrl)
  }

  // ========================================
  // 能力检测方法
  // ========================================

  supportsImageGeneration(providerType: AIProviderType): boolean {
    const provider = this.providers.get(providerType)
    return !!provider?.generateImage
  }

  supportsVideoGeneration(providerType: AIProviderType): boolean {
    const provider = this.providers.get(providerType)
    return !!provider?.generateVideo
  }

  supportsTTS(providerType: AIProviderType): boolean {
    const provider = this.providers.get(providerType)
    return !!provider?.textToSpeech
  }

  supportsEmbedding(providerType: AIProviderType): boolean {
    const provider = this.providers.get(providerType)
    return !!provider?.createEmbedding
  }
}

export const aiService = new AIService()
