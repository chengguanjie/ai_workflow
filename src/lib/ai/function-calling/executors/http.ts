/**
 * HTTP 工具执行器
 * 
 * 支持发送 HTTP 请求
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'

/**
 * HTTP 请求工具执行器
 */
export class HttpToolExecutor implements ToolExecutor {
  name = 'http_request'
  description = '发送 HTTP 请求到指定 URL'
  category = 'http'

  private baseUrl?: string
  private defaultHeaders?: Record<string, string>
  private allowedMethods?: string[]

  constructor(config?: {
    baseUrl?: string
    defaultHeaders?: Record<string, string>
    allowedMethods?: string[]
  }) {
    this.baseUrl = config?.baseUrl
    this.defaultHeaders = config?.defaultHeaders
    this.allowedMethods = config?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'http',
      parameters: [
        {
          name: 'url',
          type: 'string',
          description: '请求的 URL 地址',
          required: true,
        },
        {
          name: 'method',
          type: 'string',
          description: 'HTTP 方法：GET、POST、PUT、DELETE、PATCH',
          required: false,
          enum: this.allowedMethods,
          default: 'GET',
        },
        {
          name: 'headers',
          type: 'object',
          description: '请求头（键值对）',
          required: false,
        },
        {
          name: 'body',
          type: 'object',
          description: '请求体（将被 JSON 序列化）',
          required: false,
        },
        {
          name: 'query_params',
          type: 'object',
          description: 'URL 查询参数（键值对）',
          required: false,
        },
        {
          name: 'timeout',
          type: 'number',
          description: '请求超时时间（毫秒），默认 30000',
          required: false,
          default: 30000,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    let url = args.url as string
    const method = ((args.method as string) || 'GET').toUpperCase()
    const headers = args.headers as Record<string, string> | undefined
    const body = args.body as Record<string, unknown> | undefined
    const queryParams = args.query_params as Record<string, string> | undefined
    const timeout = (args.timeout as number) || 30000

    if (!url) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: url',
      }
    }

    // 验证方法
    if (!this.allowedMethods?.includes(method)) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: `不允许的 HTTP 方法: ${method}`,
      }
    }

    // 处理 baseUrl
    if (this.baseUrl && !url.startsWith('http')) {
      url = this.baseUrl + url
    }

    // 添加查询参数
    if (queryParams && Object.keys(queryParams).length > 0) {
      const searchParams = new URLSearchParams(queryParams)
      url += (url.includes('?') ? '&' : '?') + searchParams.toString()
    }

    // 测试模式
    if (context.testMode) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: true,
        result: {
          testMode: true,
          message: `[测试模式] 将发送 ${method} 请求到 ${url}`,
          method,
          url,
          headers: { ...this.defaultHeaders, ...headers },
          body,
        },
      }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.defaultHeaders,
          ...headers,
        },
        signal: controller.signal,
      }

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(body)
      }

      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)

      // 尝试解析响应
      let responseData: unknown
      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      return {
        toolCallId: '',
        toolName: this.name,
        success: response.ok,
        result: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          toolCallId: '',
          toolName: this.name,
          success: false,
          error: `请求超时 (${timeout}ms)`,
        }
      }

      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/**
 * 创建带固定配置的 HTTP 工具
 */
export function createHttpTool(config: {
  name?: string
  description?: string
  baseUrl?: string
  defaultHeaders?: Record<string, string>
  allowedMethods?: string[]
}): HttpToolExecutor {
  const executor = new HttpToolExecutor(config)
  if (config.name) executor.name = config.name
  if (config.description) executor.description = config.description
  return executor
}
