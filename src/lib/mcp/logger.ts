/**
 * MCP Request/Response Logger
 * 
 * Provides logging functionality for MCP requests and responses.
 * Integrates with the debug panel for real-time monitoring.
 * 
 * Requirements: 8.2
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Log entry types
 */
export type MCPLogType = 'request' | 'response' | 'error' | 'info' | 'warning'

/**
 * Log entry severity levels
 */
export type MCPLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * MCP log entry structure
 */
export interface MCPLogEntry {
  /** Unique log entry ID */
  id: string
  /** Timestamp of the log entry */
  timestamp: Date
  /** Log type */
  type: MCPLogType
  /** Log level */
  level: MCPLogLevel
  /** Server URL or identifier */
  server?: string
  /** Tool name if applicable */
  tool?: string
  /** Request ID for correlation */
  requestId?: string
  /** Log message */
  message: string
  /** Request/response data */
  data?: unknown
  /** Duration in milliseconds (for responses) */
  durationMs?: number
  /** Error details if applicable */
  error?: {
    code: string
    message: string
    details?: unknown
  }
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Log filter options
 */
export interface MCPLogFilter {
  /** Filter by log type */
  types?: MCPLogType[]
  /** Filter by log level */
  levels?: MCPLogLevel[]
  /** Filter by server */
  server?: string
  /** Filter by tool */
  tool?: string
  /** Filter by request ID */
  requestId?: string
  /** Filter by time range (start) */
  startTime?: Date
  /** Filter by time range (end) */
  endTime?: Date
  /** Search in message */
  search?: string
}

/**
 * Logger configuration
 */
export interface MCPLoggerConfig {
  /** Maximum number of log entries to keep in memory */
  maxEntries: number
  /** Whether to log to console */
  consoleOutput: boolean
  /** Minimum log level to record */
  minLevel: MCPLogLevel
  /** Whether to include request/response data */
  includeData: boolean
  /** Maximum data size to log (in characters) */
  maxDataSize: number
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MCPLoggerConfig = {
  maxEntries: 1000,
  consoleOutput: process.env.NODE_ENV === 'development',
  minLevel: 'info',
  includeData: true,
  maxDataSize: 10000,
}

// ============================================================================
// Log Level Utilities
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<MCPLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function shouldLog(level: MCPLogLevel, minLevel: MCPLogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel]
}

// ============================================================================
// Logger Class
// ============================================================================

/**
 * MCP Logger for tracking requests and responses
 */
export class MCPLogger {
  private entries: MCPLogEntry[] = []
  private config: MCPLoggerConfig
  private listeners: Set<(entry: MCPLogEntry) => void> = new Set()

  constructor(config: Partial<MCPLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Generates a unique log entry ID
   */
  private generateId(): string {
    return `mcp_log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Truncates data if it exceeds max size
   */
  private truncateData(data: unknown): unknown {
    if (!this.config.includeData) {
      return undefined
    }

    const str = JSON.stringify(data)
    if (str.length > this.config.maxDataSize) {
      return {
        _truncated: true,
        _originalSize: str.length,
        _preview: str.substring(0, this.config.maxDataSize) + '...',
      }
    }
    return data
  }

  /**
   * Adds a log entry
   */
  private addEntry(entry: Omit<MCPLogEntry, 'id' | 'timestamp'>): MCPLogEntry {
    if (!shouldLog(entry.level, this.config.minLevel)) {
      return { ...entry, id: '', timestamp: new Date() }
    }

    const fullEntry: MCPLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
      data: this.truncateData(entry.data),
    }

    // Add to entries
    this.entries.push(fullEntry)

    // Trim if exceeds max
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries)
    }

    // Console output
    if (this.config.consoleOutput) {
      this.logToConsole(fullEntry)
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(fullEntry))

    return fullEntry
  }

  /**
   * Logs to console with appropriate formatting
   */
  private logToConsole(entry: MCPLogEntry): void {
    const prefix = `[MCP ${entry.type.toUpperCase()}]`
    const serverInfo = entry.server ? ` [${entry.server}]` : ''
    const toolInfo = entry.tool ? ` [${entry.tool}]` : ''
    const message = `${prefix}${serverInfo}${toolInfo} ${entry.message}`

    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.data || '')
        break
      case 'info':
        console.info(message, entry.data || '')
        break
      case 'warn':
        console.warn(message, entry.data || '')
        break
      case 'error':
        console.error(message, entry.error || entry.data || '')
        break
    }
  }

  /**
   * Logs an MCP request
   */
  logRequest(options: {
    server: string
    method: string
    tool?: string
    requestId?: string
    params?: unknown
    metadata?: Record<string, unknown>
  }): MCPLogEntry {
    return this.addEntry({
      type: 'request',
      level: 'info',
      server: options.server,
      tool: options.tool,
      requestId: options.requestId,
      message: `Request: ${options.method}${options.tool ? ` (${options.tool})` : ''}`,
      data: options.params,
      metadata: options.metadata,
    })
  }

  /**
   * Logs an MCP response
   */
  logResponse(options: {
    server: string
    method: string
    tool?: string
    requestId?: string
    result?: unknown
    durationMs: number
    metadata?: Record<string, unknown>
  }): MCPLogEntry {
    return this.addEntry({
      type: 'response',
      level: 'info',
      server: options.server,
      tool: options.tool,
      requestId: options.requestId,
      message: `Response: ${options.method}${options.tool ? ` (${options.tool})` : ''} - ${options.durationMs}ms`,
      data: options.result,
      durationMs: options.durationMs,
      metadata: options.metadata,
    })
  }

  /**
   * Logs an MCP error
   */
  logError(options: {
    server?: string
    tool?: string
    requestId?: string
    error: {
      code: string
      message: string
      details?: unknown
    }
    metadata?: Record<string, unknown>
  }): MCPLogEntry {
    return this.addEntry({
      type: 'error',
      level: 'error',
      server: options.server,
      tool: options.tool,
      requestId: options.requestId,
      message: `Error: ${options.error.code} - ${options.error.message}`,
      error: options.error,
      metadata: options.metadata,
    })
  }

  /**
   * Logs an info message
   */
  info(message: string, options?: {
    server?: string
    tool?: string
    data?: unknown
    metadata?: Record<string, unknown>
  }): MCPLogEntry {
    return this.addEntry({
      type: 'info',
      level: 'info',
      message,
      ...options,
    })
  }

  /**
   * Logs a warning message
   */
  warn(message: string, options?: {
    server?: string
    tool?: string
    data?: unknown
    metadata?: Record<string, unknown>
  }): MCPLogEntry {
    return this.addEntry({
      type: 'warning',
      level: 'warn',
      message,
      ...options,
    })
  }

  /**
   * Logs a debug message
   */
  debug(message: string, options?: {
    server?: string
    tool?: string
    data?: unknown
    metadata?: Record<string, unknown>
  }): MCPLogEntry {
    return this.addEntry({
      type: 'info',
      level: 'debug',
      message,
      ...options,
    })
  }

  /**
   * Gets all log entries
   */
  getEntries(): MCPLogEntry[] {
    return [...this.entries]
  }

  /**
   * Gets filtered log entries
   */
  getFilteredEntries(filter: MCPLogFilter): MCPLogEntry[] {
    return this.entries.filter(entry => {
      if (filter.types && !filter.types.includes(entry.type)) {
        return false
      }
      if (filter.levels && !filter.levels.includes(entry.level)) {
        return false
      }
      if (filter.server && entry.server !== filter.server) {
        return false
      }
      if (filter.tool && entry.tool !== filter.tool) {
        return false
      }
      if (filter.requestId && entry.requestId !== filter.requestId) {
        return false
      }
      if (filter.startTime && entry.timestamp < filter.startTime) {
        return false
      }
      if (filter.endTime && entry.timestamp > filter.endTime) {
        return false
      }
      if (filter.search && !entry.message.toLowerCase().includes(filter.search.toLowerCase())) {
        return false
      }
      return true
    })
  }

  /**
   * Clears all log entries
   */
  clear(): void {
    this.entries = []
  }

  /**
   * Adds a listener for new log entries
   */
  addListener(listener: (entry: MCPLogEntry) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Updates logger configuration
   */
  updateConfig(config: Partial<MCPLoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Gets current configuration
   */
  getConfig(): MCPLoggerConfig {
    return { ...this.config }
  }

  /**
   * Exports logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.entries, null, 2)
  }

  /**
   * Gets log statistics
   */
  getStats(): {
    total: number
    byType: Record<MCPLogType, number>
    byLevel: Record<MCPLogLevel, number>
    averageResponseTime: number
  } {
    const byType: Record<MCPLogType, number> = {
      request: 0,
      response: 0,
      error: 0,
      info: 0,
      warning: 0,
    }
    const byLevel: Record<MCPLogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    }
    let totalResponseTime = 0
    let responseCount = 0

    for (const entry of this.entries) {
      byType[entry.type]++
      byLevel[entry.level]++
      if (entry.durationMs !== undefined) {
        totalResponseTime += entry.durationMs
        responseCount++
      }
    }

    return {
      total: this.entries.length,
      byType,
      byLevel,
      averageResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0,
    }
  }
}

// ============================================================================
// Global Logger Instance
// ============================================================================

/**
 * Global MCP logger instance
 */
export const mcpLogger = new MCPLogger()

/**
 * Creates a scoped logger for a specific server
 */
export function createScopedLogger(server: string): {
  logRequest: (method: string, params?: unknown, tool?: string) => MCPLogEntry
  logResponse: (method: string, result: unknown, durationMs: number, tool?: string) => MCPLogEntry
  logError: (error: { code: string; message: string; details?: unknown }, tool?: string) => MCPLogEntry
  info: (message: string, data?: unknown) => MCPLogEntry
  warn: (message: string, data?: unknown) => MCPLogEntry
  debug: (message: string, data?: unknown) => MCPLogEntry
} {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  return {
    logRequest: (method, params, tool) =>
      mcpLogger.logRequest({ server, method, params, tool, requestId }),
    logResponse: (method, result, durationMs, tool) =>
      mcpLogger.logResponse({ server, method, result, durationMs, tool, requestId }),
    logError: (error, tool) =>
      mcpLogger.logError({ server, error, tool, requestId }),
    info: (message, data) =>
      mcpLogger.info(message, { server, data }),
    warn: (message, data) =>
      mcpLogger.warn(message, { server, data }),
    debug: (message, data) =>
      mcpLogger.debug(message, { server, data }),
  }
}
