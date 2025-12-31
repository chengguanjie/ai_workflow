/**
 * HTTP 工具执行器
 *
 * 支持发送 HTTP 请求，可获取网页内容并提取正文
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'

/**
 * 默认浏览器 User-Agent，用于模拟真实浏览器请求
 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 清理 HTML 内容，移除无用标签和脚本
 */
function cleanHtml(htmlContent: string): string {
  if (!htmlContent) return ''

  let cleaned = htmlContent
    // 移除 script 标签及内容
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // 移除 style 标签及内容
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // 移除 nav 导航
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    // 移除 header
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    // 移除 footer
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    // 移除 aside 侧边栏
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    // 移除注释
    .replace(/<!--[\s\S]*?-->/g, '')
    // 移除 noscript
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    // 移除 iframe
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')

  // 移除所有 HTML 标签，保留纯文本
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')

  // 清理特殊字符和多余空格
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}

/**
 * 从 HTML 中提取标题
 */
function extractTitle(htmlContent: string): string {
  // 优先提取 title 标签
  const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch && titleMatch[1].trim()) {
    return titleMatch[1].trim().replace(/&[^;]+;/g, '')
  }

  // 其次提取 h1 标签
  const h1Match = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match && h1Match[1].trim()) {
    return h1Match[1].replace(/<[^>]+>/g, '').trim()
  }

  // 尝试提取 og:title
  const ogTitleMatch = htmlContent.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogTitleMatch && ogTitleMatch[1].trim()) {
    return ogTitleMatch[1].trim()
  }

  return ''
}

/**
 * 从 HTML 中提取描述
 */
function extractDescription(htmlContent: string): string {
  // 提取 meta description
  const descMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  if (descMatch && descMatch[1].trim()) {
    return descMatch[1].trim()
  }

  // 尝试提取 og:description
  const ogDescMatch = htmlContent.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDescMatch && ogDescMatch[1].trim()) {
    return ogDescMatch[1].trim()
  }

  return ''
}

/**
 * 提取网页正文内容
 */
function extractMainContent(htmlContent: string): string {
  // 尝试提取文章主体内容
  // 优先提取 article 标签
  const articleMatch = htmlContent.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch) {
    return cleanHtml(articleMatch[1])
  }

  // 尝试提取常见的内容容器
  const contentSelectors = [
    /<div[^>]*class=["'][^"']*(?:content|article|post|entry|main)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*id=["'](?:content|article|main|post)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ]

  for (const selector of contentSelectors) {
    const match = htmlContent.match(selector)
    if (match && match[1]) {
      const content = cleanHtml(match[1])
      if (content.length > 100) {
        return content
      }
    }
  }

  // 如果没有找到特定内容区域，清理整个 body
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    return cleanHtml(bodyMatch[1])
  }

  // 最后使用整个 HTML
  return cleanHtml(htmlContent)
}

/**
 * HTTP 请求工具执行器
 */
export class HttpToolExecutor implements ToolExecutor {
  name = 'http_request'
  description = '发送 HTTP 请求到指定 URL，支持获取网页内容并提取正文'
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
          description: '请求超时时间（毫秒），默认 15000',
          required: false,
          default: 15000,
        },
        {
          name: 'extract_content',
          type: 'boolean',
          description: '是否提取网页正文内容（自动清理 HTML 标签，提取标题和正文）',
          required: false,
          default: false,
        },
        {
          name: 'max_content_length',
          type: 'number',
          description: '提取内容的最大字符数，默认 8000',
          required: false,
          default: 8000,
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
    const timeout = (args.timeout as number) || 15000
    const extractContent = (args.extract_content as boolean) || false
    const maxContentLength = (args.max_content_length as number) || 8000

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
          headers: { 'User-Agent': DEFAULT_USER_AGENT, ...this.defaultHeaders, ...headers },
          body,
          extractContent,
        },
      }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      // 构建请求头，默认添加浏览器 User-Agent
      // 注意：Node.js fetch 不自动解压缩，所以不要设置 Accept-Encoding
      const requestHeaders: Record<string, string> = {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...this.defaultHeaders,
        ...headers,
      }

      // 如果有请求体，添加 Content-Type
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        requestHeaders['Content-Type'] = 'application/json'
      }

      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal,
        // 允许重定向
        redirect: 'follow',
        // 禁用 Next.js 缓存
        cache: 'no-store',
      }

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(body)
      }

      console.log('[HTTP Tool] 发起请求:', {
        url,
        method,
        timeout,
        headersKeys: Object.keys(requestHeaders),
      })

      // 使用 Promise.race 实现更可靠的超时（AbortController 在某些情况下可能失效）
      const fetchPromise = fetch(url, fetchOptions)
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => {
          controller.abort()
          reject(new Error(`HTTP_TIMEOUT:请求超时 (${timeout}ms)`))
        }, timeout)
      })

      const response = await Promise.race([fetchPromise, timeoutPromise])

      console.log('[HTTP Tool] 收到响应:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
      })
      clearTimeout(timeoutId)

      // 获取响应内容类型
      const contentType = response.headers.get('content-type') || ''

      // 尝试解析响应
      let responseData: unknown

      if (contentType.includes('application/json')) {
        responseData = await response.json()
      } else {
        // 获取文本内容
        const textContent = await response.text()

        // 如果启用了内容提取且是 HTML 内容
        if (extractContent && (contentType.includes('text/html') || textContent.includes('<html'))) {
          const title = extractTitle(textContent)
          const description = extractDescription(textContent)
          let content = extractMainContent(textContent)

          // 限制内容长度
          if (content.length > maxContentLength) {
            content = content.substring(0, maxContentLength) + '...[内容过长已截取]'
          }

          responseData = {
            url: url,
            title: title || '未找到标题',
            description: description || '',
            content: content,
            contentLength: content.length,
            extractedAt: new Date().toISOString(),
            preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          }
        } else {
          responseData = textContent
        }
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
      // 详细记录错误信息用于调试
      console.error('[HTTP Tool] 请求失败:', {
        url,
        method,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          cause: (error as any).cause,
        } : String(error),
      })

      // 处理超时错误
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.startsWith('HTTP_TIMEOUT:')) {
          return {
            toolCallId: '',
            toolName: this.name,
            success: false,
            error: `请求超时 (${timeout}ms)`,
          }
        }
      }

      // 提供更详细的错误信息
      let errorMessage = error instanceof Error ? error.message : String(error)

      // 检查常见的网络错误
      if (error instanceof Error) {
        const cause = (error as any).cause
        if (cause) {
          if (cause.code === 'ENOTFOUND') {
            errorMessage = `DNS 解析失败: 无法解析域名`
          } else if (cause.code === 'ECONNREFUSED') {
            errorMessage = `连接被拒绝: 服务器拒绝连接`
          } else if (cause.code === 'ECONNRESET') {
            errorMessage = `连接被重置: 服务器关闭了连接`
          } else if (cause.code === 'ETIMEDOUT') {
            errorMessage = `连接超时: 无法在规定时间内建立连接`
          } else if (cause.code === 'CERT_HAS_EXPIRED' || cause.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
            errorMessage = `SSL 证书错误: ${cause.code}`
          } else if (cause.message) {
            errorMessage = `网络错误: ${cause.message}`
          }
        }
      }

      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: errorMessage,
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
