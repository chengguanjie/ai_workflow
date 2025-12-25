// 胜算云 API Provider (OpenAI 兼容)

import type { AIProvider, ChatRequest, ChatResponse, Model, TranscriptionOptions, TranscriptionResponse, ContentPart } from '../types'
import { getModelModality } from '../types'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

const DEFAULT_SHENSUAN_BASE_URL = process.env.SHENSUAN_BASE_URL || 'https://router.shengsuanyun.com/api/v1'

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

    const data = await response.json()

    return {
      content: data.choices[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      finishReason: data.choices[0]?.finish_reason || 'stop',
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
