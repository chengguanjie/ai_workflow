/**
 * 视频节点处理器
 * 处理视频导入和视频内容分析
 */

import type { NodeConfig, VideoNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

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

      // 处理提示词中的变量
      const processedPrompt = replaceVariables(prompt, context)

      // 获取视频信息
      const videoInfos = files.map((file) => ({
        name: file.name,
        url: file.url,
        type: file.type,
        size: file.size,
        format: this.detectFormat(file.name),
      }))

      // 如果有提示词，进行视频内容分析
      let analysis: string | undefined
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      if (processedPrompt.trim() && files.length > 0) {
        const aiConfig = await this.getAIConfig(context)

        if (aiConfig) {
          const result = await this.analyzeVideos(
            videoInfos,
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
          videos: videoInfos,
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
        error: error instanceof Error ? error.message : '视频处理失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 检测视频格式
   */
  private detectFormat(fileName: string): string {
    const lower = fileName.toLowerCase()
    if (lower.endsWith('.mp4')) return 'mp4'
    if (lower.endsWith('.webm')) return 'webm'
    if (lower.endsWith('.mov')) return 'mov'
    if (lower.endsWith('.avi')) return 'avi'
    if (lower.endsWith('.mkv')) return 'mkv'
    if (lower.endsWith('.flv')) return 'flv'
    return 'unknown'
  }

  /**
   * 使用 AI 分析视频
   */
  private async analyzeVideos(
    videos: Array<{ name: string; url: string; format: string }>,
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

注意：由于技术限制，你可能无法直接观看视频内容。请根据用户的描述和要求提供分析框架和建议。`

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
