// 胜算云 API Provider (OpenAI 兼容)

import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  Model,
  TranscriptionOptions,
  TranscriptionResponse,
  ContentPart,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  TTSRequest,
  TTSResponse,
  EmbeddingRequest,
  EmbeddingResponse
} from '../types'
import { getModelModality } from '../types'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

const DEFAULT_SHENSUAN_BASE_URL = process.env.SHENSUAN_BASE_URL || 'https://router.shengsuanyun.com/api/v1'

function getNetworkTroubleshootingHint(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('client network socket disconnected before secure tls connection was established')) {
    return '提示：这通常是网络/代理/IPv6 解析导致的 TLS 握手失败；可尝试切换网络、配置代理环境变量，或在启动前设置 `NODE_OPTIONS=--dns-result-order=ipv4first`。'
  }
  if (lower.includes('enotfound') || lower.includes('eai_again')) {
    return '提示：域名解析失败，请检查网络、DNS 或代理设置。'
  }
  if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('etimedout')) {
    return '提示：连接失败/超时，请检查网络、防火墙或代理设置。'
  }
  return ''
}

export class ShensuanProvider implements AIProvider {
  name = 'shensuan'

  async chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse> {
    // 检查是否误用了生成类模型（视频/图片生成）
    const modality = getModelModality(request.model)
    if (modality === 'video-gen' || modality === 'image-gen') {
      throw new Error(
        `模型配置错误：模型 '${request.model}' 是媒体生成模型（${modality === 'video-gen' ? '视频' : '图片'}），不支持文本对话/处理任务。` +
        `请在节点配置中选择文本或对话模型（如 Claude, GPT, Gemini Pro 等）。`
      )
    }

    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const messages = request.messages.map(m => ({
      role: m.role,
      content: this.normalizeContent(m.content)
    }))

    const response = await fetchWithTimeout(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: false,
      }),
      timeoutMs: 90_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Shensuan API error: ${response.status} - ${error}`)
    }

    // 检查响应是否为 JSON
    const contentType = response.headers.get('content-type') || ''
    const responseText = await response.text()

    // 只有当响应明确是 HTML（以 < 开头）且 content-type 不包含 json 时才报错
    const trimmedResponse = responseText.trim()
    if (trimmedResponse.startsWith('<') && !contentType.includes('json')) {
      // 返回了 HTML 页面而不是 JSON
      const preview = responseText.slice(0, 200)
      throw new Error(
        `API 返回了 HTML 页面而不是 JSON 数据。这通常是由于：\n` +
        `1. API 端点配置错误\n` +
        `2. 代理/网关问题\n` +
        `3. API 服务暂时不可用\n` +
        `请检查 AI 配置中的 Base URL 是否正确。\n` +
        `响应预览: ${preview}...`
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch {
      throw new Error(`API 响应不是有效的 JSON: ${responseText.slice(0, 200)}...`)
    }

    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      finishReason: data.choices?.[0]?.finish_reason || 'stop',
      model: data.model,
    }
  }

  async listModels(apiKey: string, baseUrl?: string): Promise<Model[]> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL
    const response = await fetchWithTimeout(`${url}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeoutMs: 30_000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const data = await response.json()

    return data.data.map((model: { id: string }) => ({
      id: model.id,
      name: model.id,
      provider: 'shensuan',
      supportsVision: this.isVisionModel(model.id),
      supportsAudio: this.isAudioModel(model.id),
      supportsVideo: this.isVideoModel(model.id),
    }))
  }

  async transcribeAudio(
    audioData: ArrayBuffer,
    options: TranscriptionOptions,
    apiKey: string,
    baseUrl?: string
  ): Promise<TranscriptionResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const base64Audio = Buffer.from(audioData).toString('base64')
    const mimeType = this.detectAudioMimeType(options.model || 'audio.mp3')
    const dataUrl = `data:${mimeType};base64,${base64Audio}`

    const response = await fetchWithTimeout(`${url}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'openai/whisper-1',
        file: dataUrl,
        language: options.language,
        prompt: options.prompt,
        response_format: options.responseFormat || 'json',
      }),
      timeoutMs: 120_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Transcription API error: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      text: data.text || '',
      language: data.language,
      duration: data.duration,
      segments: data.segments?.map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
    }
  }

  async transcribeAudioFromUrl(
    audioUrl: string,
    options: TranscriptionOptions,
    apiKey: string,
    baseUrl?: string
  ): Promise<TranscriptionResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const response = await fetchWithTimeout(`${url}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'openai/whisper-1',
        file: audioUrl,
        language: options.language,
        prompt: options.prompt,
        response_format: options.responseFormat || 'json',
      }),
      timeoutMs: 120_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Transcription API error: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      text: data.text || '',
      language: data.language,
      duration: data.duration,
      segments: data.segments?.map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
    }
  }

  /**
   * 图片生成
   */
  async generateImage(
    request: ImageGenerationRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ImageGenerationResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    // 检查是否需要使用 Tasks API (豆包/通义等模型)
    if (this.isTasksAPIImageModel(request.model)) {
      return this.generateImageWithTasksAPI(request, apiKey, url)
    }

    // 使用标准 /images/generations 端点
    const endpoint = `${url}/images/generations`
    console.log('[Shensuan] 图片生成请求:', {
      endpoint,
      model: request.model,
      prompt: request.prompt?.slice(0, 100) + '...',
      size: request.size,
      n: request.n
    })

    let response: Response
    try {
      response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          negative_prompt: request.negativePrompt,
          n: request.n || 1,
          size: request.size || '1024x1024',
          quality: request.quality,
          style: request.style,
          response_format: request.responseFormat || 'url',
        }),
        timeoutMs: 120_000, // 图片生成可能需要较长时间
      })
    } catch (fetchError) {
      console.error('[Shensuan] 图片生成网络请求失败:', fetchError)
      const errorMsg = fetchError instanceof Error ? fetchError.message : '网络请求失败'
      const hint = getNetworkTroubleshootingHint(errorMsg)
      throw new Error(`图片生成请求失败: ${errorMsg}。端点: ${endpoint}${hint ? `\n${hint}` : ''}`)
    }

    if (!response.ok) {
      const error = await response.text()
      console.error('[Shensuan] 图片生成 API 返回错误:', response.status, error)
      throw new Error(`图片生成 API 错误: ${response.status} - ${error}`)
    }

    const data = await response.json()
    console.log('[Shensuan] 图片生成响应:', JSON.stringify(data).slice(0, 500))

    return {
      images: data.data?.map((img: { url?: string; b64_json?: string; revised_prompt?: string }) => ({
        url: img.url,
        b64_json: img.b64_json,
        revisedPrompt: img.revised_prompt,
      })) || [],
      model: data.model || request.model,
      usage: data.usage ? {
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }

  /**
   * 使用异步任务 API 生成图片 (支持 Gemini/豆包/通义等模型)
   */
  private async generateImageWithTasksAPI(
    request: ImageGenerationRequest,
    apiKey: string,
    baseUrl: string
  ): Promise<ImageGenerationResponse> {
    const modelType = this.getTaskImageModelType(request.model)
    const requestedCount = request.n || 1
    console.log('[Shensuan] 使用 Tasks API 生成图片:', request.model, '类型:', modelType, '数量:', requestedCount)

    // 检查是否需要循环调用（不原生支持多图的模型）
    const needsLoop = this.needsLoopForMultipleImages(modelType)

    if (needsLoop && requestedCount > 1) {
      // 对于不原生支持多图的模型，并行循环调用
      return this.generateMultipleImagesWithLoop(request, apiKey, baseUrl, modelType, requestedCount)
    }

    // 原生支持多图或只需要生成一张
    return this.generateSingleBatchImages(request, apiKey, baseUrl, modelType)
  }

  /**
   * 检查模型是否需要循环调用来生成多张图片
   */
  private needsLoopForMultipleImages(modelType: 'gemini' | 'doubao' | 'qwen' | 'unknown'): boolean {
    // Gemini 不原生支持多图，需要循环调用
    // 豆包使用 sequential_image_generation_options.max_count
    // 通义使用 n 参数
    return modelType === 'gemini'
  }

  /**
   * 循环调用 API 生成多张图片（并行执行）
   */
  private async generateMultipleImagesWithLoop(
    request: ImageGenerationRequest,
    apiKey: string,
    baseUrl: string,
    modelType: 'gemini' | 'doubao' | 'qwen' | 'unknown',
    count: number
  ): Promise<ImageGenerationResponse> {
    console.log(`[Shensuan] 循环生成 ${count} 张图片 (并行执行)`)

    // 创建单图请求
    const singleRequest = { ...request, n: 1 }

    // 并行发起所有请求
    const promises = Array.from({ length: count }, (_, index) =>
      this.generateSingleBatchImages(singleRequest, apiKey, baseUrl, modelType)
        .then(result => ({ success: true as const, result, index }))
        .catch(error => ({ success: false as const, error, index }))
    )

    const results = await Promise.all(promises)

    // 收集所有成功生成的图片
    const allImages: Array<{ url?: string; b64_json?: string; revisedPrompt?: string }> = []
    const errors: string[] = []

    for (const item of results) {
      if (item.success) {
        allImages.push(...item.result.images)
      } else {
        errors.push(`图片 ${item.index + 1}: ${item.error instanceof Error ? item.error.message : '未知错误'}`)
      }
    }

    console.log(`[Shensuan] 循环生成完成: 成功 ${allImages.length}/${count} 张`)

    if (allImages.length === 0 && errors.length > 0) {
      throw new Error(`所有图片生成都失败了: ${errors.join('; ')}`)
    }

    return {
      images: allImages,
      model: request.model,
    }
  }

  /**
   * 单次批量生成图片（原生 API 调用）
   */
  private async generateSingleBatchImages(
    request: ImageGenerationRequest,
    apiKey: string,
    baseUrl: string,
    modelType: 'gemini' | 'doubao' | 'qwen' | 'unknown'
  ): Promise<ImageGenerationResponse> {
    // 根据不同模型构建请求体
    const requestBody = this.buildTaskImageRequestBody(request, modelType)

    const url = `${baseUrl}/tasks/generations`
    console.log('[Shensuan] 图片生成请求 URL:', url)
    console.log('[Shensuan] 图片生成请求体:', JSON.stringify(requestBody, null, 2))

    // 提交异步任务
    let submitResponse: Response
    try {
      submitResponse = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        timeoutMs: 60_000,
      })
    } catch (fetchError) {
      console.error('[Shensuan] 图片生成请求失败:', fetchError)
      const errorMessage = fetchError instanceof Error ? fetchError.message : '未知错误'
      throw new Error(`图片生成请求失败: ${errorMessage}。请检查网络连接和 API 配置。URL: ${url}`)
    }

    if (!submitResponse.ok) {
      const error = await submitResponse.text()
      throw new Error(`图片生成任务提交失败: ${submitResponse.status} - ${error}`)
    }

    const submitData = await submitResponse.json()
    console.log('[Shensuan] 图片任务已提交:', JSON.stringify(submitData).slice(0, 200))

    // 获取任务 ID
    const taskId = submitData.id || submitData.task_id
    if (!taskId) {
      // 如果是同步返回结果
      if (submitData.data || submitData.images || submitData.output) {
        return this.parseTaskImageResponse(submitData, request.model)
      }
      throw new Error('图片生成未返回任务 ID 或结果')
    }

    // 轮询等待任务完成
    return this.waitForTaskImageCompletion(taskId, apiKey, baseUrl, request.model)
  }

  /**
   * 获取任务图片模型类型
   */
  private getTaskImageModelType(modelId: string): 'gemini' | 'doubao' | 'qwen' | 'unknown' {
    const lower = modelId.toLowerCase()
    if (lower.includes('gemini')) return 'gemini'
    if (lower.includes('doubao') || lower.includes('seedream')) return 'doubao'
    if (lower.includes('qwen') || lower.includes('ali/')) return 'qwen'
    return 'unknown'
  }

  /**
   * 根据模型类型构建请求体
   */
  private buildTaskImageRequestBody(
    request: ImageGenerationRequest,
    modelType: 'gemini' | 'doubao' | 'qwen' | 'unknown'
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
    }

    switch (modelType) {
      case 'gemini': {
        // Gemini: aspect_ratio, size (1K/2K), response_modalities
        const { aspectRatio, size } = this.parseImageSizeForGemini(request.size || '1024x1024')
        return {
          ...base,
          aspect_ratio: aspectRatio,
          size: size,
          response_modalities: ['IMAGE'],
        }
      }

      case 'doubao': {
        // 豆包: size (2048x2048), image (参考图数组), watermark, sequential_image_generation
        return {
          ...base,
          size: request.size || '1024x1024',
          watermark: false,
          sequential_image_generation: 'auto',
          sequential_image_generation_options: {
            max_count: request.n || 1,
          },
          // 如果有参考图片
          ...(request.referenceImages?.length ? { image: request.referenceImages } : {}),
        }
      }

      case 'qwen': {
        // 通义: size (1664*928 用星号), n, negative_prompt, prompt_extend, watermark
        const qwenSize = (request.size || '1024x1024').replace('x', '*')
        return {
          ...base,
          size: qwenSize,
          n: request.n || 1,
          negative_prompt: request.negativePrompt || '',
          prompt_extend: true,
          watermark: false,
        }
      }

      default:
        // 默认格式
        return {
          ...base,
          size: request.size || '1024x1024',
          n: request.n || 1,
        }
    }
  }

  /**
   * 等待图片任务完成
   */
  private async waitForTaskImageCompletion(
    taskId: string,
    apiKey: string,
    baseUrl: string,
    model: string
  ): Promise<ImageGenerationResponse> {
    const maxWaitTime = 5 * 60 * 1000 // 5 分钟
    const pollInterval = 3000 // 3 秒
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      const statusResponse = await fetchWithTimeout(`${baseUrl}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeoutMs: 30_000,
      })

      if (!statusResponse.ok) {
        const error = await statusResponse.text()
        throw new Error(`查询图片任务状态失败: ${statusResponse.status} - ${error}`)
      }

      const statusData = await statusResponse.json()
      console.log('[Shensuan] 图片任务状态:', statusData.status)

      const status = statusData.status?.toLowerCase()

      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        return this.parseTaskImageResponse(statusData, model)
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`图片生成失败: ${statusData.error || statusData.message || '未知错误'}`)
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`图片生成超时：已等待 ${maxWaitTime / 1000} 秒`)
  }

  /**
   * 解析图片任务响应
   */
  private parseTaskImageResponse(
    data: Record<string, unknown>,
    model: string
  ): ImageGenerationResponse {
    let images: Array<{ url?: string; b64_json?: string; revisedPrompt?: string }> = []

    // 格式1: { data: [{ url: ... }] }
    if (Array.isArray(data.data)) {
      images = (data.data as Array<{ url?: string; b64_json?: string; revised_prompt?: string }>).map(img => ({
        url: img.url,
        b64_json: img.b64_json,
        revisedPrompt: img.revised_prompt,
      }))
    }
    // 格式2: { images: [url1, url2, ...] } 或 { images: [{ url: ... }] }
    else if (Array.isArray(data.images)) {
      images = (data.images as Array<string | { url?: string }>).map(img => ({
        url: typeof img === 'string' ? img : img.url,
      }))
    }
    // 格式3: { output: { images: [...] } }
    else if (data.output && typeof data.output === 'object') {
      const output = data.output as Record<string, unknown>
      if (Array.isArray(output.images)) {
        images = (output.images as Array<string | { url?: string }>).map(img => ({
          url: typeof img === 'string' ? img : img.url,
        }))
      }
    }
    // 格式4: { result: { images: [...] } }
    else if (data.result && typeof data.result === 'object') {
      const result = data.result as Record<string, unknown>
      if (Array.isArray(result.images)) {
        images = (result.images as Array<string | { url?: string }>).map(img => ({
          url: typeof img === 'string' ? img : img.url,
        }))
      }
    }
    // 格式5: { results: [{ url: ... }] }
    else if (Array.isArray(data.results)) {
      images = (data.results as Array<{ url?: string; image_url?: string }>).map(item => ({
        url: item.url || item.image_url,
      }))
    }

    console.log('[Shensuan] 图片生成完成，共', images.length, '张图片')

    return {
      images,
      model: (data.model as string) || model,
      usage: data.usage ? {
        totalTokens: (data.usage as { total_tokens?: number }).total_tokens,
      } : undefined,
    }
  }

  /**
   * 将图片尺寸解析为 Gemini API 格式
   */
  private parseImageSizeForGemini(size: string): { aspectRatio: string; size: string } {
    // 解析 "1024x1024" 格式
    const match = size.match(/(\d+)[x*](\d+)/)
    if (!match) {
      return { aspectRatio: '1:1', size: '1K' }
    }

    const width = parseInt(match[1])
    const height = parseInt(match[2])

    // 计算宽高比
    let aspectRatio = '1:1'
    const ratio = width / height
    if (ratio > 1.5) {
      aspectRatio = '16:9'
    } else if (ratio < 0.67) {
      aspectRatio = '9:16'
    } else if (ratio > 1.2) {
      aspectRatio = '4:3'
    } else if (ratio < 0.83) {
      aspectRatio = '3:4'
    }

    // 确定分辨率等级
    let sizeLevel = '1K'
    const maxDim = Math.max(width, height)
    if (maxDim >= 2048) {
      sizeLevel = '2K'
    } else if (maxDim >= 1536) {
      sizeLevel = '2K'
    }

    return { aspectRatio, size: sizeLevel }
  }

  /**
   * 检查是否需要使用 Tasks API 的图片生成模型
   * 注意：Gemini 模型暂时使用标准 /images/generations 端点
   */
  private isTasksAPIImageModel(modelId: string): boolean {
    // 暂时只有豆包和通义使用 Tasks API
    // Gemini 改用标准端点测试
    const tasksAPIModels = [
      'bytedance/doubao-seedream',
      'doubao-seedream',
      'ali/qwen-image',
      'qwen-image',
    ]
    const lower = modelId.toLowerCase()
    return tasksAPIModels.some(m => lower.includes(m.toLowerCase()))
  }

  /**
   * 视频生成（提交任务）
   */
  async generateVideo(
    request: VideoGenerationRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<VideoGenerationResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const response = await fetchWithTimeout(`${url}/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        image: request.image,
        duration: request.duration,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
      }),
      timeoutMs: 60_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`视频生成 API 错误: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      taskId: data.id || data.task_id,
      status: this.normalizeVideoStatus(data.status),
      videos: data.videos?.map((v: { url: string; duration: number; format?: string }) => ({
        url: v.url,
        duration: v.duration,
        format: v.format,
      })),
      error: data.error,
    }
  }

  /**
   * 查询视频生成任务状态
   */
  async getVideoTaskStatus(
    taskId: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<VideoGenerationResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const response = await fetchWithTimeout(`${url}/videos/generations/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeoutMs: 30_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`查询视频任务状态错误: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      taskId: data.id || data.task_id || taskId,
      status: this.normalizeVideoStatus(data.status),
      videos: data.videos?.map((v: { url: string; duration: number; format?: string }) => ({
        url: v.url,
        duration: v.duration,
        format: v.format,
      })),
      error: data.error,
    }
  }

  /**
   * 文本转语音
   */
  async textToSpeech(
    request: TTSRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<TTSResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const response = await fetchWithTimeout(`${url}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        input: request.input,
        voice: request.voice || 'alloy',
        speed: request.speed || 1.0,
        response_format: request.responseFormat || 'mp3',
      }),
      timeoutMs: 60_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`TTS API 错误: ${response.status} - ${error}`)
    }

    // TTS 响应可能是 JSON（带 URL）或直接是音频二进制
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const data = await response.json()
      return {
        audio: {
          url: data.url,
          b64_json: data.b64_json,
          format: request.responseFormat || 'mp3',
          duration: data.duration,
        },
      }
    } else {
      // 返回二进制音频，转为 base64
      const arrayBuffer = await response.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return {
        audio: {
          b64_json: base64,
          format: request.responseFormat || 'mp3',
        },
      }
    }
  }

  /**
   * 向量嵌入
   */
  async createEmbedding(
    request: EmbeddingRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<EmbeddingResponse> {
    const url = baseUrl || DEFAULT_SHENSUAN_BASE_URL

    const response = await fetchWithTimeout(`${url}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        input: request.input,
        dimensions: request.dimensions,
      }),
      timeoutMs: 60_000,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Embedding API 错误: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      embeddings: data.data?.map((item: { index: number; embedding: number[] }) => ({
        index: item.index,
        embedding: item.embedding,
      })) || [],
      model: data.model || request.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    }
  }

  private normalizeVideoStatus(status: string): VideoGenerationResponse['status'] {
    const statusMap: Record<string, VideoGenerationResponse['status']> = {
      'pending': 'pending',
      'queued': 'pending',
      'processing': 'processing',
      'running': 'processing',
      'completed': 'completed',
      'succeeded': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'error': 'failed',
    }
    return statusMap[status?.toLowerCase()] || 'pending'
  }

  private normalizeContent(content: string | ContentPart[]): unknown {
    if (typeof content === 'string') {
      return content
    }
    return content.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      }
      if (part.type === 'image_url') {
        return {
          type: 'image_url',
          image_url: {
            url: part.image_url.url,
            detail: part.image_url.detail || 'auto'
          }
        }
      }
      if (part.type === 'input_audio') {
        return {
          type: 'input_audio',
          input_audio: {
            data: part.input_audio.data,
            format: part.input_audio.format
          }
        }
      }
      if (part.type === 'video_url') {
        return {
          type: 'video_url',
          video_url: {
            url: part.video_url.url
          }
        }
      }
      return part
    })
  }

  private detectAudioMimeType(fileName: string): string {
    const lower = fileName.toLowerCase()
    if (lower.includes('mp3')) return 'audio/mpeg'
    if (lower.includes('wav')) return 'audio/wav'
    if (lower.includes('ogg')) return 'audio/ogg'
    if (lower.includes('m4a')) return 'audio/m4a'
    if (lower.includes('flac')) return 'audio/flac'
    if (lower.includes('webm')) return 'audio/webm'
    return 'audio/mpeg'
  }

  private isVisionModel(modelId: string): boolean {
    const visionKeywords = [
      'vision', 'vl', '4o', 'gemini', 'claude-3', 'gpt-4-turbo',
      'qwen-vl', 'qwen2-vl', 'qwen3-vl', 'glm-4v', 'yi-vision', 'internvl',
      'hunyuan-turbos-vision', 'deepseek-ocr', 'qwen3-omni'
    ]
    const lower = modelId.toLowerCase()
    return visionKeywords.some(v => lower.includes(v))
  }

  private isAudioModel(modelId: string): boolean {
    const audioKeywords = ['whisper', 'audio', 'speech', 'omni', 'tts', 'asr']
    const lower = modelId.toLowerCase()
    return audioKeywords.some(a => lower.includes(a))
  }



  private isVideoModel(modelId: string): boolean {
    const videoKeywords = ['qwen3-omni', 'qwen3-vl', 'gemini-2', 'gemini-1.5', 'video']
    const lower = modelId.toLowerCase()
    return videoKeywords.some(v => lower.includes(v))
  }
}

export const shensuanProvider = new ShensuanProvider()
