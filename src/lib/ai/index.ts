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
import { estimateTokenCount, getModelContextLimit, MODEL_CONTEXT_LIMITS } from './token-utils'
import { mockChat } from './mock'

export * from './types'

// 导出 Function Calling 模块
export * from './function-calling'

// 导出上下文构建器
export * from './context-builder'

class AIService {
  private providers: Map<AIProviderType, AIProvider> = new Map()
  private modelContextLengthCache: Map<string, { fetchedAt: number; byId: Map<string, number> }> = new Map()
  private readonly modelContextLengthCacheTtlMs = 10 * 60 * 1000

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
    // Local mock mode (offline demo / tests)
    // Triggered by:
    // - AI_MOCK=true
    // - model starts with "mock-"
    // - apiKey starts with "mock"
    if (
      process.env.AI_MOCK === 'true' ||
      /^mock[\w-]*/i.test(String(request.model || '')) ||
      /^mock[\w-]*/i.test(String(apiKey || ''))
    ) {
      return mockChat(request)
    }

    const provider = this.getProvider(providerType)
    const model = request.model
    const totalInputTokens = this.estimateMessageTokens(request.messages || [])
    const contextLimit = await this.resolveModelContextLimit(providerType, model, apiKey, baseUrl)

    // By default, do NOT send max_tokens. Let provider/model decide.
    // Only pass through an explicit positive value.
    const userMax = request.maxTokens && request.maxTokens > 0 ? request.maxTokens : undefined

    const effectiveRequest: ChatRequest = { ...request, maxTokens: userMax }

    const first = await this.chatWithAdaptiveMaxTokens(provider, effectiveRequest, apiKey, baseUrl)
    const continued = await this.autoContinueIfTruncated(provider, effectiveRequest, apiKey, baseUrl, first)

    console.log(
      `[AI Service] Model=${model} input≈${totalInputTokens} ctx=${contextLimit ?? 'unknown'} max=${userMax ?? '(default)'} segments=${continued.segments ?? 1}`
    )

    return continued
  }

  private estimateMessageTokens(messages: ChatRequest['messages']): number {
    let total = 0
    for (const message of messages || []) {
      if (typeof message.content === 'string') {
        total += estimateTokenCount(message.content)
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') total += estimateTokenCount(part.text)
          if (part.type === 'image_url') total += 85
        }
      }
    }
    return total
  }

  private async resolveModelContextLimit(
    providerType: AIProviderType,
    model: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<number | null> {
    // Best-effort: OpenRouter /models exposes context_length.
    if (providerType === 'OPENROUTER') {
      const cacheKey = `${providerType}:${baseUrl || ''}`
      const cached = this.modelContextLengthCache.get(cacheKey)
      const now = Date.now()
      if (!cached || now - cached.fetchedAt > this.modelContextLengthCacheTtlMs) {
        try {
          const models = await this.listModels(providerType, apiKey, baseUrl)
          const byId = new Map<string, number>()
          for (const m of models) {
            if (m.contextLength && m.contextLength > 0) byId.set(m.id, m.contextLength)
          }
          this.modelContextLengthCache.set(cacheKey, { fetchedAt: now, byId })
        } catch {
          // ignore - fallback below
        }
      }

      const updated = this.modelContextLengthCache.get(cacheKey)
      const limit = updated?.byId.get(model)
      if (limit && limit > 0) return limit
    }

    // Fallback: local heuristics/map
    const limit = getModelContextLimit(model)

    // If we only hit the generic default (16k), treat as unknown unless the model is known to be 16k.
    const isKnown16k = model === 'gpt-3.5-turbo'
    if (limit === MODEL_CONTEXT_LIMITS.default && !isKnown16k) return null
    return limit
  }

  private isTruncationFinishReason(reason: string | undefined): boolean {
    const r = (reason || '').toLowerCase()
    return r === 'length' || r === 'max_tokens' || r.includes('max_tokens') || r.includes('length')
  }

  private extractMaxTokenHintFromError(message: string): number | null {
    // Examples:
    // - "max_tokens must be <= 4096"
    // - "max_tokens must be less than or equal to 8192"
    // - "must be between 1 and 8192"
    const patterns: RegExp[] = [
      /\bmax[_\s-]?tokens?\b[^0-9]{0,40}\b(?:<=|less than or equal to)\s*(\d{2,7})/i,
      /\bbetween\s+1\s+and\s+(\d{2,7})\b/i,
      /\bmaximum\b[^0-9]{0,40}\b(\d{2,7})\b/i,
    ]
    for (const re of patterns) {
      const m = message.match(re)
      if (m?.[1]) {
        const n = Number(m[1])
        if (Number.isFinite(n) && n > 0) return n
      }
    }
    return null
  }

  private async chatWithAdaptiveMaxTokens(
    provider: AIProvider,
    request: ChatRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ChatResponse> {
    let currentMax = request.maxTokens
    let attempt = 0
    const maxAttempts = 6

    while (attempt < maxAttempts) {
      attempt++
      try {
        return await provider.chat({ ...request, maxTokens: currentMax }, apiKey, baseUrl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const hinted = this.extractMaxTokenHintFromError(msg)
        if (hinted && hinted > 0) {
          const next = Math.max(1, hinted)
          if (next === currentMax) throw err
          currentMax = next
          continue
        }

        // Heuristic: reduce maxTokens and retry if it looks like a max_tokens/context-related error.
        const looksTokenRelated =
          msg.toLowerCase().includes('max_tokens') ||
          msg.toLowerCase().includes('maximum context') ||
          msg.toLowerCase().includes('context length') ||
          msg.toLowerCase().includes('too many tokens')

        if (!looksTokenRelated) throw err
        if (!currentMax || currentMax <= 1) throw err

        currentMax = Math.max(1, Math.floor(currentMax / 2))
      }
    }

    // Should not reach here
    return provider.chat(request, apiKey, baseUrl)
  }

  private async autoContinueIfTruncated(
    provider: AIProvider,
    baseRequest: ChatRequest,
    apiKey: string,
    baseUrl: string | undefined,
    first: ChatResponse
  ): Promise<ChatResponse> {
    if (!this.isTruncationFinishReason(first.finishReason)) {
      return { ...first, wasAutoContinued: false, segments: 1 }
    }

    const maxSegmentsEnv = Number(process.env.AI_AUTOCONTINUE_MAX_SEGMENTS || '')
    const maxSegments = Number.isFinite(maxSegmentsEnv) && maxSegmentsEnv > 0 ? Math.floor(maxSegmentsEnv) : 8
    const tailChars = 4000
    const overlapProbeChars = 2000
    const maxMergedChars = 200_000
    const maxTotalTokens = 120_000

    let merged = first.content || ''
    let segments = 1
    let totalUsage = { ...first.usage }
    let lastFinishReason = first.finishReason
    let lastModel = first.model

    while (segments < maxSegments && this.isTruncationFinishReason(lastFinishReason)) {
      if (merged.length >= maxMergedChars) break
      if ((totalUsage.totalTokens || 0) >= maxTotalTokens) break

      const tail = merged.slice(-tailChars)
      const continuationPrompt =
        `请继续输出，从上一次输出的末尾继续，不要重复已输出内容。\n` +
        `上一次输出的末尾如下（不要重复这段）：\n` +
        `${tail}\n\n` +
        `直接续写正文，不要解释，不要重复标题。`

      const systemMsg = (baseRequest.messages || []).find(m => m.role === 'system')
      const lastUserMsg = [...(baseRequest.messages || [])].reverse().find(m => m.role === 'user')
      const userSummary =
        typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content.slice(0, 2000)
          : '[non-text user content]'

      const continuationMessages: ChatRequest['messages'] = [
        ...(systemMsg ? [systemMsg] : []),
        { role: 'user', content: `任务指令（摘要）：\n${userSummary}\n\n${continuationPrompt}` },
      ]

      const next = await this.chatWithAdaptiveMaxTokens(
        provider,
        {
          ...baseRequest,
          messages: continuationMessages,
        },
        apiKey,
        baseUrl
      )

      const nextContent = next.content || ''
      const probe = merged.slice(-overlapProbeChars)
      const deduped = this.removeLeadingOverlap(probe, nextContent)
      if (deduped.trim().length < 20) break
      merged += deduped

      totalUsage = {
        promptTokens: totalUsage.promptTokens + (next.usage?.promptTokens || 0),
        completionTokens: totalUsage.completionTokens + (next.usage?.completionTokens || 0),
        totalTokens: totalUsage.totalTokens + (next.usage?.totalTokens || 0),
      }
      segments++
      lastFinishReason = next.finishReason
      lastModel = next.model
    }

    return {
      content: merged,
      usage: totalUsage,
      finishReason: this.isTruncationFinishReason(lastFinishReason) ? lastFinishReason : 'stop',
      model: lastModel,
      wasAutoContinued: segments > 1,
      segments,
    }
  }

  private removeLeadingOverlap(prevTail: string, next: string): string {
    if (!prevTail || !next) return next
    const max = Math.min(prevTail.length, next.length, 2000)
    for (let len = max; len >= 50; len--) {
      const suffix = prevTail.slice(-len)
      if (next.startsWith(suffix)) {
        return next.slice(len)
      }
    }
    return next
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
