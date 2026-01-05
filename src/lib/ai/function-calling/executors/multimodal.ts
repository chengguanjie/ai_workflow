import type {
  ToolExecutor,
  ToolDefinition,
  ToolCallResult,
  ToolExecutionContext,
} from '../types'
import { aiService } from '@/lib/ai'
import { SHENSUAN_DEFAULT_MODELS } from '@/lib/ai/types'
import type {
  ImageGenerationRequest,
  VideoGenerationRequest,
  TTSRequest,
} from '@/lib/ai/types'

/**
 * 基础多模态工具逻辑封装，供拆分后的三个工具复用
 */
async function executeImageGeneration(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolCallResult> {
  const startedAt = Date.now()

  if (!context.aiConfig) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error:
        '当前节点未提供 AI 配置，无法调用图片生成模型。请在节点中选择 AI 服务商与默认模型。',
      duration: Date.now() - startedAt,
    }
  }

  const { provider, apiKey, baseUrl } = context.aiConfig
  const prompt = String(args.prompt || '').trim()

  if (!prompt) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error: '缺少必需参数: prompt',
      duration: Date.now() - startedAt,
    }
  }

  try {
    // 智能模型选择：优先使用参数，若缺失或为文本模型，则回退到默认图片模型
    let model = (args.model as string) || ''
    const defaultModel = context.aiConfig.defaultModel || ''
    
    // 如果没有指定模型，或者指定的是文本模型（如 claude/gpt），尝试回退
    if (!model || model.includes('claude') || model.includes('gpt-')) {
      // 检查默认模型是否可用（非文本模型）
      if (defaultModel && !defaultModel.includes('claude') && !defaultModel.includes('gpt-')) {
        model = defaultModel
      } else {
        // 强制使用默认图片生成模型
        model = SHENSUAN_DEFAULT_MODELS['image-gen']
      }
    }

    const request: ImageGenerationRequest = {
      model,
      prompt,
      negativePrompt: (args.negative_prompt as string) || undefined,
      n: (args.image_count as number) || 1,
      size: (args.image_size as string) || '1024x1024',
      quality: (args.image_quality as 'standard' | 'hd') || undefined,
      style: (args.image_style as 'vivid' | 'natural') || undefined,
      responseFormat: 'url',
      referenceImages: Array.isArray(args.reference_images)
        ? (args.reference_images as string[])
        : undefined,
    }

    const response = await aiService.generateImage(
      provider as any,
      request,
      apiKey,
      baseUrl
    )

    return {
      toolCallId: '',
      toolName,
      success: true,
      duration: Date.now() - startedAt,
      result: {
        _type: 'image-gen',
        images: response.images.map((img) => ({
          url: img.url,
          b64: img.b64_json,
          revisedPrompt: img.revisedPrompt,
        })),
        model: response.model,
        prompt,
      },
    }
  } catch (error) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startedAt,
    }
  }
}

async function executeVideoGeneration(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolCallResult> {
  const startedAt = Date.now()

  if (!context.aiConfig) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error:
        '当前节点未提供 AI 配置，无法调用视频生成模型。请在节点中选择 AI 服务商与默认模型。',
      duration: Date.now() - startedAt,
    }
  }

  const { provider, apiKey, baseUrl } = context.aiConfig
  const prompt = String(args.prompt || '').trim()

  if (!prompt) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error: '缺少必需参数: prompt',
      duration: Date.now() - startedAt,
    }
  }

  try {
    // 智能模型选择：优先使用参数，若缺失或为文本模型，则回退到默认视频模型
    let model = (args.model as string) || ''
    const defaultModel = context.aiConfig.defaultModel || ''
    
    if (!model || model.includes('claude') || model.includes('gpt-')) {
      if (defaultModel && !defaultModel.includes('claude') && !defaultModel.includes('gpt-')) {
        model = defaultModel
      } else {
        model = SHENSUAN_DEFAULT_MODELS['video-gen']
      }
    }

    const request: VideoGenerationRequest = {
      model,
      prompt,
      image: (args.video_reference_image as string) || undefined,
      duration: (args.video_duration as number) || undefined,
      aspectRatio: (args.video_aspect_ratio as '16:9' | '9:16' | '1:1') || undefined,
      resolution: (args.video_resolution as '720p' | '1080p' | '4k') || undefined,
    }

    const submit = await aiService.generateVideo(
      provider as any,
      request,
      apiKey,
      baseUrl
    )

    const result = await aiService.waitForVideoCompletion(
      provider as any,
      submit.taskId,
      apiKey,
      baseUrl
    )

    return {
      toolCallId: '',
      toolName,
      success: true,
      duration: Date.now() - startedAt,
      result: {
        _type: 'video-gen',
        taskId: result.taskId,
        videos:
          result.videos?.map((v) => ({
            url: v.url,
            duration: v.duration,
            format: v.format,
          })) || [],
        model: request.model,
        prompt,
      },
    }
  } catch (error) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startedAt,
    }
  }
}

async function executeTTS(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolCallResult> {
  const startedAt = Date.now()

  if (!context.aiConfig) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error:
        '当前节点未提供 AI 配置，无法调用文本转语音模型。请在节点中选择 AI 服务商与默认模型。',
      duration: Date.now() - startedAt,
    }
  }

  const { provider, apiKey, baseUrl } = context.aiConfig
  const prompt = String(args.prompt || '').trim()

  if (!prompt) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error: '缺少必需参数: prompt',
      duration: Date.now() - startedAt,
    }
  }

  try {
    // 智能模型选择：优先使用参数，若缺失或为文本模型，则回退到默认 TTS 模型
    let model = (args.model as string) || ''
    const defaultModel = context.aiConfig.defaultModel || ''
    
    if (!model || model.includes('claude') || model.includes('gpt-')) {
      if (defaultModel && !defaultModel.includes('claude') && !defaultModel.includes('gpt-')) {
        model = defaultModel
      } else {
        model = SHENSUAN_DEFAULT_MODELS['audio-tts']
      }
    }

    const request: TTSRequest = {
      model,
      input: prompt,
      voice: (args.voice as string) || undefined,
      responseFormat: (args.output_format as 'mp3' | 'wav' | 'opus' | 'aac') || 'mp3',
      speed:
        typeof args.tts_speed === 'number'
          ? (args.tts_speed as number)
          : undefined,
    }

    const response = await aiService.textToSpeech(
      provider as any,
      request,
      apiKey,
      baseUrl
    )

    return {
      toolCallId: '',
      toolName,
      success: true,
      duration: Date.now() - startedAt,
      result: {
        _type: 'audio-tts',
        audio: {
          url: response.audio.url,
          format: response.audio.format,
          duration: response.audio.duration,
        },
        text: prompt,
        model: request.model,
      },
    }
  } catch (error) {
    return {
      toolCallId: '',
      toolName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startedAt,
    }
  }
}

export class MultimodalToolExecutor implements ToolExecutor {
  name = 'multimodal_ai'
  description =
    '多模态生成工具：在当前节点的 AI 配置下，生成图片、音频或视频'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'modality',
          type: 'string',
          description: '生成模态：image / video / audio_tts',
          required: true,
          enum: ['image', 'video', 'audio_tts'],
        },
        {
          name: 'prompt',
          type: 'string',
          description: '用于生成的自然语言提示词',
          required: true,
        },
        // 图片相关参数
        {
          name: 'negative_prompt',
          type: 'string',
          description: '图片/视频生成的反向提示词（可选）',
          required: false,
        },
        {
          name: 'image_size',
          type: 'string',
          description: '图片尺寸，例如 1024x1024',
          required: false,
        },
        {
          name: 'image_count',
          type: 'number',
          description: '生成图片数量，默认 1',
          required: false,
        },
        {
          name: 'image_quality',
          type: 'string',
          description: '图片质量：standard（标准）或 hd（高清）',
          required: false,
          enum: ['standard', 'hd'],
        },
        {
          name: 'image_style',
          type: 'string',
          description: '图片风格：vivid（生动）或 natural（自然）',
          required: false,
          enum: ['vivid', 'natural'],
        },
        {
          name: 'reference_images',
          type: 'array',
          description: '参考图片 URL 列表（用于图生图，可选）',
          required: false,
          items: {
            type: 'string',
          },
        },
        // 视频相关参数
        {
          name: 'video_duration',
          type: 'number',
          description: '视频时长（秒），如 5、10',
          required: false,
        },
        {
          name: 'video_aspect_ratio',
          type: 'string',
          description: '视频宽高比，例如 9:16、16:9',
          required: false,
        },
        {
          name: 'video_resolution',
          type: 'string',
          description: '视频分辨率，例如 720p、1080p、4k',
          required: false,
          enum: ['720p', '1080p', '4k'],
        },
        {
          name: 'video_reference_image',
          type: 'string',
          description: '视频生成参考图片 URL（可选，图生视频）',
          required: false,
        },
        // TTS 相关参数
        {
          name: 'voice',
          type: 'string',
          description: 'TTS 语音名称',
          required: false,
        },
        {
          name: 'output_format',
          type: 'string',
          description: '音频输出格式，例如 mp3、wav',
          required: false,
        },
        {
          name: 'tts_speed',
          type: 'number',
          description: 'TTS 语速倍率，范围 0.25-4.0，默认 1.0',
          required: false,
        },
        {
          name: 'tts_emotion',
          type: 'string',
          description: 'TTS 情绪/风格描述，例如 calm、excited、serious（可选）',
          required: false,
        },
        {
          name: 'model',
          type: 'string',
          description:
            '可选：覆盖当前节点默认的 image/video/tts 模型 ID',
          required: false,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    const modality = String(args.modality || '').toLowerCase()

    if (modality === 'image') {
      return executeImageGeneration(this.name, args, context)
    }

    if (modality === 'video') {
      return executeVideoGeneration(this.name, args, context)
    }

    if (modality === 'audio_tts') {
      return executeTTS(this.name, args, context)
    }

    return {
      toolCallId: '',
      toolName: this.name,
      success: false,
      error: `不支持的模态类型: ${modality}，请使用 image / video / audio_tts`,
      duration: 0,
    }
  }
}

/**
 * 图片生成工具（拆分版）
 */
export class ImageGenerationToolExecutor implements ToolExecutor {
  name = 'image_gen_ai'
  description = '图片生成工具：根据用户提供的内容自动生成图片。收到图片生成请求时必须立即调用此工具，根据上下文生成合适的 prompt，不要询问额外信息。'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'prompt',
          type: 'string',
          description: '用于生成图片的自然语言提示词',
          required: true,
        },
        {
          name: 'negative_prompt',
          type: 'string',
          description: '图片生成的反向提示词（可选）',
          required: false,
        },
        {
          name: 'image_size',
          type: 'string',
          description: '图片尺寸，例如 1024x1024',
          required: false,
        },
        {
          name: 'image_count',
          type: 'number',
          description: '生成图片数量，默认 1',
          required: false,
        },
        {
          name: 'image_quality',
          type: 'string',
          description: '图片质量：standard（标准）或 hd（高清）',
          required: false,
          enum: ['standard', 'hd'],
        },
        {
          name: 'image_style',
          type: 'string',
          description: '图片风格：vivid（生动）或 natural（自然）',
          required: false,
          enum: ['vivid', 'natural'],
        },
        {
          name: 'reference_images',
          type: 'array',
          description: '参考图片 URL 列表（用于图生图，可选）',
          required: false,
          items: {
            type: 'string',
          },
        },
        {
          name: 'model',
          type: 'string',
          description: '可选：覆盖当前节点默认的图片生成模型 ID',
          required: false,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    return executeImageGeneration(this.name, args, context)
  }
}

/**
 * 视频生成工具（拆分版）
 */
export class VideoGenerationToolExecutor implements ToolExecutor {
  name = 'video_gen_ai'
  description = '视频生成工具：在当前节点的 AI 配置下生成视频'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'prompt',
          type: 'string',
          description: '用于生成视频的自然语言提示词',
          required: true,
        },
        {
          name: 'video_duration',
          type: 'number',
          description: '视频时长（秒），如 5、10',
          required: false,
        },
        {
          name: 'video_aspect_ratio',
          type: 'string',
          description: '视频宽高比，例如 9:16、16:9',
          required: false,
        },
        {
          name: 'video_resolution',
          type: 'string',
          description: '视频分辨率，例如 720p、1080p、4k',
          required: false,
          enum: ['720p', '1080p', '4k'],
        },
        {
          name: 'video_reference_image',
          type: 'string',
          description: '视频生成参考图片 URL（可选，图生视频）',
          required: false,
        },
        {
          name: 'model',
          type: 'string',
          description: '可选：覆盖当前节点默认的视频生成模型 ID',
          required: false,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    return executeVideoGeneration(this.name, args, context)
  }
}

/**
 * 文本转语音工具（拆分版）
 */
export class AudioTTSToolExecutor implements ToolExecutor {
  name = 'audio_tts_ai'
  description = '文本转语音工具：在当前节点的 AI 配置下生成语音音频'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'prompt',
          type: 'string',
          description: '需要转换为语音的文本内容',
          required: true,
        },
        {
          name: 'voice',
          type: 'string',
          description: 'TTS 语音名称',
          required: false,
        },
        {
          name: 'output_format',
          type: 'string',
          description: '音频输出格式，例如 mp3、wav、opus',
          required: false,
        },
        {
          name: 'tts_speed',
          type: 'number',
          description: 'TTS 语速倍率，范围 0.25-4.0，默认 1.0',
          required: false,
        },
        {
          name: 'model',
          type: 'string',
          description: '可选：覆盖当前节点默认的 TTS 模型 ID',
          required: false,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    return executeTTS(this.name, args, context)
  }
}

