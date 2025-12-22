/**
 * 图片节点处理器
 * 处理图片导入和 AI 图像分析
 */

import type { NodeConfig, ImageNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import type { ContentPart, ChatMessage } from '@/lib/ai/types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'

interface ImageInfo {
  name: string
  url: string
  type?: string
  size?: number
  format: string
  width?: number
  height?: number
}

const VISION_MODELS = [
  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
  'claude-3', 'claude-3.5',
  'gemini', 'gemini-pro-vision', 'gemini-1.5', 'gemini-2',
  'qwen-vl', 'qwen2-vl', 'qwen3-vl', 'qwen-vl-ocr', 'qwen3-omni',
  'glm-4v',
  'yi-vision',
  'internvl',
  'hunyuan-turbos-vision', 'hunyuan-vision',
  'deepseek-ocr', 'deepseek-vl',
]

export class ImageNodeProcessor implements NodeProcessor {
  nodeType = 'IMAGE'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const imageNode = node as ImageNodeConfig

    try {
      const files = imageNode.config?.files || []
      const prompt = imageNode.config?.prompt || ''

      const processedPrompt = replaceVariables(prompt, context)

      const imageInfos: ImageInfo[] = await Promise.all(
        files.map(async (file) => {
          const info = await this.getImageInfo(file.url)
          return {
            name: file.name,
            url: file.url,
            type: file.type,
            size: file.size,
            ...info,
          }
        })
      )

      let analysis: string | undefined
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      if (processedPrompt.trim() && files.length > 0) {
        const aiConfig = await this.getAIConfig(context)

        if (aiConfig) {
          const isVisionModel = this.isVisionModel(aiConfig.defaultModel)
          
          if (isVisionModel) {
            const result = await this.analyzeImagesWithVision(
              imageInfos,
              processedPrompt,
              aiConfig
            )
            analysis = result.analysis
            tokenUsage = result.tokenUsage
          } else {
            const result = await this.analyzeImagesWithText(
              imageInfos,
              processedPrompt,
              aiConfig
            )
            analysis = result.analysis
            tokenUsage = result.tokenUsage
          }
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          images: imageInfos,
          count: files.length,
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
        error: error instanceof Error ? error.message : '图片处理失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  private async getImageInfo(url: string): Promise<{
    width?: number
    height?: number
    format: string
  }> {
    const format = this.detectFormat(url)
    return { format }
  }

  private detectFormat(url: string): string {
    const lower = url.toLowerCase()
    if (lower.includes('.png')) return 'png'
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'jpeg'
    if (lower.includes('.gif')) return 'gif'
    if (lower.includes('.webp')) return 'webp'
    if (lower.includes('.svg')) return 'svg'
    if (lower.includes('.bmp')) return 'bmp'
    if (lower.startsWith('data:image/png')) return 'png'
    if (lower.startsWith('data:image/jpeg') || lower.startsWith('data:image/jpg')) return 'jpeg'
    if (lower.startsWith('data:image/gif')) return 'gif'
    if (lower.startsWith('data:image/webp')) return 'webp'
    return 'unknown'
  }

  private isVisionModel(modelId: string): boolean {
    const lower = modelId.toLowerCase()
    return VISION_MODELS.some(v => lower.includes(v.toLowerCase()))
  }

  private async analyzeImagesWithVision(
    images: ImageInfo[],
    prompt: string,
    aiConfig: AIConfigCache
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const contentParts: ContentPart[] = [
      { type: 'text', text: prompt }
    ]

    for (const image of images) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: image.url,
          detail: 'auto'
        }
      })
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: '你是一个专业的图像分析助手。请仔细观察用户提供的图片，并根据用户的要求进行分析。'
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

  private async analyzeImagesWithText(
    images: ImageInfo[],
    prompt: string,
    aiConfig: AIConfigCache
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const imageDescriptions = images
      .map((img, idx) => `图片 ${idx + 1}: ${img.name} (格式: ${img.format})`)
      .join('\n')

    const systemPrompt = `你是一个专业的图像分析助手。用户会提供图片信息和分析要求，请根据要求进行分析。

当前导入的图片：
${imageDescriptions}

注意：当前使用的模型不支持直接查看图片内容。如需图像分析，建议切换到支持视觉的模型（如 GPT-4o、Claude 3、Gemini Pro Vision 等）。`

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
      provider: apiKey.provider as AIConfigCache['provider'],
      baseUrl: apiKey.baseUrl,
      apiKey: safeDecryptApiKey(apiKey.keyEncrypted),
      defaultModel: apiKey.defaultModel,
    }

    context.aiConfigs.set(apiKey.id, config)
    return config
  }
}

export const imageNodeProcessor = new ImageNodeProcessor()
