/**
 * 图片节点处理器
 * 处理图片导入和 AI 图像分析/生成
 */

import type { NodeConfig, ImageNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

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

      // 处理提示词中的变量
      const processedPrompt = replaceVariables(prompt, context)

      // 获取图片信息
      const imageInfos = await Promise.all(
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

      // 如果有提示词，进行图像分析
      let analysis: string | undefined
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      if (processedPrompt.trim() && files.length > 0) {
        const aiConfig = await this.getAIConfig(context)

        if (aiConfig) {
          const result = await this.analyzeImages(
            imageInfos,
            processedPrompt,
            aiConfig
          )
          analysis = result.analysis
          tokenUsage = result.tokenUsage
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

  /**
   * 获取图片信息
   */
  private async getImageInfo(url: string): Promise<{
    width?: number
    height?: number
    format?: string
  }> {
    // 简单实现：从 URL 或 MIME 类型推断格式
    const format = this.detectFormat(url)
    return { format }

    // TODO: 实际获取图片尺寸需要加载图片或使用图片处理库
  }

  /**
   * 检测图片格式
   */
  private detectFormat(url: string): string {
    const lower = url.toLowerCase()
    if (lower.includes('.png')) return 'png'
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'jpeg'
    if (lower.includes('.gif')) return 'gif'
    if (lower.includes('.webp')) return 'webp'
    if (lower.includes('.svg')) return 'svg'
    return 'unknown'
  }

  /**
   * 使用 AI 分析图片
   */
  private async analyzeImages(
    images: Array<{ name: string; url: string }>,
    prompt: string,
    aiConfig: AIConfigCache
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    // 构建多模态消息
    // 注意：这里使用的是支持视觉的模型 API 格式
    const imageDescriptions = images
      .map((img, idx) => `图片 ${idx + 1}: ${img.name}`)
      .join('\n')

    const systemPrompt = `你是一个专业的图像分析助手。用户会提供图片信息和分析要求，请根据要求进行分析。

当前导入的图片：
${imageDescriptions}

注意：由于技术限制，你可能无法直接看到图片内容。请根据用户的描述和要求提供分析建议。`

    // 调用 AI
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

  /**
   * 获取 AI 配置
   */
  private async getAIConfig(
    context: ExecutionContext
  ): Promise<AIConfigCache | null> {
    // 尝试使用缓存的默认配置
    for (const [, config] of context.aiConfigs) {
      return config
    }

    // 从数据库加载默认配置
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
      apiKey: decryptApiKey(apiKey.keyEncrypted),
      defaultModel: apiKey.defaultModel,
    }

    context.aiConfigs.set(apiKey.id, config)
    return config
  }
}

export const imageNodeProcessor = new ImageNodeProcessor()
