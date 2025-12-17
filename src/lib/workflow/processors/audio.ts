/**
 * 音频节点处理器
 * 处理音频导入、语音转文字、音频分析
 */

import type { NodeConfig, AudioNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

export class AudioNodeProcessor implements NodeProcessor {
  nodeType = 'AUDIO'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const audioNode = node as AudioNodeConfig

    try {
      const files = audioNode.config?.files || []
      const prompt = audioNode.config?.prompt || ''

      // 处理提示词中的变量
      const processedPrompt = replaceVariables(prompt, context)

      // 获取音频信息
      const audioInfos = files.map((file) => ({
        name: file.name,
        url: file.url,
        type: file.type,
        size: file.size,
        format: this.detectFormat(file.name),
      }))

      // 如果有提示词，进行音频内容分析
      let analysis: string | undefined
      let transcription: string | undefined
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      if (processedPrompt.trim() && files.length > 0) {
        const aiConfig = await this.getAIConfig(context)

        if (aiConfig) {
          // 检查是否需要转录
          if (processedPrompt.includes('转录') || processedPrompt.includes('转文字') || processedPrompt.includes('transcrib')) {
            // TODO: 调用语音转文字 API
            transcription = '[语音转文字功能待实现]'
          }

          const result = await this.analyzeAudios(
            audioInfos,
            processedPrompt,
            aiConfig,
            transcription
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
          audios: audioInfos,
          count: files.length,
          transcription,
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
        error: error instanceof Error ? error.message : '音频处理失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 检测音频格式
   */
  private detectFormat(fileName: string): string {
    const lower = fileName.toLowerCase()
    if (lower.endsWith('.mp3')) return 'mp3'
    if (lower.endsWith('.wav')) return 'wav'
    if (lower.endsWith('.ogg')) return 'ogg'
    if (lower.endsWith('.m4a')) return 'm4a'
    if (lower.endsWith('.aac')) return 'aac'
    if (lower.endsWith('.flac')) return 'flac'
    if (lower.endsWith('.wma')) return 'wma'
    return 'unknown'
  }

  /**
   * 使用 AI 分析音频
   */
  private async analyzeAudios(
    audios: Array<{ name: string; url: string; format: string }>,
    prompt: string,
    aiConfig: AIConfigCache,
    transcription?: string
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const audioDescriptions = audios
      .map((a, idx) => `音频 ${idx + 1}: ${a.name} (格式: ${a.format})`)
      .join('\n')

    let systemPrompt = `你是一个专业的音频内容分析助手。用户会提供音频信息和分析要求，请根据要求提供分析建议。

当前导入的音频：
${audioDescriptions}`

    if (transcription) {
      systemPrompt += `\n\n音频转录文本：
${transcription}`
    }

    systemPrompt += `\n\n注意：如果没有转录文本，你可能无法直接分析音频内容。请根据用户的描述和要求提供分析框架和建议。`

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

export const audioNodeProcessor = new AudioNodeProcessor()
