/**
 * 视频节点处理器
 * 处理视频导入和视频内容分析
 */

import type { NodeConfig, VideoNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import type { ContentPart, ChatMessage } from '@/lib/ai/types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

interface VideoInfo {
  name: string
  url: string
  type?: string
  size?: number
  format: string
  thumbnail?: string
  duration?: number
}

const VISION_MODELS = [
  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
  'claude-3', 'claude-3.5',
  'gemini', 'gemini-pro-vision', 'gemini-1.5', 'gemini-2',
  'qwen-vl', 'qwen2-vl', 'qwen3-vl', 'qwen3-omni',
  'glm-4v',
  'yi-vision',
  'internvl',
  'hunyuan-turbos-vision',
]

const VIDEO_MODELS = [
  'qwen3-omni', 'qwen3-vl-plus', 'qwen3-vl',
  'gemini-1.5', 'gemini-2',
  'gpt-4o',
]

export class VideoNodeProcessor implements NodeProcessor {
  nodeType = 'VIDEO'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const videoNode = node as VideoNodeConfig

    try {
      const files = videoNode.config?.files || []
      const prompt = videoNode.config?.prompt || ''
      const processingOptions = videoNode.config?.processingOptions || {}

      const processedPrompt = replaceVariables(prompt, context)

      const videoInfos: VideoInfo[] = files.map((file) => ({
        name: file.name,
        url: file.url,
        type: file.type,
        size: file.size,
        format: this.detectFormat(file.name),
      }))

      let analysis: string | undefined
      let frames: string[] = []
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      if (files.length > 0) {
        const aiConfig = await this.getAIConfig(context)

        if (aiConfig) {
          const isVisionModel = this.isVisionModel(aiConfig.defaultModel)

          if (processingOptions.extractFrames && isVisionModel) {
            frames = await this.extractVideoFrames(
              videoInfos,
              processingOptions.frameInterval || 5
            )
          }

          if (processedPrompt.trim()) {
            if (isVisionModel && frames.length > 0) {
              const result = await this.analyzeVideosWithVision(
                videoInfos,
                frames,
                processedPrompt,
                aiConfig
              )
              analysis = result.analysis
              tokenUsage = result.tokenUsage
            } else {
              const result = await this.analyzeVideosWithText(
                videoInfos,
                processedPrompt,
                aiConfig
              )
              analysis = result.analysis
              tokenUsage = result.tokenUsage
            }
          }
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          videos: videoInfos,
          count: files.length,
          frames: frames.length > 0 ? frames : undefined,
          frameCount: frames.length,
          analysis,
          prompt: processedPrompt || undefined,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        tokenUsage,
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '视频处理失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  private detectFormat(fileName: string): string {
    const lower = fileName.toLowerCase()
    if (lower.endsWith('.mp4')) return 'mp4'
    if (lower.endsWith('.webm')) return 'webm'
    if (lower.endsWith('.mov')) return 'mov'
    if (lower.endsWith('.avi')) return 'avi'
    if (lower.endsWith('.mkv')) return 'mkv'
    if (lower.endsWith('.flv')) return 'flv'
    if (lower.endsWith('.m4v')) return 'm4v'
    if (lower.endsWith('.wmv')) return 'wmv'
    return 'unknown'
  }

  private isVisionModel(modelId: string): boolean {
    const lower = modelId.toLowerCase()
    return VISION_MODELS.some(v => lower.includes(v.toLowerCase()))
  }

  private isVideoModel(modelId: string): boolean {
    const lower = modelId.toLowerCase()
    return VIDEO_MODELS.some(v => lower.includes(v.toLowerCase()))
  }

  private async extractVideoFrames(
    videos: VideoInfo[],
    intervalSeconds: number
  ): Promise<string[]> {
    const frames: string[] = []

    for (const video of videos) {
      try {
        const extractedFrames = await this.extractFramesFromVideo(video.url, intervalSeconds)
        frames.push(...extractedFrames)
      } catch (error) {
        console.error(`Failed to extract frames from ${video.name}:`, error)
      }
    }

    return frames
  }

  private async extractFramesFromVideo(
    videoUrl: string,
    intervalSeconds: number
  ): Promise<string[]> {
    console.log(`Frame extraction requested for ${videoUrl} at ${intervalSeconds}s intervals`)
    
    const url = new URL(videoUrl, 'http://localhost')
    const extension = url.pathname.split('.').pop()?.toLowerCase()
    
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
    if (extension && imageExtensions.includes(extension)) {
      return [videoUrl]
    }

    console.log('Note: Server-side video frame extraction requires ffmpeg integration.')
    console.log('For video analysis, consider:')
    console.log('1. Using a vision model that supports video URLs (e.g., Gemini 1.5 Pro)')
    console.log('2. Pre-extracting frames before workflow execution')
    console.log('3. Using the video URL directly with compatible models')
    
    return [videoUrl]
  }

  private async analyzeVideosWithVision(
    videos: VideoInfo[],
    frames: string[],
    prompt: string,
    aiConfig: AIConfigCache
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const videoDescriptions = videos
      .map((v, idx) => `视频 ${idx + 1}: ${v.name} (格式: ${v.format})`)
      .join('\n')

    const supportsDirectVideo = this.isVideoModel(aiConfig.defaultModel)

    const contentParts: ContentPart[] = [
      {
        type: 'text',
        text: `请分析以下视频内容。

视频信息：
${videoDescriptions}

${supportsDirectVideo ? '视频已直接提供给模型分析。' : frames.length > 0 ? `已提取 ${frames.length} 个关键帧供分析。` : ''}

用户要求：${prompt}`
      }
    ]

    if (supportsDirectVideo) {
      for (const video of videos) {
        contentParts.push({
          type: 'video_url',
          video_url: {
            url: video.url
          }
        } as ContentPart)
      }
    } else {
      for (const frame of frames.slice(0, 10)) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: frame,
            detail: 'low'
          }
        })
      }
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: supportsDirectVideo 
          ? '你是一个专业的视频内容分析助手。请观看用户提供的视频，并根据用户的要求分析视频内容。'
          : '你是一个专业的视频内容分析助手。请根据提供的视频帧和用户要求，分析视频内容并提供详细的描述。'
      },
      {
        role: 'user',
        content: contentParts
      }
    ]

    const { aiService } = await import('@/lib/ai')

    const response = await aiService.chat(
      aiConfig.provider,
      {
        model: aiConfig.defaultModel,
        messages,
        temperature: 0.7,
        maxTokens: 2048,
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )

    return {
      analysis: response.content,
      tokenUsage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
    }
  }

  private async analyzeVideosWithText(
    videos: VideoInfo[],
    prompt: string,
    aiConfig: AIConfigCache
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const videoDescriptions = videos
      .map((v, idx) => `视频 ${idx + 1}: ${v.name} (格式: ${v.format})`)
      .join('\n')

    const systemPrompt = `你是一个专业的视频内容分析助手。用户会提供视频信息和分析要求，请根据要求提供分析建议。

当前导入的视频：
${videoDescriptions}

注意：当前使用的模型不支持直接分析视频内容。如需视频分析，建议：
1. 切换到支持视觉的模型（如 GPT-4o、Claude 3、Gemini Pro Vision）
2. 启用帧提取功能以分析关键帧
请根据用户的描述和要求提供分析框架和建议。`

    const { aiService } = await import('@/lib/ai')

    const response = await aiService.chat(
      aiConfig.provider,
      {
        model: aiConfig.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 2048,
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )

    return {
      analysis: response.content,
      tokenUsage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
    }
  }

  private async getAIConfig(
    context: ExecutionContext
  ): Promise<AIConfigCache | null> {
    for (const [, config] of context.aiConfigs) {
      return config
    }

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        organizationId: context.organizationId,
        isDefault: true,
        isActive: true,
      },
    })

    if (!apiKey) {
      return null
    }

    const config: AIConfigCache = {
      id: apiKey.id,
      provider: apiKey.provider,
      baseUrl: apiKey.baseUrl,
      apiKey: decryptApiKey(apiKey.keyEncrypted),
      defaultModel: apiKey.defaultModel,
    }

    context.aiConfigs.set(apiKey.id, config)
    return config
  }
}

export const videoNodeProcessor = new VideoNodeProcessor()
