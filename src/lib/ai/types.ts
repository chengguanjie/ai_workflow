// AI API 类型定义

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface ChatResponse {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason: string
  model: string
}

export interface Model {
  id: string
  name: string
  provider: string
  contextLength?: number
  pricing?: {
    prompt: number
    completion: number
  }
}

export interface AIProvider {
  name: string
  chat(request: ChatRequest, apiKey: string, baseUrl?: string): Promise<ChatResponse>
  listModels?(apiKey: string, baseUrl?: string): Promise<Model[]>
}

export type AIProviderType = 'SHENSUAN' | 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'BAIDU_WENXIN' | 'ALIYUN_TONGYI' | 'XUNFEI_SPARK' | 'STABILITYAI'
