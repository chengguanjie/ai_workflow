/**
 * 图像生成节点处理器
 * 使用 AI 生成图像，支持文生图和图生图
 */

import type { NodeConfig, ImageGenNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'

interface ImageGenerationResult {
  url: string
  revisedPrompt?: string
  b64_json?: string
}

const DEFAULT_SHENSUAN_BASE_URL = 'https://router.shengsuanyun.com/api/v1'

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
      const prompt = replaceVariables(config.prompt || '', context)

      if (!prompt.trim()) {
        throw new Error('图像生成提示词不能为空')
      }

      const negativePrompt = config.negativePrompt
        ? replaceVariables(config.negativePrompt, context)
        : undefined

      const referenceImageUrl = config.referenceImageUrl
        ? replaceVariables(config.referenceImageUrl, context)
        : undefined

      const apiConfig = await this.getImageGenConfig(
        config.aiConfigId,
        config.provider,
        context
      )

      if (!apiConfig) {
        throw new Error('未配置图像生成服务')
      }

      let images: ImageGenerationResult[]
      let mode: 'text-to-image' | 'image-to-image' = 'text-to-image'

      if (referenceImageUrl) {
        mode = 'image-to-image'
        images = await this.generateImageToImage(
          prompt,
          referenceImageUrl,
          {
            negativePrompt,
            model: config.imageModel,
            size: config.size || '1024x1024',
            n: config.n || 1,
            imageStrength: config.imageStrength,
          },
          apiConfig
        )
      } else {
        images = await this.generateImages(
          prompt,
          {
            negativePrompt,
            model: config.imageModel,
            size: config.size || '1024x1024',
            quality: config.quality || 'standard',
            n: config.n || 1,
            style: config.style,
          },
          apiConfig
        )
      }

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
          mode,
          referenceImageUrl: referenceImageUrl || undefined,
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
          apiKey: safeDecryptApiKey(apiKey.keyEncrypted),
          baseUrl: apiKey.baseUrl,
          defaultModel: apiKey.defaultModel,
        }
      }
    }

    const supportedProviders = ['SHENSUAN', 'OPENAI', 'STABILITYAI', 'ALIYUN_TONGYI']
    const preferredProvider = provider || 'SHENSUAN'

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
        apiKey: safeDecryptApiKey(apiKey.keyEncrypted),
        baseUrl: apiKey.baseUrl,
        defaultModel: apiKey.defaultModel,
      }
    }

    return null
  }

  private async generateImages(
    prompt: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      quality?: string
      n?: number
      style?: string
    },
    apiConfig: {
      provider: string
      apiKey: string
      baseUrl?: string
      defaultModel: string
    }
  ): Promise<ImageGenerationResult[]> {
    switch (apiConfig.provider) {
      case 'SHENSUAN':
        return this.generateShensuanImages(prompt, options, apiConfig)
      case 'OPENAI':
        return this.generateOpenAIImages(prompt, options, apiConfig)
      case 'STABILITYAI':
        return this.generateStabilityAIImages(prompt, options, apiConfig)
      default:
        return this.generateShensuanImages(prompt, options, apiConfig)
    }
  }

  private async generateImageToImage(
    prompt: string,
    referenceImageUrl: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      n?: number
      imageStrength?: number
    },
    apiConfig: {
      provider: string
      apiKey: string
      baseUrl?: string
      defaultModel: string
    }
  ): Promise<ImageGenerationResult[]> {
    switch (apiConfig.provider) {
      case 'SHENSUAN':
        return this.generateShensuanImageEdit(prompt, referenceImageUrl, options, apiConfig)
      case 'STABILITYAI':
        return this.generateStabilityAIImageToImage(prompt, referenceImageUrl, options, apiConfig)
      default:
        return this.generateShensuanImageEdit(prompt, referenceImageUrl, options, apiConfig)
    }
  }

  private async generateShensuanImages(
    prompt: string,
    options: {
      negativePrompt?: string
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
    const baseUrl = apiConfig.baseUrl || DEFAULT_SHENSUAN_BASE_URL
    const model = options.model || 'openai/dall-e-3'

    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      n: options.n || 1,
      size: options.size || '1024x1024',
    }

    if (options.quality) {
      requestBody.quality = options.quality
    }
    if (options.style) {
      requestBody.style = options.style
    }
    if (options.negativePrompt) {
      requestBody.negative_prompt = options.negativePrompt
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
      throw new Error(`胜算云图像生成失败: ${error.error?.message || error.message || response.statusText}`)
    }

    const data = await response.json()

    return data.data.map((item: { url?: string; b64_json?: string; revised_prompt?: string }) => ({
      url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
      revisedPrompt: item.revised_prompt,
      b64_json: item.b64_json,
    }))
  }

  private async generateShensuanImageEdit(
    prompt: string,
    imageUrl: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      n?: number
    },
    apiConfig: {
      apiKey: string
      baseUrl?: string
    }
  ): Promise<ImageGenerationResult[]> {
    const baseUrl = apiConfig.baseUrl || DEFAULT_SHENSUAN_BASE_URL
    const model = options.model || 'ali/qwen-image-edit'

    const [width, height] = (options.size || '1024x1024').split('x').map(Number)

    const requestBody: Record<string, unknown> = {
      model,
      image_url: imageUrl,
      prompt,
      num_images: options.n || 1,
      resolution: `${width}*${height}`,
      add_watermark: false,
    }

    if (options.negativePrompt) {
      requestBody.negative_prompt = options.negativePrompt
    }

    const response = await fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`胜算云图像编辑失败: ${error.error?.message || error.message || response.statusText}`)
    }

    const data = await response.json()

    if (data.data && Array.isArray(data.data)) {
      return data.data.map((item: { url?: string; b64_json?: string }) => ({
        url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
        b64_json: item.b64_json,
      }))
    }

    if (data.images && Array.isArray(data.images)) {
      return data.images.map((item: { url?: string }) => ({
        url: item.url || '',
      }))
    }

    throw new Error('图像编辑返回格式异常')
  }

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

  private async generateStabilityAIImages(
    prompt: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      n?: number
    },
    apiConfig: {
      apiKey: string
      baseUrl?: string
    }
  ): Promise<ImageGenerationResult[]> {
    const baseUrl = apiConfig.baseUrl || 'https://api.stability.ai/v1'
    const model = options.model || 'stable-diffusion-xl-1024-v1-0'

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

  private async generateStabilityAIImageToImage(
    prompt: string,
    imageUrl: string,
    options: {
      negativePrompt?: string
      model?: string
      size?: string
      n?: number
      imageStrength?: number
    },
    apiConfig: {
      apiKey: string
      baseUrl?: string
    }
  ): Promise<ImageGenerationResult[]> {
    const baseUrl = apiConfig.baseUrl || 'https://api.stability.ai/v1'
    const model = options.model || 'stable-diffusion-xl-1024-v1-0'

    let imageBase64: string
    if (imageUrl.startsWith('data:')) {
      imageBase64 = imageUrl.split(',')[1]
    } else {
      const imageResponse = await fetch(imageUrl)
      const imageBuffer = await imageResponse.arrayBuffer()
      imageBase64 = Buffer.from(imageBuffer).toString('base64')
    }

    const requestBody = {
      text_prompts: [
        { text: prompt, weight: 1 },
        ...(options.negativePrompt
          ? [{ text: options.negativePrompt, weight: -1 }]
          : []),
      ],
      init_image: imageBase64,
      init_image_mode: 'IMAGE_STRENGTH',
      image_strength: options.imageStrength ?? 0.35,
      cfg_scale: 7,
      samples: options.n || 1,
      steps: 30,
    }

    const response = await fetch(`${baseUrl}/generation/${model}/image-to-image`, {
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
      throw new Error(`Stability AI 图生图失败: ${error.message || response.statusText}`)
    }

    const data = await response.json()

    return data.artifacts.map((item: { base64: string }) => ({
      url: `data:image/png;base64,${item.base64}`,
      b64_json: item.base64,
    }))
  }
}

export const imageGenNodeProcessor = new ImageGenNodeProcessor()
