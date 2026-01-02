/**
 * AI Function Calling 类型定义
 * 
 * 支持 OpenAI/Claude 格式的工具调用
 */

/**
 * JSON Schema 类型定义（简化版）
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null'
  description?: string
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  items?: JSONSchemaProperty
  enum?: (string | number | boolean)[]
  default?: unknown
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'
  description?: string
  enum?: (string | number | boolean)[]
  default?: unknown
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
}

/**
 * 工具参数定义
 */
export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
  enum?: string[]
  default?: unknown
  items?: {
    type: 'string' | 'number' | 'boolean' | 'object'
    properties?: Record<string, ToolParameter>
  }
  properties?: Record<string, ToolParameter>
}

/**
 * 工具定义（内部格式）
 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameter[]
  /** 工具类别 */
  category?: 'notification' | 'data' | 'http' | 'file' | 'custom'
  /** 是否需要确认 */
  requiresConfirmation?: boolean
}

/**
 * OpenAI 格式的工具定义
 */
export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

/**
 * Claude/Anthropic 格式的工具定义
 */
export interface ClaudeTool {
  name: string
  description: string
  input_schema: JSONSchema
}

/**
 * 工具调用请求（AI 返回的）
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

/**
 * Claude 格式的工具使用
 */
export interface ClaudeToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  toolCallId: string
  toolName: string
  success: boolean
  result?: unknown
  error?: string
  /** 执行耗时（毫秒） */
  duration?: number
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  /** 执行ID */
  executionId?: string
  /** 工作流ID */
  workflowId?: string
  /** 组织ID */
  organizationId: string
  /** 用户ID */
  userId: string
  /** 是否为测试模式 */
  testMode?: boolean
  /** 自定义变量 */
  variables?: Record<string, unknown>
  /**
   * 当前节点使用的 AI 配置（可选）
   *
   * 对于需要调用模型的工具（如图片/音频/视频生成、代码大模型等），
   * 可以优先使用这里提供的 provider/apiKey/baseUrl/defaultModel。
   * 普通 HTTP / 通知类工具可以忽略该字段。
   */
  aiConfig?: {
    provider: string
    apiKey: string
    baseUrl?: string
    defaultModel?: string
  }
}

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具类别 */
  category: string
  /** 执行工具 */
  execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult>
  /** 获取工具定义 */
  getDefinition(): ToolDefinition
}

/**
 * 带工具的聊天请求
 */
export interface ChatRequestWithTools {
  model: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | unknown[]
    tool_call_id?: string
    tool_calls?: ToolCall[]
  }>
  tools?: OpenAITool[]
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  temperature?: number
  maxTokens?: number
}

/**
 * 带工具调用的聊天响应
 */
export interface ChatResponseWithTools {
  content: string
  toolCalls?: ToolCall[]
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
}

/**
 * AI 提供商类型
 */
export type AIProviderFormat = 'openai' | 'claude' | 'shensuan'

/**
 * 工具配置（用于持久化）
 */
export interface ToolConfig {
  id: string
  name: string
  description: string
  category: 'notification' | 'data' | 'http' | 'file' | 'custom'
  enabled: boolean
  parameters: ToolParameter[]
  /** 执行配置 */
  executionConfig?: {
    /** Webhook URL（用于 notification 类型） */
    webhookUrl?: string
    /** 平台类型 */
    platform?: 'feishu' | 'dingtalk' | 'wecom'
    /** HTTP 配置 */
    httpConfig?: {
      url: string
      method: 'GET' | 'POST' | 'PUT' | 'DELETE'
      headers?: Record<string, string>
    }
    /** 自定义代码 */
    customCode?: string
  }
  /** 创建时间 */
  createdAt?: Date
  /** 更新时间 */
  updatedAt?: Date
}
