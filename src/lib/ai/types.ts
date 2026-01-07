// AI API 类型定义

/**
 * 模型模态类型
 */
export type ModelModality =
  | 'text'              // 文本模型（聊天、推理）
  | 'code'              // 代码模型
  | 'image-gen'         // 图片生成
  | 'video-gen'         // 视频生成
  | 'audio-transcription' // 音频转录
  | 'audio-tts'         // 文字转语音
  | 'embedding'         // 向量嵌入
  | 'ocr'               // 图文识别

/**
 * 胜算云支持的模型常量
 */
export const SHENSUAN_MODELS = {
  // 文本模型
  text: [
    'anthropic/claude-opus-4.5',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4.5:thinking',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-haiku-4.5:thinking',
    'google/gemini-3-pro-preview',
    'google/gemini-3-flash',
    'openai/gpt-5.2',
    'openai/gpt-5.1-codex-max',
    'deepseek/deepseek-v3.2-think',
    'minimax/minimax-m2.1-lightning',
    'bigmodel/glm-4.7',
  ],
  // 代码模型（与文本模型相同）
  code: [
    'anthropic/claude-opus-4.5',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4.5:thinking',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-haiku-4.5:thinking',
    'google/gemini-3-pro-preview',
    'google/gemini-3-flash',
    'openai/gpt-5.2',
    'openai/gpt-5.1-codex-max',
    'deepseek/deepseek-v3.2-think',
    'minimax/minimax-m2.1-lightning',
    'bigmodel/glm-4.7',
  ],
  // 图片生成模型
  'image-gen': [
    'google/gemini-3-pro-image-preview',
    'bytedance/doubao-seedream-4.5',
    'ali/qwen-image',
  ],
  // 视频生成模型
  'video-gen': [
    'ali/wan2.6-i2v',
    'openai/sora2',
    'google/veo3.1-fast-preview',
    'kling/kling-v2-5-turbo',
  ],
  // 音频转录模型
  'audio-transcription': [
    'openai/whisper',
    'ali/paraformer-v2',
  ],
  // 文字转语音模型
  'audio-tts': [
    'runway/eleven_text_to_sound_v2',
    'runway/eleven_multilingual_v2',
  ],
  // 向量嵌入模型
  embedding: [
    'openai/text-embedding-3-small',
    'openai/text-embedding-3-large',
    'openai/text-embedding-ada-002',
    'bytedance/doubao-embedding-large',
    'bytedance/doubao-embedding',
  ],
  // 图文识别/OCR模型
  ocr: [
    'ali/qwen-vl-ocr',
    'deepseek/deepseek-ocr',
  ],
} as const

/**
 * 各模态的默认模型
 */
export const SHENSUAN_DEFAULT_MODELS: Record<ModelModality, string> = {
  text: 'anthropic/claude-sonnet-4.5',
  code: 'anthropic/claude-opus-4.5',
  'image-gen': 'google/gemini-3-pro-image-preview',
  'video-gen': 'google/veo3.1-fast-preview',
  'audio-transcription': 'openai/whisper',
  'audio-tts': 'runway/eleven_multilingual_v2',
  embedding: 'openai/text-embedding-3-small',
  ocr: 'ali/qwen-vl-ocr',
}

/**
 * 获取模型的模态类型
 */
export function getModelModality(modelId: string): ModelModality | null {
  for (const [modality, models] of Object.entries(SHENSUAN_MODELS)) {
    if ((models as readonly string[]).includes(modelId)) {
      return modality as ModelModality
    }
  }
  return null
}

/**
 * 多模态内容部分 - 支持文本、图片、音频、视频
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  | { type: 'input_audio'; input_audio: { data: string; format: 'wav' | 'mp3' | 'ogg' | 'm4a' | 'flac' | 'webm' } }
  | { type: 'video_url'; video_url: { url: string } }
  /** Internal-only: will be resolved to input_audio before sending to provider. */
  | { type: 'audio_url'; audio_url: { url: string } }

/**
 * 聊天消息 - 支持纯文本或多模态内容
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason: string
  model: string
  /**
   * When enabled, the service may auto-continue on truncation (finishReason=length/max_tokens)
   * and return the merged content.
   */
  wasAutoContinued?: boolean
  /** Number of merged response segments (1 means single call). */
  segments?: number
}

/**
 * 模型信息
 */
export interface Model {
  id: string
  name: string
  provider: string
  contextLength?: number
  supportsVision?: boolean
  supportsAudio?: boolean
  supportsVideo?: boolean
  pricing?: {
    prompt: number
    completion: number
  }
}

/**
 * AI 提供商接口
 */
export interface AIProvider {
  name: string
  chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse>
  listModels?(apiKey: string, baseUrl?: string): Promise<Model[]>
  transcribeAudio?(audioData: ArrayBuffer, options: TranscriptionOptions, apiKey: string, baseUrl?: string): Promise<TranscriptionResponse>
  transcribeAudioFromUrl?(audioUrl: string, options: TranscriptionOptions, apiKey: string, baseUrl?: string): Promise<TranscriptionResponse>
  // 多模态生成方法
  generateImage?(request: ImageGenerationRequest, apiKey: string, baseUrl?: string): Promise<ImageGenerationResponse>
  generateVideo?(request: VideoGenerationRequest, apiKey: string, baseUrl?: string): Promise<VideoGenerationResponse>
  textToSpeech?(request: TTSRequest, apiKey: string, baseUrl?: string): Promise<TTSResponse>
  createEmbedding?(request: EmbeddingRequest, apiKey: string, baseUrl?: string): Promise<EmbeddingResponse>
  // 视频生成状态查询（异步任务）
  getVideoTaskStatus?(taskId: string, apiKey: string, baseUrl?: string): Promise<VideoGenerationResponse>
}

/**
 * 语音转录选项
 */
export interface TranscriptionOptions {
  model?: string
  language?: string
  prompt?: string
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
}

/**
 * 语音转录响应
 */
export interface TranscriptionResponse {
  text: string
  language?: string
  duration?: number
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

/**
 * 支持的 AI 提供商类型
 */
export type AIProviderType = 'SHENSUAN' | 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'BAIDU_WENXIN' | 'ALIYUN_TONGYI' | 'XUNFEI_SPARK' | 'STABILITYAI'

/**
 * 辅助函数：将消息内容转换为 API 格式
 */
export function normalizeMessageContent(content: string | ContentPart[]): unknown {
  if (typeof content === 'string') {
    return content
  }
  return content
}

/**
 * 辅助函数：创建文本消息
 */
export function createTextMessage(role: 'system' | 'user' | 'assistant', text: string): ChatMessage {
  return { role, content: text }
}

/**
 * 辅助函数：创建多模态消息
 */
export function createMultimodalMessage(
  role: 'user' | 'assistant',
  parts: ContentPart[]
): ChatMessage {
  return { role, content: parts }
}

/**
 * 辅助函数：添加图片到消息
 */
export function createImageContent(imageUrl: string, detail: 'low' | 'high' | 'auto' = 'auto'): ContentPart {
  return {
    type: 'image_url',
    image_url: { url: imageUrl, detail }
  }
}

/**
 * 辅助函数：创建文本内容
 */
export function createTextContent(text: string): ContentPart {
  return { type: 'text', text }
}

/**
 * 辅助函数：创建视频内容
 */
export function createVideoContent(videoUrl: string): ContentPart {
  return {
    type: 'video_url',
    video_url: { url: videoUrl }
  }
}

// ========================================
// 多模态生成 API 类型定义
// ========================================

/**
 * 图片生成请求
 */
export interface ImageGenerationRequest {
  model: string
  prompt: string
  negativePrompt?: string       // 负面提示词
  n?: number                    // 生成数量，默认 1
  size?: string                 // 如 "1024x1024"
  quality?: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
  responseFormat?: 'url' | 'b64_json'
  referenceImages?: string[]    // 参考图片 URL 数组（用于图生图）
}

/**
 * 图片生成响应
 */
export interface ImageGenerationResponse {
  images: Array<{
    url?: string
    b64_json?: string
    revisedPrompt?: string
  }>
  model: string
  usage?: {
    totalTokens?: number
  }
}

/**
 * 视频生成请求
 */
export interface VideoGenerationRequest {
  model: string
  prompt: string
  image?: string                // 可选的参考图片 URL（图生视频）
  duration?: number             // 秒数
  aspectRatio?: '16:9' | '9:16' | '1:1'
  resolution?: '720p' | '1080p' | '4k'
}

/**
 * 视频生成响应
 */
export interface VideoGenerationResponse {
  taskId: string                // 异步任务 ID
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videos?: Array<{
    url: string
    duration: number
    format?: string
  }>
  error?: string
}

/**
 * TTS 文本转语音请求
 */
export interface TTSRequest {
  model: string
  input: string
  voice?: string                // 音色 ID
  speed?: number                // 0.25 - 4.0
  responseFormat?: 'mp3' | 'wav' | 'opus' | 'aac'
}

/**
 * TTS 响应
 */
export interface TTSResponse {
  audio: {
    url?: string
    b64_json?: string
    format: string
    duration?: number
  }
}

/**
 * 向量嵌入请求
 */
export interface EmbeddingRequest {
  model: string
  input: string | string[]
  dimensions?: number
}

/**
 * 向量嵌入响应
 */
export interface EmbeddingResponse {
  embeddings: Array<{
    index: number
    embedding: number[]
  }>
  model: string
  usage: {
    promptTokens: number
    totalTokens: number
  }
}

// ========================================
// 多模态输出标准格式
// ========================================

/**
 * 图片生成输出
 */
export interface ImageGenOutput {
  _type: 'image-gen'
  images: Array<{
    url: string
    b64?: string
    revisedPrompt?: string
    width?: number
    height?: number
  }>
  model: string
  prompt: string
}

/**
 * 视频生成输出
 */
export interface VideoGenOutput {
  _type: 'video-gen'
  videos: Array<{
    url: string
    duration: number
    format?: string
  }>
  taskId: string
  model: string
  prompt: string
}

/**
 * TTS 输出
 */
export interface TTSOutput {
  _type: 'audio-tts'
  audio: {
    url: string
    format: string
    duration?: number
  }
  model: string
  text: string
}

/**
 * 音频转录输出
 */
export interface TranscriptionOutput {
  _type: 'audio-transcription'
  text: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
  language?: string
  model: string
}

/**
 * 向量嵌入输出
 */
export interface EmbeddingOutput {
  _type: 'embedding'
  embeddings: number[][]
  model: string
  dimensions: number
}

/**
 * 文本输出
 */
export interface TextOutput {
  _type: 'text'
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 联合模态输出类型
 */
export type ModalityOutput =
  | ImageGenOutput
  | VideoGenOutput
  | TTSOutput
  | TranscriptionOutput
  | EmbeddingOutput
  | TextOutput
