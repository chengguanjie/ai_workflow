/**
 * MCP (Model Context Protocol) Tool Executor
 *
 * Executes MCP tools by connecting to MCP servers and calling their tools.
 * Supports variable reference resolution using {{variable}} syntax.
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'
import type { MCPServerConfig, MCPToolResult } from '../../../mcp/types'
import {
  MCPErrorCode,
  MCPError,
  isRetryableError,
  formatErrorForUI,
  formatErrorForLog,
} from '../../../mcp/errors'
import {
  connect,
  disconnect,
  callTool,
  isValidMCPUrl,
} from '../../../mcp/client'

/**
 * Retry configuration for MCP operations
 */
interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors: string[]
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    MCPErrorCode.UNREACHABLE,
    MCPErrorCode.TIMEOUT,
    'ECONNRESET',
    'ETIMEDOUT',
  ],
}

/**
 * MCP Tool execution arguments
 */
export interface MCPToolArgs {
  /** MCP server configuration */
  serverConfig: MCPServerConfig
  /** Name of the tool to call */
  toolName: string
  /** Arguments to pass to the tool */
  toolArgs: Record<string, unknown>
  /** Whether to retry on transient errors */
  retryOnError?: boolean
  /** Maximum retry attempts */
  maxRetries?: number
  /** Timeout in milliseconds */
  timeoutMs?: number
}

/**
 * Variable reference pattern: {{variableName}} or {{path.to.variable}}
 */
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

/**
 * Checks if a value contains variable references
 */
export function containsVariableRef(value: unknown): boolean {
  if (typeof value === 'string') {
    // Use a new regex without global flag to avoid state issues
    return /\{\{[^}]+\}\}/.test(value)
  }
  return false
}

/**
 * Resolves a variable path from the context
 * @param path - Variable path (e.g., "input.message" or "node_1.output")
 * @param context - Execution context containing variables
 * @returns Resolved value or undefined if not found
 */
export function resolveVariablePath(
  path: string,
  variables: Record<string, unknown>
): unknown {
  const parts = path.trim().split('.')
  let current: unknown = variables

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Resolves all variable references in a string
 * @param value - String potentially containing {{variable}} references
 * @param variables - Variables to resolve from
 * @returns String with all variables resolved
 */
export function resolveVariableString(
  value: string,
  variables: Record<string, unknown>
): string {
  return value.replace(VARIABLE_PATTERN, (match, path) => {
    const resolved = resolveVariablePath(path, variables)
    if (resolved === undefined) {
      // Keep original if not found
      return match
    }
    if (typeof resolved === 'string') {
      return resolved
    }
    // Convert non-string values to JSON
    return JSON.stringify(resolved)
  })
}

/**
 * Recursively resolves all variable references in an object
 * @param value - Value to resolve (can be any type)
 * @param variables - Variables to resolve from
 * @returns Value with all variables resolved
 */
export function resolveVariables(
  value: unknown,
  variables: Record<string, unknown>
): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    // Check if the entire string is a single variable reference
    const singleVarMatch = value.match(/^\{\{([^}]+)\}\}$/)
    if (singleVarMatch) {
      // Return the actual value (preserving type)
      const resolved = resolveVariablePath(singleVarMatch[1], variables)
      return resolved !== undefined ? resolved : value
    }
    // Otherwise, resolve as string interpolation
    return resolveVariableString(value, variables)
  }

  if (Array.isArray(value)) {
    return value.map(item => resolveVariables(item, variables))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveVariables(val, variables)
    }
    return result
  }

  // Return primitives as-is
  return value
}

/**
 * Validates that all variable references in a value exist in the context
 * @param value - Value to validate
 * @param variables - Available variables
 * @returns Array of missing variable paths
 */
export function validateVariableRefs(
  value: unknown,
  variables: Record<string, unknown>
): string[] {
  const missing: string[] = []

  function check(val: unknown): void {
    if (typeof val === 'string') {
      const matches = val.matchAll(VARIABLE_PATTERN)
      for (const match of matches) {
        const path = match[1]
        if (resolveVariablePath(path, variables) === undefined) {
          missing.push(path)
        }
      }
    } else if (Array.isArray(val)) {
      val.forEach(check)
    } else if (val !== null && typeof val === 'object') {
      Object.values(val).forEach(check)
    }
  }

  check(value)
  return missing
}

/**
 * Delays execution for a specified time
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculates delay for exponential backoff
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * Checks if an error is retryable based on the retry config
 */
function isRetryableErrorForConfig(error: unknown, config: RetryConfig): boolean {
  // Use the centralized isRetryableError function
  if (isRetryableError(error)) {
    return true
  }
  
  // Also check against the config's retryable errors list
  if (error instanceof MCPError) {
    return config.retryableErrors.includes(error.code)
  }
  if (error instanceof Error) {
    return config.retryableErrors.some(code => error.message.includes(code))
  }
  return false
}

/**
 * Formats MCP tool result for AI consumption
 */
function formatMCPResult(result: MCPToolResult): unknown {
  if (result.isError) {
    return {
      error: true,
      content: result.content.map(c => c.text || c.data || c.uri).join('\n'),
    }
  }

  // If there's only one text content, return it directly
  if (result.content.length === 1 && result.content[0].type === 'text') {
    return result.content[0].text
  }

  // Otherwise, return structured content
  return {
    content: result.content.map(c => {
      if (c.type === 'text') {
        return { type: 'text', text: c.text }
      }
      if (c.type === 'image') {
        return { type: 'image', mimeType: c.mimeType, data: c.data }
      }
      if (c.type === 'resource') {
        return { type: 'resource', uri: c.uri, mimeType: c.mimeType }
      }
      return c
    }),
  }
}

/**
 * MCP Tool Executor
 * 
 * Executes tools on MCP servers with support for:
 * - Variable reference resolution ({{variable}} syntax)
 * - Automatic retry with exponential backoff
 * - Connection management
 * - Error handling and logging
 */
export class MCPToolExecutor implements ToolExecutor {
  name = 'mcp_tool'
  description = '调用 MCP (Model Context Protocol) 服务器上的工具'
  category = 'mcp'

  private retryConfig: RetryConfig

  constructor(config?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'serverConfig',
          type: 'object',
          description: 'MCP 服务器配置，包含 url、transport、authType 等',
          required: true,
          properties: {
            url: {
              name: 'url',
              type: 'string',
              description: 'MCP 服务器 URL',
              required: true,
            },
            transport: {
              name: 'transport',
              type: 'string',
              description: '传输协议: sse 或 http',
              required: false,
              enum: ['sse', 'http'],
              default: 'http',
            },
            authType: {
              name: 'authType',
              type: 'string',
              description: '认证类型: none、api-key 或 bearer',
              required: false,
              enum: ['none', 'api-key', 'bearer'],
              default: 'none',
            },
            apiKey: {
              name: 'apiKey',
              type: 'string',
              description: 'API 密钥（当 authType 为 api-key 或 bearer 时需要）',
              required: false,
            },
          },
        },
        {
          name: 'toolName',
          type: 'string',
          description: '要调用的 MCP 工具名称',
          required: true,
        },
        {
          name: 'toolArgs',
          type: 'object',
          description: '传递给工具的参数，支持 {{variable}} 变量引用',
          required: false,
        },
        {
          name: 'retryOnError',
          type: 'boolean',
          description: '是否在临时错误时重试',
          required: false,
          default: true,
        },
        {
          name: 'maxRetries',
          type: 'number',
          description: '最大重试次数',
          required: false,
          default: 3,
        },
        {
          name: 'timeoutMs',
          type: 'number',
          description: '超时时间（毫秒）',
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
    const {
      serverConfig,
      toolName,
      toolArgs = {},
      retryOnError = true,
      maxRetries = this.retryConfig.maxRetries,
      timeoutMs = 30000,
    } = args as unknown as MCPToolArgs

    // Validate required parameters
    if (!serverConfig) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: serverConfig',
      }
    }

    if (!toolName) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: toolName',
      }
    }

    // Validate server URL
    if (!serverConfig.url || !isValidMCPUrl(serverConfig.url)) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: `无效的 MCP 服务器 URL: ${serverConfig.url}`,
      }
    }

    // Resolve variable references in tool arguments
    const variables = context.variables || {}
    const missingVars = validateVariableRefs(toolArgs, variables)
    if (missingVars.length > 0) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: `变量引用未找到: ${missingVars.join(', ')}`,
      }
    }

    const resolvedArgs = resolveVariables(toolArgs, variables) as Record<string, unknown>

    // Log the request
    console.log('[MCP Tool] 执行工具调用:', {
      serverUrl: serverConfig.url,
      toolName,
      argsKeys: Object.keys(resolvedArgs),
      workflowId: context.workflowId,
      executionId: context.executionId,
    })

    // Test mode - return mock result
    if (context.testMode) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: true,
        result: {
          testMode: true,
          message: `[测试模式] 将调用 MCP 工具: ${toolName}`,
          serverUrl: serverConfig.url,
          toolName,
          resolvedArgs,
        },
      }
    }

    // Execute with retry logic
    const retryConfigWithOverrides = {
      ...this.retryConfig,
      maxRetries: retryOnError ? maxRetries : 0,
    }

    return this.executeWithRetry(
      { ...serverConfig, timeout: timeoutMs },
      toolName,
      resolvedArgs,
      retryConfigWithOverrides
    )
  }

  /**
   * Executes MCP tool call with retry logic
   */
  private async executeWithRetry(
    serverConfig: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    retryConfig: RetryConfig
  ): Promise<ToolCallResult> {
    let lastError: Error | undefined
    let connectionId: string | undefined

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Connect to server
        const connection = await connect(serverConfig)
        connectionId = connection.id

        // Call the tool
        const result = await callTool(connectionId, toolName, args)

        // Disconnect after successful call
        await disconnect(connectionId)

        // Log success
        console.log('[MCP Tool] 工具调用成功:', {
          toolName,
          isError: result.isError,
          contentCount: result.content.length,
        })

        return {
          toolCallId: '',
          toolName: this.name,
          success: !result.isError,
          result: formatMCPResult(result),
          error: result.isError ? '工具执行返回错误' : undefined,
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Clean up connection on error
        if (connectionId) {
          try {
            await disconnect(connectionId)
          } catch {
            // Ignore disconnect errors
          }
          connectionId = undefined
        }

        // Check if we should retry
        if (attempt < retryConfig.maxRetries && isRetryableErrorForConfig(error, retryConfig)) {
          const delayMs = calculateBackoffDelay(attempt, retryConfig)
          console.log('[MCP Tool] 重试中...', {
            attempt: attempt + 1,
            maxRetries: retryConfig.maxRetries,
            delayMs,
            error: lastError.message,
          })
          await delay(delayMs)
          continue
        }

        // No more retries
        break
      }
    }

    // All retries exhausted
    const errorMessage = this.formatErrorMessage(lastError)
    console.error('[MCP Tool] 工具调用失败:', {
      toolName,
      error: errorMessage,
    })

    return {
      toolCallId: '',
      toolName: this.name,
      success: false,
      error: errorMessage,
    }
  }

  /**
   * Formats error message for user display
   */
  private formatErrorMessage(error: Error | undefined): string {
    if (!error) {
      return 'MCP 工具调用失败'
    }

    // Use the centralized error formatting
    const formatted = formatErrorForUI(error, 'zh')
    return formatted.message
  }
}

/**
 * Creates an MCP tool executor with custom configuration
 */
export function createMCPToolExecutor(config?: Partial<RetryConfig>): MCPToolExecutor {
  return new MCPToolExecutor(config)
}
