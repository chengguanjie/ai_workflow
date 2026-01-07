/**
 * 模态路由器 - 根据模型类型路由到不同的 AI 服务
 */

import type { ProcessNodeConfigData } from '@/types/workflow'
import type { ExecutionContext, AIConfigCache } from '../types'
import { aiService, getModelModality } from '@/lib/ai'
import { prisma } from '@/lib/db'
import { localStorageProvider } from '@/lib/storage/providers/local'
import { buildSignedDownloadUrl } from '@/lib/storage/file-download-token'
import type {
  ModelModality,
  ImageGenOutput,
  VideoGenOutput,
  TTSOutput,
  TranscriptionOutput,
  EmbeddingOutput,
  TextOutput,
  ModalityOutput,
  ContentPart
} from '@/lib/ai/types'

const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_INLINE_AUDIO_BYTES = 10 * 1024 * 1024

export interface ModalityRouterResult {
  success: boolean
  output: ModalityOutput
  error?: string
}

interface ModalityRouterParams {
  model: string
  prompt: string
  systemPrompt?: string
  config: ProcessNodeConfigData
  aiConfig: AIConfigCache
  context: ExecutionContext
  // 多模态消息（用于支持图片/视频输入）
  multimodalContent?: Array<{ type: string; [key: string]: unknown }>
  // 音频输入（用于转录）
  audioInput?: {
    url?: string
    data?: ArrayBuffer
  }
}

/**
 * 根据模型模态路由到对应的 AI 服务
 */
export async function routeByModality(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, config, context } = params
  // 优先使用节点显式保存的 modality（来自前端配置面板）
  const explicitModality = (config as ProcessNodeConfigData & { modality?: ModelModality }).modality
  const modality = explicitModality || getModelModality(model)

  context.addLog?.('info', `检测到模型模态: ${modality || 'text'}`, 'MODALITY', { model, modality })

  try {
    switch (modality) {
      case 'text':
      case 'code':
      case null: // 未知模型默认作为文本处理
        return await handleTextGeneration(params)

      case 'image-gen':
        return await handleImageGeneration(params)

      case 'video-gen':
        return await handleVideoGeneration(params)

      case 'audio-tts':
        return await handleTTS(params)

      case 'audio-transcription':
        return await handleTranscription(params)

      case 'embedding':
        return await handleEmbedding(params)

      case 'ocr':
        // OCR 模型使用 Vision 能力，通过 chat API 处理
        return await handleOCR(params)

      default:
        return await handleTextGeneration(params)
    }
  } catch (error) {
    return {
      success: false,
      output: { _type: 'text', content: '', model },
      error: error instanceof Error ? error.message : '模态路由失败'
    }
  }
}

/**
 * 处理文本/代码生成
 */
async function handleTextGeneration(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, prompt, systemPrompt, aiConfig, multimodalContent, context } = params

  // 使用 ChatMessage 兼容类型
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }> = []

  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  // 如果有多模态内容，使用多模态消息格式
  if (multimodalContent && multimodalContent.length > 0) {
    const resolved = await resolveMultimodalParts(multimodalContent as ContentPart[], context)
    messages.push({ role: 'user', content: resolved })
  } else {
    messages.push({ role: 'user', content: prompt })
  }

  // 如果用户没有指定 maxTokens 或设置为 -1（无限制），传递 undefined 让 API 使用模型默认最大值
  const configMaxTokens = params.config.maxTokens
  const maxTokens = (configMaxTokens === undefined || configMaxTokens === -1) ? undefined : configMaxTokens

  const response = await aiService.chat(
    aiConfig.provider,
    {
      model,
      messages,
      temperature: params.config.temperature ?? 0.7,
      maxTokens,
    },
    aiConfig.apiKey,
    aiConfig.baseUrl
  )

  const output: TextOutput = {
    _type: 'text',
    content: response.content,
    model: response.model,
    usage: response.usage,
  }

  return {
    success: true,
    output
  }
}

/**
 * 处理图片生成
 */
async function handleImageGeneration(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, prompt, config, aiConfig, context } = params

  context.addLog?.('step', '正在生成图片...', 'IMAGE_GEN', {
    model,
    size: config.imageSize,
    count: config.imageCount,
    baseUrl: aiConfig.baseUrl
  })

  let response
  try {
    response = await aiService.generateImage(
      aiConfig.provider,
      {
        model,
        prompt,
        negativePrompt: config.negativePrompt,
        n: config.imageCount || 1,
        size: config.imageSize || '1024x1024',
        quality: config.imageQuality,
        style: config.imageStyle,
        responseFormat: 'url'
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    context.addLog?.('error', `图片生成失败: ${errorMsg}`, 'IMAGE_GEN')
    throw error
  }

  context.addLog?.('success', `图片生成完成，共 ${response.images.length} 张`, 'IMAGE_GEN')

  const output: ImageGenOutput = {
    _type: 'image-gen',
    images: response.images.map(img => ({
      url: img.url || '',
      b64: img.b64_json,
      revisedPrompt: img.revisedPrompt
    })),
    model: response.model,
    prompt
  }

  return {
    success: true,
    output
  }
}

/**
 * 处理视频生成
 */
async function handleVideoGeneration(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, prompt, config, aiConfig, context } = params

  context.addLog?.('step', '正在提交视频生成任务...', 'VIDEO_GEN', {
    model,
    duration: config.videoDuration,
    aspectRatio: config.videoAspectRatio
  })

  // 提交视频生成任务
  const submitResponse = await aiService.generateVideo(
    aiConfig.provider,
    {
      model,
      prompt,
      image: config.referenceImage,
      duration: config.videoDuration,
      aspectRatio: config.videoAspectRatio,
      resolution: config.videoResolution
    },
    aiConfig.apiKey,
    aiConfig.baseUrl
  )

  context.addLog?.('info', `视频任务已提交，任务ID: ${submitResponse.taskId}`, 'VIDEO_GEN')

  // 等待视频生成完成
  context.addLog?.('step', '正在等待视频生成完成...', 'VIDEO_GEN')

  const result = await aiService.waitForVideoCompletion(
    aiConfig.provider,
    submitResponse.taskId,
    aiConfig.apiKey,
    aiConfig.baseUrl,
    {
      maxWaitTime: 5 * 60 * 1000, // 5 分钟
      pollInterval: 5000 // 5 秒
    }
  )

  context.addLog?.('success', `视频生成完成，共 ${result.videos?.length || 0} 个`, 'VIDEO_GEN')

  const output: VideoGenOutput = {
    _type: 'video-gen',
    videos: result.videos?.map(v => ({
      url: v.url,
      duration: v.duration,
      format: v.format
    })) || [],
    taskId: result.taskId,
    model,
    prompt
  }

  return {
    success: true,
    output
  }
}

/**
 * 处理 TTS 文本转语音
 */
async function handleTTS(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, prompt, config, aiConfig, context } = params

  context.addLog?.('step', '正在生成语音...', 'TTS', {
    model,
    voice: config.ttsVoice,
    speed: config.ttsSpeed
  })

  const response = await aiService.textToSpeech(
    aiConfig.provider,
    {
      model,
      input: prompt,
      voice: config.ttsVoice,
      speed: config.ttsSpeed,
      responseFormat: config.ttsFormat || 'mp3'
    },
    aiConfig.apiKey,
    aiConfig.baseUrl
  )

  context.addLog?.('success', '语音生成完成', 'TTS')

  const output: TTSOutput = {
    _type: 'audio-tts',
    audio: {
      url: response.audio.url || '',
      format: response.audio.format,
      duration: response.audio.duration
    },
    model,
    text: prompt
  }

  return {
    success: true,
    output
  }
}

/**
 * 处理音频转录
 */
async function handleTranscription(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, config, aiConfig, context, audioInput } = params

  if (!audioInput?.url && !audioInput?.data) {
    throw new Error('音频转录需要提供音频文件或 URL')
  }

  context.addLog?.('step', '正在转录音频...', 'TRANSCRIPTION', {
    model,
    language: config.transcriptionLanguage
  })

  let response

  if (audioInput.url) {
    const internal = await tryLoadInternalAudioBuffer(audioInput.url, context.organizationId)
    if (internal) {
      response = await aiService.transcribeAudio(
        aiConfig.provider,
        internal.audioData,
        {
          model,
          language: config.transcriptionLanguage,
          responseFormat: config.transcriptionFormat || 'json'
        },
        aiConfig.apiKey,
        aiConfig.baseUrl
      )
    } else {
    response = await aiService.transcribeAudioFromUrl(
      aiConfig.provider,
      audioInput.url,
      {
        model,
        language: config.transcriptionLanguage,
        responseFormat: config.transcriptionFormat || 'json'
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )
    }
  } else if (audioInput.data) {
    response = await aiService.transcribeAudio(
      aiConfig.provider,
      audioInput.data,
      {
        model,
        language: config.transcriptionLanguage,
        responseFormat: config.transcriptionFormat || 'json'
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )
  } else {
    throw new Error('音频转录需要提供音频文件或 URL')
  }

  context.addLog?.('success', '音频转录完成', 'TRANSCRIPTION')

  const output: TranscriptionOutput = {
    _type: 'audio-transcription',
    text: response.text,
    segments: response.segments,
    language: response.language,
    model
  }

  return {
    success: true,
    output
  }
}

/**
 * 处理向量嵌入
 */
async function handleEmbedding(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, prompt, config, aiConfig, context } = params

  context.addLog?.('step', '正在生成向量嵌入...', 'EMBEDDING', {
    model,
    dimensions: config.embeddingDimensions
  })

  const response = await aiService.createEmbedding(
    aiConfig.provider,
    {
      model,
      input: prompt,
      dimensions: config.embeddingDimensions
    },
    aiConfig.apiKey,
    aiConfig.baseUrl
  )

  context.addLog?.('success', `向量嵌入完成，维度: ${response.embeddings[0]?.embedding.length}`, 'EMBEDDING')

  const output: EmbeddingOutput = {
    _type: 'embedding',
    embeddings: response.embeddings.map(e => e.embedding),
    model: response.model,
    dimensions: response.embeddings[0]?.embedding.length || 0
  }

  return {
    success: true,
    output
  }
}

/**
 * 处理 OCR 图文识别
 * OCR 使用 Vision 模型能力，通过 chat API 实现
 */
async function handleOCR(params: ModalityRouterParams): Promise<ModalityRouterResult> {
  const { model, prompt, aiConfig, context, multimodalContent } = params

  if (!multimodalContent || multimodalContent.length === 0) {
    throw new Error('OCR 需要提供图片输入')
  }

  context.addLog?.('step', '正在进行图文识别...', 'OCR', { model })

  // OCR 使用 chat API，但使用 OCR 专用模型
  const resolved = await resolveMultimodalParts(multimodalContent as ContentPart[], context)
  const messages: Array<{ role: 'system' | 'user'; content: string | ContentPart[] }> = [
    {
      role: 'system',
      content: '你是一个专业的图文识别助手。请仔细识别图片中的所有文字内容，并按照原始格式输出。'
    },
    {
      role: 'user',
      content: [
        ...resolved,
        { type: 'text', text: prompt || '请识别这张图片中的所有文字内容。' } as ContentPart
      ]
    }
  ]

  const response = await aiService.chat(
    aiConfig.provider,
    {
      model,
      messages,
      temperature: 0.1, // OCR 使用低温度保证准确性
      maxTokens: 4096,
    },
    aiConfig.apiKey,
    aiConfig.baseUrl
  )

  context.addLog?.('success', '图文识别完成', 'OCR')

  const output: TextOutput = {
    _type: 'text',
    content: response.content,
    model: response.model
  }

  return {
    success: true,
    output
  }
}

function tryParseFileKeyFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'http://localhost')
    const match = parsed.pathname.match(/^\/api\/files\/([^/]+)\/download$/)
    if (!match?.[1]) return null
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function detectAudioFormatFromMime(mimeType: string): 'wav' | 'mp3' | 'ogg' | 'm4a' | 'flac' | 'webm' {
  const lower = mimeType.toLowerCase()
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('m4a')) return 'm4a'
  if (lower.includes('flac')) return 'flac'
  if (lower.includes('webm')) return 'webm'
  return 'mp3'
}

async function tryLoadInternalAudioBuffer(url: string, organizationId: string): Promise<{
  audioData: ArrayBuffer
  mimeType: string
  size: number
} | null> {
  const fileKey = tryParseFileKeyFromDownloadUrl(url)
  if (!fileKey) return null

  const record = await prisma.outputFile.findUnique({
    where: { fileKey },
    select: {
      storageType: true,
      organizationId: true,
      expiresAt: true,
      mimeType: true,
      size: true,
    },
  })

  if (!record) return null
  if (record.organizationId !== organizationId) throw new Error('无权访问音频文件')
  if (record.expiresAt && record.expiresAt < new Date()) throw new Error('音频文件已过期')
  if (!record.mimeType?.startsWith('audio/')) throw new Error('该文件不是音频文件')

  if (record.storageType !== 'LOCAL') {
    throw new Error('云存储音频转录暂未实现：请改用可公开访问的音频 URL 或本地存储')
  }

  const buffer = await localStorageProvider.readFile(fileKey)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  return { audioData: arrayBuffer, mimeType: record.mimeType, size: record.size }
}

function tryParseDataAudioUrl(url: string): { mimeType: string; base64: string } | null {
  const match = url.match(/^data:(audio\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i)
  if (!match?.[1] || !match?.[2]) return null
  return { mimeType: match[1].toLowerCase(), base64: match[2] }
}

function toSignedDownloadUrl(fileKey: string, organizationId: string): string {
  return buildSignedDownloadUrl({ fileKey, organizationId, ttlSeconds: 10 * 60 })
}

async function resolveMultimodalParts(parts: ContentPart[], context: ExecutionContext): Promise<ContentPart[]> {
  const needs = parts.some((p) => {
    if (p.type === 'image_url') return typeof p.image_url?.url === 'string' && tryParseFileKeyFromDownloadUrl(p.image_url.url)
    if (p.type === 'video_url') return typeof p.video_url?.url === 'string' && tryParseFileKeyFromDownloadUrl(p.video_url.url)
    if (p.type === 'audio_url') return typeof p.audio_url?.url === 'string'
    return false
  })
  if (!needs) return parts

  const resolved: ContentPart[] = []
  for (const part of parts) {
    if (part.type === 'audio_url') {
      const url = part.audio_url?.url
      if (typeof url !== 'string') {
        resolved.push({ type: 'text', text: '[audio]' })
        continue
      }

      const dataAudio = tryParseDataAudioUrl(url)
      if (dataAudio) {
        resolved.push({
          type: 'input_audio',
          input_audio: {
            data: dataAudio.base64,
            format: detectAudioFormatFromMime(dataAudio.mimeType),
          },
        })
        continue
      }

      const internal = await tryLoadInternalAudioBuffer(url, context.organizationId)
      if (!internal) {
        throw new Error('音频多模态输入仅支持本系统文件下载链接或 data:audio；外部 URL 请先用音频转录节点')
      }
      if (internal.size > MAX_INLINE_AUDIO_BYTES) {
        throw new Error('音频文件过大，无法内联到多模态消息（请先用音频转录节点）')
      }
      const base64 = Buffer.from(internal.audioData).toString('base64')
      resolved.push({
        type: 'input_audio',
        input_audio: {
          data: base64,
          format: detectAudioFormatFromMime(internal.mimeType),
        },
      })
      continue
    }

    if (part.type !== 'image_url' && part.type !== 'video_url') {
      resolved.push(part)
      continue
    }

    const url = part.type === 'image_url' ? part.image_url?.url : part.video_url?.url
    if (typeof url !== 'string') {
      resolved.push(part)
      continue
    }

    const fileKey = tryParseFileKeyFromDownloadUrl(url)
    if (!fileKey) {
      resolved.push(part)
      continue
    }

    const record = await prisma.outputFile.findUnique({
      where: { fileKey },
      select: {
        storageType: true,
        organizationId: true,
        expiresAt: true,
        mimeType: true,
        size: true,
      },
    })

    if (!record) {
      resolved.push(part)
      continue
    }
    if (record.organizationId !== context.organizationId) throw new Error('无权访问文件')
    if (record.expiresAt && record.expiresAt < new Date()) throw new Error('文件已过期')

    // Videos: use signed public URL so providers can fetch it.
    if (part.type === 'video_url') {
      if (!record.mimeType?.startsWith('video/')) throw new Error('该文件不是视频文件')
      resolved.push({ type: 'video_url', video_url: { url: toSignedDownloadUrl(fileKey, context.organizationId) } })
      continue
    }

    // Images: inline small LOCAL images; otherwise signed URL.
    if (!record.mimeType?.startsWith('image/')) throw new Error('该文件不是图片文件')
    if (record.storageType === 'LOCAL' && record.size <= MAX_INLINE_IMAGE_BYTES) {
      const buffer = await localStorageProvider.readFile(fileKey)
      const b64 = buffer.toString('base64')
      const dataUrl = `data:${record.mimeType};base64,${b64}`
      resolved.push({ type: 'image_url', image_url: { url: dataUrl, detail: part.image_url?.detail || 'auto' } })
      continue
    }
    resolved.push({ type: 'image_url', image_url: { url: toSignedDownloadUrl(fileKey, context.organizationId), detail: part.image_url?.detail || 'auto' } })
  }

  return resolved
}

/**
 * 格式化模态输出为节点数据格式
 */
export function formatModalityOutput(output: ModalityOutput): Record<string, unknown> {
  switch (output._type) {
    case 'text':
      return {
        结果: output.content,
        result: output.content,
        model: output.model
      }

    case 'image-gen':
      return {
        images: output.images,
        // 兼容：第一张图片 URL 作为主结果
        结果: output.images[0]?.url || '',
        result: output.images[0]?.url || '',
        // 便于下游直接引用三张配图：{{节点.imageUrls}}
        imageUrls: output.images
          .filter((img) => img.url)
          .map((img, index) => ({
            index: index + 1,
            url: img.url,
            description: img.revisedPrompt || `图片${index + 1}`,
          })),
        model: output.model,
        prompt: output.prompt
      }

    case 'video-gen':
      return {
        videos: output.videos,
        // 兼容：第一个视频 URL 作为主结果
        结果: output.videos[0]?.url || '',
        result: output.videos[0]?.url || '',
        taskId: output.taskId,
        model: output.model,
        prompt: output.prompt
      }

    case 'audio-tts':
      return {
        audio: output.audio,
        结果: output.audio.url,
        result: output.audio.url,
        model: output.model,
        text: output.text
      }

    case 'audio-transcription':
      return {
        结果: output.text,
        result: output.text,
        segments: output.segments,
        language: output.language,
        model: output.model
      }

    case 'embedding':
      return {
        embeddings: output.embeddings,
        结果: `向量嵌入完成，共 ${output.embeddings.length} 个，维度 ${output.dimensions}`,
        result: `向量嵌入完成，共 ${output.embeddings.length} 个，维度 ${output.dimensions}`,
        model: output.model,
        dimensions: output.dimensions
      }

    default:
      return { 结果: JSON.stringify(output) }
  }
}
