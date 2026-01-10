/**
 * MCP Error Handling Module
 * 
 * Provides comprehensive error types, error codes, user-friendly messages,
 * and error handling utilities for MCP operations.
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * MCP Error codes - comprehensive list of all possible MCP errors
 */
export enum MCPErrorCode {
  // Connection errors
  UNREACHABLE = 'MCP_UNREACHABLE',
  AUTH_FAILED = 'MCP_AUTH_FAILED',
  PROTOCOL_ERROR = 'MCP_PROTOCOL_ERROR',
  TIMEOUT = 'MCP_TIMEOUT',
  CONNECTION_CLOSED = 'MCP_CONNECTION_CLOSED',
  SSL_ERROR = 'MCP_SSL_ERROR',
  
  // Tool errors
  TOOL_NOT_FOUND = 'MCP_TOOL_NOT_FOUND',
  INVALID_PARAMS = 'MCP_INVALID_PARAMS',
  EXECUTION_ERROR = 'MCP_EXECUTION_ERROR',
  PARSE_ERROR = 'MCP_PARSE_ERROR',
  
  // Configuration errors
  INVALID_CONFIG = 'MCP_INVALID_CONFIG',
  INVALID_URL = 'MCP_INVALID_URL',
  MISSING_AUTH = 'MCP_MISSING_AUTH',
  
  // Rate limiting and quota
  RATE_LIMITED = 'MCP_RATE_LIMITED',
  QUOTA_EXCEEDED = 'MCP_QUOTA_EXCEEDED',
  
  // Server errors
  SERVER_ERROR = 'MCP_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'MCP_SERVICE_UNAVAILABLE',
  
  // Unknown
  UNKNOWN = 'MCP_UNKNOWN_ERROR',
}

/**
 * HTTP status code to MCP error code mapping
 */
export const HTTP_STATUS_TO_ERROR_CODE: Record<number, MCPErrorCode> = {
  400: MCPErrorCode.INVALID_PARAMS,
  401: MCPErrorCode.AUTH_FAILED,
  403: MCPErrorCode.AUTH_FAILED,
  404: MCPErrorCode.TOOL_NOT_FOUND,
  408: MCPErrorCode.TIMEOUT,
  429: MCPErrorCode.RATE_LIMITED,
  500: MCPErrorCode.SERVER_ERROR,
  502: MCPErrorCode.SERVICE_UNAVAILABLE,
  503: MCPErrorCode.SERVICE_UNAVAILABLE,
  504: MCPErrorCode.TIMEOUT,
}

// ============================================================================
// Error Messages (User-Friendly)
// ============================================================================

/**
 * User-friendly error messages in Chinese
 */
export const ERROR_MESSAGES_ZH: Record<MCPErrorCode, string> = {
  [MCPErrorCode.UNREACHABLE]: '无法连接到 MCP 服务器，请检查服务器地址是否正确',
  [MCPErrorCode.AUTH_FAILED]: '认证失败，请检查 API 密钥是否正确',
  [MCPErrorCode.PROTOCOL_ERROR]: '协议错误，服务器响应格式不正确',
  [MCPErrorCode.TIMEOUT]: '连接超时，请检查网络连接或增加超时时间',
  [MCPErrorCode.CONNECTION_CLOSED]: '连接已关闭，请重新连接',
  [MCPErrorCode.SSL_ERROR]: 'SSL/TLS 证书验证失败，请检查服务器证书',
  [MCPErrorCode.TOOL_NOT_FOUND]: '工具不存在，请刷新工具列表',
  [MCPErrorCode.INVALID_PARAMS]: '参数无效，请检查参数格式',
  [MCPErrorCode.EXECUTION_ERROR]: '工具执行失败，请查看详细错误信息',
  [MCPErrorCode.PARSE_ERROR]: '响应解析失败，服务器返回了无效数据',
  [MCPErrorCode.INVALID_CONFIG]: '配置无效，请检查服务器配置',
  [MCPErrorCode.INVALID_URL]: '服务器地址格式无效，请输入有效的 HTTP/HTTPS URL',
  [MCPErrorCode.MISSING_AUTH]: '缺少认证信息，请配置 API 密钥',
  [MCPErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试',
  [MCPErrorCode.QUOTA_EXCEEDED]: '配额已用尽，请检查账户配额',
  [MCPErrorCode.SERVER_ERROR]: '服务器内部错误，请稍后重试',
  [MCPErrorCode.SERVICE_UNAVAILABLE]: '服务暂时不可用，请稍后重试',
  [MCPErrorCode.UNKNOWN]: '发生未知错误，请查看详细信息',
}

/**
 * User-friendly error messages in English
 */
export const ERROR_MESSAGES_EN: Record<MCPErrorCode, string> = {
  [MCPErrorCode.UNREACHABLE]: 'Cannot reach MCP server. Please check the server URL.',
  [MCPErrorCode.AUTH_FAILED]: 'Authentication failed. Please check your API key.',
  [MCPErrorCode.PROTOCOL_ERROR]: 'Protocol error. Server response format is invalid.',
  [MCPErrorCode.TIMEOUT]: 'Connection timeout. Please check network or increase timeout.',
  [MCPErrorCode.CONNECTION_CLOSED]: 'Connection closed. Please reconnect.',
  [MCPErrorCode.SSL_ERROR]: 'SSL/TLS certificate verification failed.',
  [MCPErrorCode.TOOL_NOT_FOUND]: 'Tool not found. Please refresh the tool list.',
  [MCPErrorCode.INVALID_PARAMS]: 'Invalid parameters. Please check parameter format.',
  [MCPErrorCode.EXECUTION_ERROR]: 'Tool execution failed. See details for more info.',
  [MCPErrorCode.PARSE_ERROR]: 'Failed to parse response. Server returned invalid data.',
  [MCPErrorCode.INVALID_CONFIG]: 'Invalid configuration. Please check server settings.',
  [MCPErrorCode.INVALID_URL]: 'Invalid server URL. Please enter a valid HTTP/HTTPS URL.',
  [MCPErrorCode.MISSING_AUTH]: 'Missing authentication. Please configure API key.',
  [MCPErrorCode.RATE_LIMITED]: 'Rate limited. Please try again later.',
  [MCPErrorCode.QUOTA_EXCEEDED]: 'Quota exceeded. Please check your account quota.',
  [MCPErrorCode.SERVER_ERROR]: 'Server error. Please try again later.',
  [MCPErrorCode.SERVICE_UNAVAILABLE]: 'Service unavailable. Please try again later.',
  [MCPErrorCode.UNKNOWN]: 'Unknown error occurred. See details for more info.',
}

/**
 * Suggested actions for each error type
 */
export const ERROR_SUGGESTIONS: Record<MCPErrorCode, string[]> = {
  [MCPErrorCode.UNREACHABLE]: [
    '检查服务器 URL 是否正确',
    '确认服务器是否正在运行',
    '检查网络连接',
    '检查防火墙设置',
  ],
  [MCPErrorCode.AUTH_FAILED]: [
    '检查 API 密钥是否正确',
    '确认 API 密钥未过期',
    '检查认证类型是否匹配',
  ],
  [MCPErrorCode.PROTOCOL_ERROR]: [
    '检查服务器是否支持 MCP 协议',
    '确认协议版本兼容',
    '尝试切换传输协议（SSE/HTTP）',
  ],
  [MCPErrorCode.TIMEOUT]: [
    '增加超时时间设置',
    '检查网络连接速度',
    '确认服务器响应正常',
  ],
  [MCPErrorCode.CONNECTION_CLOSED]: [
    '重新建立连接',
    '检查服务器状态',
  ],
  [MCPErrorCode.SSL_ERROR]: [
    '检查服务器 SSL 证书',
    '确认证书未过期',
    '尝试使用 HTTP（仅限测试环境）',
  ],
  [MCPErrorCode.TOOL_NOT_FOUND]: [
    '刷新工具列表',
    '检查工具名称是否正确',
    '确认服务器支持该工具',
  ],
  [MCPErrorCode.INVALID_PARAMS]: [
    '检查参数格式',
    '查看工具的参数定义',
    '确认必填参数已提供',
  ],
  [MCPErrorCode.EXECUTION_ERROR]: [
    '查看详细错误信息',
    '检查工具参数',
    '联系服务提供商',
  ],
  [MCPErrorCode.PARSE_ERROR]: [
    '检查服务器响应格式',
    '确认服务器版本兼容',
  ],
  [MCPErrorCode.INVALID_CONFIG]: [
    '检查配置项是否完整',
    '确认配置格式正确',
  ],
  [MCPErrorCode.INVALID_URL]: [
    '输入完整的 URL（包含 http:// 或 https://）',
    '检查 URL 格式',
  ],
  [MCPErrorCode.MISSING_AUTH]: [
    '配置 API 密钥',
    '选择正确的认证类型',
  ],
  [MCPErrorCode.RATE_LIMITED]: [
    '等待一段时间后重试',
    '减少请求频率',
    '升级账户配额',
  ],
  [MCPErrorCode.QUOTA_EXCEEDED]: [
    '检查账户配额使用情况',
    '升级账户套餐',
    '等待配额重置',
  ],
  [MCPErrorCode.SERVER_ERROR]: [
    '稍后重试',
    '联系服务提供商',
  ],
  [MCPErrorCode.SERVICE_UNAVAILABLE]: [
    '稍后重试',
    '检查服务状态页面',
  ],
  [MCPErrorCode.UNKNOWN]: [
    '查看详细错误信息',
    '检查日志',
    '联系技术支持',
  ],
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * MCP specific error class with enhanced functionality
 */
export class MCPError extends Error {
  /** Error code */
  public readonly code: MCPErrorCode
  /** Additional error details */
  public readonly details?: unknown
  /** Whether this error is retryable */
  public readonly retryable: boolean
  /** HTTP status code if applicable */
  public readonly httpStatus?: number
  /** Timestamp when error occurred */
  public readonly timestamp: Date
  /** Request ID for tracking */
  public readonly requestId?: string

  constructor(
    code: MCPErrorCode,
    message: string,
    options?: {
      details?: unknown
      httpStatus?: number
      requestId?: string
      cause?: Error
    }
  ) {
    super(message)
    this.name = 'MCPError'
    this.code = code
    this.details = options?.details
    this.httpStatus = options?.httpStatus
    this.requestId = options?.requestId
    this.timestamp = new Date()
    this.retryable = isRetryableErrorCode(code)
    
    // Maintain proper stack trace
    if (options?.cause && Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError)
    }
  }

  /**
   * Gets user-friendly error message
   */
  getUserMessage(locale: 'zh' | 'en' = 'zh'): string {
    const messages = locale === 'zh' ? ERROR_MESSAGES_ZH : ERROR_MESSAGES_EN
    return messages[this.code] || this.message
  }

  /**
   * Gets suggested actions for this error
   */
  getSuggestions(): string[] {
    return ERROR_SUGGESTIONS[this.code] || []
  }

  /**
   * Converts error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.getUserMessage(),
      details: this.details,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      requestId: this.requestId,
      timestamp: this.timestamp.toISOString(),
      suggestions: this.getSuggestions(),
    }
  }
}

// ============================================================================
// Error Detection and Classification
// ============================================================================

/**
 * Retryable error codes
 */
export const RETRYABLE_ERROR_CODES: MCPErrorCode[] = [
  MCPErrorCode.UNREACHABLE,
  MCPErrorCode.TIMEOUT,
  MCPErrorCode.CONNECTION_CLOSED,
  MCPErrorCode.RATE_LIMITED,
  MCPErrorCode.SERVICE_UNAVAILABLE,
]

/**
 * Checks if an error code is retryable
 */
export function isRetryableErrorCode(code: MCPErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.includes(code)
}

/**
 * Network error patterns for detection
 */
const NETWORK_ERROR_PATTERNS = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNABORTED',
  'fetch failed',
  'network error',
  'Failed to fetch',
]

/**
 * Auth error patterns for detection
 */
const AUTH_ERROR_PATTERNS = [
  '401',
  '403',
  'unauthorized',
  'forbidden',
  'invalid.*key',
  'invalid.*token',
  'authentication',
  'permission denied',
]

/**
 * Timeout error patterns for detection
 */
const TIMEOUT_ERROR_PATTERNS = [
  'timeout',
  'timed out',
  'ETIMEDOUT',
  'deadline exceeded',
]

/**
 * Classifies an error into an MCP error code
 */
export function classifyError(error: unknown): MCPErrorCode {
  if (error instanceof MCPError) {
    return error.code
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  // Check for network errors
  if (NETWORK_ERROR_PATTERNS.some(pattern => message.includes(pattern.toLowerCase()))) {
    return MCPErrorCode.UNREACHABLE
  }

  // Check for auth errors
  if (AUTH_ERROR_PATTERNS.some(pattern => new RegExp(pattern, 'i').test(message))) {
    return MCPErrorCode.AUTH_FAILED
  }

  // Check for timeout errors
  if (TIMEOUT_ERROR_PATTERNS.some(pattern => message.includes(pattern.toLowerCase()))) {
    return MCPErrorCode.TIMEOUT
  }

  // Check for SSL errors
  if (message.includes('ssl') || message.includes('certificate') || message.includes('cert')) {
    return MCPErrorCode.SSL_ERROR
  }

  // Check for rate limiting
  if (message.includes('rate') || message.includes('429') || message.includes('too many')) {
    return MCPErrorCode.RATE_LIMITED
  }

  // Check for tool not found
  if (message.includes('not found') || message.includes('unknown tool') || message.includes('404')) {
    return MCPErrorCode.TOOL_NOT_FOUND
  }

  // Check for invalid params
  if (message.includes('invalid') || message.includes('validation') || message.includes('400')) {
    return MCPErrorCode.INVALID_PARAMS
  }

  // Check for server errors
  if (message.includes('500') || message.includes('internal server')) {
    return MCPErrorCode.SERVER_ERROR
  }

  // Check for service unavailable
  if (message.includes('503') || message.includes('unavailable')) {
    return MCPErrorCode.SERVICE_UNAVAILABLE
  }

  return MCPErrorCode.UNKNOWN
}

/**
 * Creates an MCPError from any error type
 */
export function createMCPError(
  error: unknown,
  options?: {
    defaultCode?: MCPErrorCode
    httpStatus?: number
    requestId?: string
  }
): MCPError {
  // Already an MCPError
  if (error instanceof MCPError) {
    return error
  }

  // Classify the error
  const code = options?.defaultCode || classifyError(error)
  const message = error instanceof Error ? error.message : String(error)

  return new MCPError(code, message, {
    details: error instanceof Error ? { originalError: error.message, stack: error.stack } : error,
    httpStatus: options?.httpStatus,
    requestId: options?.requestId,
    cause: error instanceof Error ? error : undefined,
  })
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Formats an error for display in the UI
 */
export function formatErrorForUI(error: unknown, locale: 'zh' | 'en' = 'zh'): {
  title: string
  message: string
  code: string
  suggestions: string[]
  retryable: boolean
} {
  const mcpError = error instanceof MCPError ? error : createMCPError(error)
  
  return {
    title: locale === 'zh' ? 'MCP 错误' : 'MCP Error',
    message: mcpError.getUserMessage(locale),
    code: mcpError.code,
    suggestions: mcpError.getSuggestions(),
    retryable: mcpError.retryable,
  }
}

/**
 * Formats an error for logging
 */
export function formatErrorForLog(error: unknown, context?: Record<string, unknown>): Record<string, unknown> {
  const mcpError = error instanceof MCPError ? error : createMCPError(error)
  
  return {
    ...mcpError.toJSON(),
    context,
  }
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Wraps an async function with MCP error handling
 */
export async function withMCPErrorHandling<T>(
  fn: () => Promise<T>,
  options?: {
    defaultCode?: MCPErrorCode
    requestId?: string
  }
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw createMCPError(error, options)
  }
}

/**
 * Type guard to check if an error is an MCPError
 */
export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof MCPError) {
    return error.retryable
  }
  const code = classifyError(error)
  return isRetryableErrorCode(code)
}


// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number
  /** Multiplier for exponential backoff */
  backoffMultiplier: number
  /** Optional jitter factor (0-1) to add randomness to delays */
  jitterFactor?: number
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean
  /** Callback called before each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
}

/**
 * Calculates the delay for a retry attempt using exponential backoff with jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Calculate base delay with exponential backoff
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)
  
  // Cap at max delay
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs)
  
  // Add jitter if configured
  if (config.jitterFactor && config.jitterFactor > 0) {
    const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1)
    return Math.max(0, Math.round(cappedDelay + jitter))
  }
  
  return Math.round(cappedDelay)
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry result type
 */
export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: MCPError
  attempts: number
  totalDelayMs: number
}

/**
 * Executes a function with retry logic
 * 
 * @param fn - The async function to execute
 * @param config - Retry configuration (uses defaults if not provided)
 * @returns The result of the function or throws after all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  const isRetryable = fullConfig.isRetryable || isRetryableError
  
  let lastError: unknown
  
  for (let attempt = 1; attempt <= fullConfig.maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      // Check if we've exhausted retries
      if (attempt > fullConfig.maxRetries) {
        break
      }
      
      // Check if error is retryable
      if (!isRetryable(error)) {
        break
      }
      
      // Calculate delay
      const delayMs = calculateRetryDelay(attempt, fullConfig)
      
      // Call onRetry callback if provided
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt, error, delayMs)
      }
      
      // Wait before retrying
      await sleep(delayMs)
    }
  }
  
  // All retries exhausted, throw the last error
  throw createMCPError(lastError)
}

/**
 * Executes a function with retry logic and returns detailed result
 * 
 * @param fn - The async function to execute
 * @param config - Retry configuration (uses defaults if not provided)
 * @returns Detailed result including success status, attempts, and timing
 */
export async function withRetryResult<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  const isRetryable = fullConfig.isRetryable || isRetryableError
  
  let lastError: unknown
  let totalDelayMs = 0
  let attempts = 0
  
  for (let attempt = 1; attempt <= fullConfig.maxRetries + 1; attempt++) {
    attempts = attempt
    
    try {
      const result = await fn()
      return {
        success: true,
        result,
        attempts,
        totalDelayMs,
      }
    } catch (error) {
      lastError = error
      
      // Check if we've exhausted retries
      if (attempt > fullConfig.maxRetries) {
        break
      }
      
      // Check if error is retryable
      if (!isRetryable(error)) {
        break
      }
      
      // Calculate delay
      const delayMs = calculateRetryDelay(attempt, fullConfig)
      totalDelayMs += delayMs
      
      // Call onRetry callback if provided
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt, error, delayMs)
      }
      
      // Wait before retrying
      await sleep(delayMs)
    }
  }
  
  // All retries exhausted
  return {
    success: false,
    error: createMCPError(lastError),
    attempts,
    totalDelayMs,
  }
}

/**
 * Creates a retryable version of an async function
 * 
 * @param fn - The async function to wrap
 * @param config - Retry configuration
 * @returns A new function that will retry on failure
 */
export function makeRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<RetryConfig> = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), config)
}


// ============================================================================
// Timeout Handling
// ============================================================================

/**
 * Timeout configuration options
 */
export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  timeoutMs: number
  /** Custom error message for timeout */
  errorMessage?: string
  /** Whether to abort the operation on timeout */
  abortOnTimeout?: boolean
}

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  timeoutMs: 30000, // 30 seconds
  abortOnTimeout: true,
}

/**
 * Timeout error class
 */
export class TimeoutError extends MCPError {
  constructor(
    timeoutMs: number,
    message?: string,
    options?: {
      requestId?: string
      details?: unknown
    }
  ) {
    super(
      MCPErrorCode.TIMEOUT,
      message || `Operation timed out after ${timeoutMs}ms`,
      {
        details: {
          timeoutMs,
          ...(
            options?.details &&
            typeof options.details === 'object' &&
            options.details !== null &&
            !Array.isArray(options.details)
              ? (options.details as Record<string, unknown>)
              : {}
          ),
        },
        requestId: options?.requestId,
      }
    )
    this.name = 'TimeoutError'
  }
}

/**
 * Creates a timeout promise that rejects after specified duration
 */
export function createTimeoutPromise(
  timeoutMs: number,
  errorMessage?: string
): { promise: Promise<never>; cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null
  
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(timeoutMs, errorMessage))
    }, timeoutMs)
  })
  
  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
  
  return { promise, cancel }
}

/**
 * Wraps a promise with a timeout
 * 
 * @param promise - The promise to wrap
 * @param config - Timeout configuration
 * @returns The result of the promise or throws TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  config: Partial<TimeoutConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config }
  const { promise: timeoutPromise, cancel } = createTimeoutPromise(
    fullConfig.timeoutMs,
    fullConfig.errorMessage
  )
  
  try {
    const result = await Promise.race([promise, timeoutPromise])
    cancel()
    return result
  } catch (error) {
    cancel()
    throw error
  }
}

/**
 * Wraps an async function with timeout
 * 
 * @param fn - The async function to wrap
 * @param config - Timeout configuration
 * @returns A new function that will timeout after specified duration
 */
export function withTimeoutFn<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<TimeoutConfig> = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withTimeout(fn(...args), config)
}

/**
 * Creates an AbortController with automatic timeout
 * 
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns AbortController and cleanup function
 */
export function createTimeoutAbortController(
  timeoutMs: number
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController()
  
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(timeoutMs))
  }, timeoutMs)
  
  const cleanup = () => {
    clearTimeout(timeoutId)
  }
  
  return { controller, cleanup }
}

/**
 * Timeout result type
 */
export interface TimeoutResult<T> {
  success: boolean
  result?: T
  timedOut: boolean
  error?: MCPError
  durationMs: number
}

/**
 * Wraps a promise with timeout and returns detailed result
 * 
 * @param promise - The promise to wrap
 * @param config - Timeout configuration
 * @returns Detailed result including timeout status
 */
export async function withTimeoutResult<T>(
  promise: Promise<T>,
  config: Partial<TimeoutConfig> = {}
): Promise<TimeoutResult<T>> {
  const fullConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config }
  const startTime = Date.now()
  
  const { promise: timeoutPromise, cancel } = createTimeoutPromise(
    fullConfig.timeoutMs,
    fullConfig.errorMessage
  )
  
  try {
    const result = await Promise.race([promise, timeoutPromise])
    cancel()
    return {
      success: true,
      result,
      timedOut: false,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    cancel()
    const durationMs = Date.now() - startTime
    
    if (error instanceof TimeoutError) {
      return {
        success: false,
        timedOut: true,
        error,
        durationMs,
      }
    }
    
    return {
      success: false,
      timedOut: false,
      error: createMCPError(error),
      durationMs,
    }
  }
}

/**
 * Combines retry and timeout logic
 * 
 * @param fn - The async function to execute
 * @param options - Combined retry and timeout options
 * @returns The result of the function
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  options: {
    retry?: Partial<RetryConfig>
    timeout?: Partial<TimeoutConfig>
  } = {}
): Promise<T> {
  const timeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...options.timeout }
  
  return withRetry(
    () => withTimeout(fn(), timeoutConfig),
    options.retry
  )
}
