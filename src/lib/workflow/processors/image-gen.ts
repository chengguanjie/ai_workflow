/**
 * 图像生成节点处理器
 * 使用 AI 生成图像
 */

import type { NodeConfig, ImageGenNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

interface ImageGenerationResult {
  url: string
  revisedPrompt?: string
  b64_json?: string
}

export class ImageGenNodeProcessor implements NodeProcessor {
  nodeType = 'IMAGE_GEN'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const imageGenNode = node as ImageGenNodeConfig
    const config = imageGenNode.config || {}

    try {
      // 处理提示词中的变量引用
      const prompt = replaceVariables(config.prompt || '', context)

      if (!prompt.trim()) {
        throw new Error('图像生成提示词不能为空')
      }

      const negativePrompt = config.negativePrompt
        ? replaceVariables(config.negativePrompt, context)
        : undefined

      // 获取图像生成 API 配置
      const apiConfig = await this.getImageGenConfig(
        config.aiConfigId,
        config.provider,
        context
      )

      if (!apiConfig) {
        throw new Error('未配置图像生成服务')
      }

      // 调用图像生成 API
      const images = await this.generateImages(
        prompt,
        {
          negativePrompt,
          model: config.imageModel,
          size: config.size || '1024x1024',
          quality: config.quality || 'standard',
          n: config.n || 1,
          style: config.style,
          referenceImageUrl: config.referenceImageUrl,
        },
        apiConfig
      )

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          images: images.map((img, index) => ({
            url: img.url,
            revisedPrompt: img.revisedPrompt,
            index,
          })),
          imageCount: images.length,
          prompt,
          model: config.imageModel || apiConfig.defaultModel,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '图像生成失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 获取图像生成 API 配置
   */
  private async getImageGenConfig(
    configId: string | undefined,
    provider: string | undefined,
    context: ExecutionContext
  ): Promise<{
    provider: string
    apiKey: string
    baseUrl?: string
    defaultModel: string
  } | null> {
    // 先尝试使用指定的配置 ID
    if (configId) {
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          id: configId,
          organizationId: context.organizationId,
          isActive: true,
        },
      })

      if (apiKey) {
        return {
          provider: apiKey.provider,
          apiKey: decryptApiKey(apiKey.keyEncrypted),
          baseUrl: apiKey.baseUrl,
          defaultModel: apiKey.defaultModel,
        }
      }
    }

    // 尝试查找支持图像生成的服务商
    const supportedProviders = ['OPENAI', 'STABILITYAI', 'ALIYUN_TONGYI']
    const preferredProvider = provider || 'OPENAI'

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        organizationId: context.organizationId,
        provider: preferredProvider as 'OPENAI' | 'SHENSUAN' | 'OPENROUTER',
        isActive: true,
      },
    })

    if (apiKey && supportedProviders.includes(apiKey.provider)) {
      return {
        provider: apiKey.provider,
        apiKey: decryptApiKey(apiKey.keyEncrypted),
        baseUrl: apiKey.baseUrl,
        defaultModel: apiKey.defaultModel,
      }
    }

    return null
  }

  /**
   * 调用图像生成 API
   */
  private async generateImages(
    prompt: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      quality?: string
      n?: number
      style?: string
      referenceImageUrl?: string
    },
    apiConfig: {
      provider: string
      apiKey: string
      baseUrl?: string
      defaultModel: string
    }
  ): Promise<ImageGenerationResult[]> {
    switch (apiConfig.provider) {
      case 'OPENAI':
        return this.generateOpenAIImages(prompt, options, apiConfig)
      case 'STABILITYAI':
        return this.generateStabilityAIImages(prompt, options, apiConfig)
      default:
        // 默认使用 OpenAI 兼容接口
        return this.generateOpenAIImages(prompt, options, apiConfig)
    }
  }

  /**
   * OpenAI DALL-E 图像生成
   */
  private async generateOpenAIImages(
    prompt: string,
    options: {
      model?: string
      size?: string
      quality?: string
      n?: number
      style?: string
    },
    apiConfig: {
      apiKey: string
      baseUrl?: string
      defaultModel: string
    }
  ): Promise<ImageGenerationResult[]> {
    const baseUrl = apiConfig.baseUrl || 'https://api.openai.com/v1'
    const model = options.model || 'dall-e-3'

    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      n: options.n || 1,
      size: options.size || '1024x1024',
    }

    // DALL-E 3 特有参数
    if (model === 'dall-e-3') {
      requestBody.quality = options.quality || 'standard'
      if (options.style) {
        requestBody.style = options.style
      }
    }

    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`OpenAI 图像生成失败: ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()

    return data.data.map((item: { url?: string; b64_json?: string; revised_prompt?: string }) => ({
      url: item.url || '',
      revisedPrompt: item.revised_prompt,
      b64_json: item.b64_json,
    }))
  }

  /**
   * Stability AI 图像生成
   */
  private async generateStabilityAIImages(
    prompt: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      n?: number
      style?: string
    },
    apiConfig: {
      apiKey: string
      baseUrl?: string
    }
  ): Promise<ImageGenerationResult[]> {
    const baseUrl = apiConfig.baseUrl || 'https://api.stability.ai/v1'
    const model = options.model || 'stable-diffusion-xl-1024-v1-0'

    // 解析尺寸
    const [width, height] = (options.size || '1024x1024').split('x').map(Number)

    const requestBody = {
      text_prompts: [
        { text: prompt, weight: 1 },
        ...(options.negativePrompt
          ? [{ text: options.negativePrompt, weight: -1 }]
          : []),
      ],
      cfg_scale: 7,
      height,
      width,
      samples: options.n || 1,
      steps: 30,
    }

    const response = await fetch(`${baseUrl}/generation/${model}/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`Stability AI 图像生成失败: ${error.message || response.statusText}`)
    }

    const data = await response.json()

    return data.artifacts.map((item: { base64: string }) => ({
      url: `data:image/png;base64,${item.base64}`,
      b64_json: item.base64,
    }))
  }
}

export const imageGenNodeProcessor = new ImageGenNodeProcessor()
