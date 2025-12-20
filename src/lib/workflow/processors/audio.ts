/**
 * 音频节点处理器
 * 处理音频导入、语音转文字、音频分析
 */

import type { NodeConfig, AudioNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import type { ContentPart, ChatMessage } from '@/lib/ai/types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

interface AudioInfo {
  name: string
  url: string
  type?: string
  size?: number
  format: string
}

const AUDIO_MULTIMODAL_MODELS = [
  'qwen3-omni', 'qwen2-audio',
  'gemini-1.5', 'gemini-2',
  'gpt-4o-audio',
]

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
      const processingOptions = audioNode.config?.processingOptions || {}

      const processedPrompt = replaceVariables(prompt, context)

      const audioInfos: AudioInfo[] = files.map((file) => ({
        name: file.name,
        url: file.url,
        type: file.type,
        size: file.size,
        format: this.detectFormat(file.name),
      }))

      let analysis: string | undefined
      let transcription: string | undefined
      let transcriptions: Array<{ name: string; text: string }> = []
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      if (files.length > 0) {
        const aiConfig = await this.getAIConfig(context)

        if (aiConfig) {
          const shouldTranscribe = processingOptions.transcribe ||
            processedPrompt.includes('转录') ||
            processedPrompt.includes('转文字') ||
            processedPrompt.includes('transcrib') ||
            processedPrompt.includes('speech to text')

          if (shouldTranscribe) {
            const transcribeResults = await this.transcribeAudios(
              audioInfos,
              processingOptions.language,
              aiConfig
            )
            transcriptions = transcribeResults
            transcription = transcribeResults.map(t => t.text).join('\n\n')
          }

          if (processedPrompt.trim()) {
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
          transcriptions,
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

  private detectFormat(fileName: string): string {
    const lower = fileName.toLowerCase()
    if (lower.endsWith('.mp3')) return 'mp3'
    if (lower.endsWith('.wav')) return 'wav'
    if (lower.endsWith('.ogg')) return 'ogg'
    if (lower.endsWith('.m4a')) return 'm4a'
    if (lower.endsWith('.aac')) return 'aac'
    if (lower.endsWith('.flac')) return 'flac'
    if (lower.endsWith('.wma')) return 'wma'
    if (lower.endsWith('.webm')) return 'webm'
    return 'unknown'
  }

  private async transcribeAudios(
    audios: AudioInfo[],
    language: string | undefined,
    aiConfig: AIConfigCache
  ): Promise<Array<{ name: string; text: string }>> {
    const { aiService } = await import('@/lib/ai')
    const results: Array<{ name: string; text: string }> = []

    const transcribeModel = this.getTranscribeModel(aiConfig)

    for (const audio of audios) {
      try {
        const response = await aiService.transcribeAudioFromUrl(
          aiConfig.provider,
          audio.url,
          {
            model: transcribeModel,
            language: language,
            responseFormat: 'json',
          },
          aiConfig.apiKey,
          aiConfig.baseUrl
        )

        results.push({
          name: audio.name,
          text: response.text,
        })
      } catch (error) {
        console.error(`Failed to transcribe audio ${audio.name}:`, error)
        results.push({
          name: audio.name,
          text: `[转录失败: ${error instanceof Error ? error.message : '未知错误'}]`,
        })
      }
    }

    return results
  }

  private getTranscribeModel(aiConfig: AIConfigCache): string {
    const providerModels: Record<string, string> = {
      'OPENAI': 'whisper-1',
      'OPENROUTER': 'openai/whisper-1',
      'SHENSUAN': 'whisper-1',
      'ALIYUN_TONGYI': 'paraformer-realtime-v2',
      'BAIDU_WENXIN': 'speech-to-text',
      'XUNFEI_SPARK': 'iat',
    }

    return providerModels[aiConfig.provider] || 'whisper-1'
  }

  private isAudioMultimodalModel(modelId: string): boolean {
    const lower = modelId.toLowerCase()
    return AUDIO_MULTIMODAL_MODELS.some(m => lower.includes(m.toLowerCase()))
  }

  private async analyzeAudios(
    audios: AudioInfo[],
    prompt: string,
    aiConfig: AIConfigCache,
    transcription?: string
  ): Promise<{
    analysis: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    const { aiService } = await import('@/lib/ai')
    const supportsDirectAudio = this.isAudioMultimodalModel(aiConfig.defaultModel)

    const audioDescriptions = audios
      .map((a, idx) => `音频 ${idx + 1}: ${a.name} (格式: ${a.format})`)
      .join('\n')

    if (supportsDirectAudio) {
      const contentParts: ContentPart[] = [
        {
          type: 'text',
          text: `请分析以下音频内容。

音频信息：
${audioDescriptions}

${transcription ? `已有转录文本：\n${transcription}\n\n` : ''}用户要求：${prompt}`
        }
      ]

      for (const audio of audios) {
        const audioFormat = audio.format === 'mp3' ? 'mp3' : 'wav'
        try {
          const response = await fetch(audio.url)
          const arrayBuffer = await response.arrayBuffer()
          const base64Data = Buffer.from(arrayBuffer).toString('base64')
          
          contentParts.push({
            type: 'input_audio',
            input_audio: {
              data: base64Data,
              format: audioFormat as 'mp3' | 'wav'
            }
          })
        } catch (error) {
          console.error(`Failed to fetch audio ${audio.name}:`, error)
        }
      }

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: '你是一个专业的音频内容分析助手。请仔细聆听用户提供的音频，并根据用户的要求进行分析。'
        },
        {
          role: 'user',
          content: contentParts
        }
      ]

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

    let systemPrompt = `你是一个专业的音频内容分析助手。用户会提供音频信息和分析要求，请根据要求提供分析。

当前导入的音频：
${audioDescriptions}`

    if (transcription) {
      systemPrompt += `

音频转录文本：
${transcription}`
    } else {
      systemPrompt += `

注意：当前使用的模型不支持直接分析音频内容。如需音频分析，建议：
1. 切换到支持音频多模态的模型（如 qwen3-omni、qwen2-audio、gemini-1.5 等）
2. 或先启用转录功能获取文本后再进行分析`
    }

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
      apiKey: decryptApiKey(apiKey.keyEncrypted),
      defaultModel: apiKey.defaultModel,
    }

    context.aiConfigs.set(apiKey.id, config)
    return config
  }
}

export const audioNodeProcessor = new AudioNodeProcessor()
