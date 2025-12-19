/**
 * HTTP Node Processor
 * 
 * Handles external HTTP API calls with support for:
 * - All HTTP methods (GET, POST, PUT, DELETE, PATCH)
 * - Request headers and query parameters
 * - Multiple body types (JSON, form, text)
 * - Authentication (Basic, Bearer, API Key)
 * - Retry logic with configurable delay
 * - Timeout handling
 * - Variable substitution in URL and body
 */

import type {
  HttpNodeConfig,
  NodeOutput,
  ExecutionContext,
  HttpMethod,
  HttpBodyConfig,
  HttpAuthConfig,
  HttpRetryConfig,
} from '@/types/workflow'

const DEFAULT_TIMEOUT = 30000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY = 1000
const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504]

const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'api-key', 'cookie', 'set-cookie']

function resolveVariable(
  variable: string,
  context: ExecutionContext
): unknown {
  const cleanVar = variable.replace(/^\{\{|\}\}$/g, '').trim()
  const parts = cleanVar.split('.')
  
  if (parts.length === 0) {
    return undefined
  }
  
  const nodeName = parts[0]
  const nodeOutput = context.nodeOutputs.get(nodeName)
  
  if (!nodeOutput) {
    return undefined
  }
  
  let value: unknown = nodeOutput.data || nodeOutput
  for (let i = 1; i < parts.length; i++) {
    if (value && typeof value === 'object' && parts[i] in value) {
      value = (value as Record<string, unknown>)[parts[i]]
    } else {
      return undefined
    }
  }
  
  return value
}

function replaceVariables(text: string, context: ExecutionContext): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
    const value = resolveVariable(`{{${varPath}}}`, context)
    if (value === undefined || value === null) {
      return match
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  })
}

function buildUrl(
  baseUrl: string,
  queryParams?: Record<string, string>,
  context?: ExecutionContext
): string {
  let url = context ? replaceVariables(baseUrl, context) : baseUrl
  
  if (queryParams && Object.keys(queryParams).length > 0) {
    const urlObj = new URL(url)
    for (const [key, value] of Object.entries(queryParams)) {
      const resolvedValue = context ? replaceVariables(value, context) : value
      urlObj.searchParams.append(key, resolvedValue)
    }
    url = urlObj.toString()
  }
  
  return url
}

function buildHeaders(
  headers?: Record<string, string>,
  auth?: HttpAuthConfig,
  context?: ExecutionContext
): Record<string, string> {
  const result: Record<string, string> = {}
  
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      result[key] = context ? replaceVariables(value, context) : value
    }
  }
  
  if (auth) {
    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
          result['Authorization'] = `Basic ${credentials}`
        }
        break
      case 'bearer':
        if (auth.token) {
          const token = context ? replaceVariables(auth.token, context) : auth.token
          result['Authorization'] = `Bearer ${token}`
        }
        break
      case 'apikey':
        if (auth.apiKey && auth.apiKey.addTo === 'header') {
          const value = context ? replaceVariables(auth.apiKey.value, context) : auth.apiKey.value
          result[auth.apiKey.key] = value
        }
        break
    }
  }
  
  return result
}

function buildBody(
  body?: HttpBodyConfig,
  context?: ExecutionContext
): { body: string | FormData | undefined; contentType: string | undefined } {
  if (!body || body.type === 'none') {
    return { body: undefined, contentType: undefined }
  }
  
  switch (body.type) {
    case 'json': {
      let content = body.content
      if (typeof content === 'string' && context) {
        content = replaceVariables(content, context)
      }
      return {
        body: typeof content === 'string' ? content : JSON.stringify(content),
        contentType: 'application/json',
      }
    }
    case 'text': {
      const content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content)
      return {
        body: context ? replaceVariables(content, context) : content,
        contentType: 'text/plain',
      }
    }
    case 'form': {
      if (typeof body.content === 'object' && body.content !== null) {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(body.content)) {
          const strValue = String(value)
          params.append(key, context ? replaceVariables(strValue, context) : strValue)
        }
        return {
          body: params.toString(),
          contentType: 'application/x-www-form-urlencoded',
        }
      }
      return { body: undefined, contentType: undefined }
    }
    default:
      return { body: undefined, contentType: undefined }
  }
}

function sanitizeHeadersForLog(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryConfig: HttpRetryConfig
): Promise<Response> {
  const { maxRetries, retryDelay, retryOnStatus = DEFAULT_RETRY_STATUS_CODES } = retryConfig
  
  let lastError: Error | null = null
  let lastResponse: Response | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      if (retryOnStatus.includes(response.status) && attempt < maxRetries) {
        lastResponse = response
        await sleep(retryDelay * Math.pow(2, attempt))
        continue
      }
      
      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < maxRetries) {
        await sleep(retryDelay * Math.pow(2, attempt))
        continue
      }
    }
  }
  
  if (lastResponse) {
    return lastResponse
  }
  
  throw lastError || new Error('Request failed after retries')
}

export async function processHttpNode(
  node: HttpNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const startTime = Date.now()
  const {
    method,
    url,
    headers,
    queryParams,
    body,
    auth,
    timeout = DEFAULT_TIMEOUT,
    retry,
    responseType = 'json',
  } = node.config
  
  if (!url) {
    throw new Error('HTTP node requires a URL')
  }
  
  try {
    const fullUrl = buildUrl(url, queryParams, context)
    
    if (auth?.apiKey?.addTo === 'query') {
      const urlObj = new URL(fullUrl)
      const value = replaceVariables(auth.apiKey.value, context)
      urlObj.searchParams.append(auth.apiKey.key, value)
    }
    
    const requestHeaders = buildHeaders(headers, auth, context)
    const { body: requestBody, contentType } = buildBody(body, context)
    
    if (contentType && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = contentType
    }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    }
    
    const retryConfig: HttpRetryConfig = {
      maxRetries: retry?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelay: retry?.retryDelay ?? DEFAULT_RETRY_DELAY,
      retryOnStatus: retry?.retryOnStatus ?? DEFAULT_RETRY_STATUS_CODES,
    }
    
    const response = await fetchWithRetry(fullUrl, fetchOptions, retryConfig)
    clearTimeout(timeoutId)
    
    let responseData: unknown
    const contentTypeHeader = response.headers.get('content-type') || ''
    
    if (responseType === 'json' || contentTypeHeader.includes('application/json')) {
      try {
        responseData = await response.json()
      } catch {
        responseData = await response.text()
      }
    } else if (responseType === 'text') {
      responseData = await response.text()
    } else {
      responseData = await response.text()
    }
    
    const duration = Date.now() - startTime
    
    const result: NodeOutput = {
      status: response.ok ? 'success' : 'error',
      statusCode: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
      duration,
      request: {
        method,
        url: fullUrl,
        headers: sanitizeHeadersForLog(requestHeaders),
      },
    }
    
    if (!response.ok) {
      result.error = `HTTP ${response.status}: ${response.statusText}`
    }
    
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    
    return {
      status: 'error',
      error: isTimeout ? `Request timeout after ${timeout}ms` : errorMessage,
      duration,
      request: {
        method,
        url: replaceVariables(url, context),
      },
    }
  }
}
