/**
 * Safe Logger Module
 * 
 * Provides secure logging that automatically sanitizes sensitive information
 * before logging. Prevents sensitive data from appearing in logs.
 * 
 * @module security/safe-logger
 */

import { sanitizeErrorMessage, sanitizeErrorContext } from '@/lib/errors/sanitizer'

/**
 * Log levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/**
 * Configuration for safe logger
 */
export interface SafeLoggerConfig {
  /** Whether to enable logging (default: true in dev, false in production) */
  enabled?: boolean
  /** Minimum log level to output */
  minLevel?: LogLevel
  /** Whether to include stack traces for errors */
  includeStackTrace?: boolean
}

const isDevelopment = process.env.NODE_ENV === 'development'
const isProduction = process.env.NODE_ENV === 'production'

const DEFAULT_CONFIG: Required<SafeLoggerConfig> = {
  enabled: isDevelopment,
  minLevel: isDevelopment ? 'debug' : 'error',
  includeStackTrace: isDevelopment,
}

/**
 * Safe logger class that sanitizes sensitive information
 */
class SafeLogger {
  private config: Required<SafeLoggerConfig>

  constructor(config?: SafeLoggerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Sanitizes log data to remove sensitive information
   */
  private sanitizeData(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data
    }

    if (typeof data === 'string') {
      return sanitizeErrorMessage(data)
    }

    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitizeData(item))
      }

      // Sanitize object
      const sanitized: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive keys
        const lowerKey = key.toLowerCase()
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('token') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('key') ||
          lowerKey.includes('api') ||
          lowerKey.includes('auth')
        ) {
          sanitized[key] = '[REDACTED]'
        } else if (typeof value === 'string') {
          sanitized[key] = sanitizeErrorMessage(value)
        } else {
          sanitized[key] = this.sanitizeData(value)
        }
      }
      return sanitized
    }

    return data
  }

  /**
   * Checks if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) {
      return false
    }

    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug']
    const minIndex = levels.indexOf(this.config.minLevel)
    const currentIndex = levels.indexOf(level)

    return currentIndex <= minIndex
  }

  /**
   * Logs an error message
   */
  error(message: string, data?: unknown, error?: Error): void {
    if (!this.shouldLog('error')) {
      return
    }

    const sanitizedMessage = sanitizeErrorMessage(message)
    const sanitizedData = data ? this.sanitizeData(data) : undefined

    if (error) {
      const errorInfo: Record<string, unknown> = {
        message: sanitizeErrorMessage(error.message),
        name: error.name,
      }

      if (this.config.includeStackTrace && error.stack) {
        errorInfo.stack = sanitizeErrorMessage(error.stack)
      }

      console.error(`[ERROR] ${sanitizedMessage}`, sanitizedData || {}, errorInfo)
    } else {
      console.error(`[ERROR] ${sanitizedMessage}`, sanitizedData || {})
    }
  }

  /**
   * Logs a warning message
   */
  warn(message: string, data?: unknown): void {
    if (!this.shouldLog('warn')) {
      return
    }

    const sanitizedMessage = sanitizeErrorMessage(message)
    const sanitizedData = data ? this.sanitizeData(data) : undefined

    console.warn(`[WARN] ${sanitizedMessage}`, sanitizedData || {})
  }

  /**
   * Logs an info message
   */
  info(message: string, data?: unknown): void {
    if (!this.shouldLog('info')) {
      return
    }

    const sanitizedMessage = sanitizeErrorMessage(message)
    const sanitizedData = data ? this.sanitizeData(data) : undefined

    console.log(`[INFO] ${sanitizedMessage}`, sanitizedData || {})
  }

  /**
   * Logs a debug message (only in development)
   */
  debug(message: string, data?: unknown): void {
    if (!this.shouldLog('debug')) {
      return
    }

    const sanitizedMessage = sanitizeErrorMessage(message)
    const sanitizedData = data ? this.sanitizeData(data) : undefined

    console.log(`[DEBUG] ${sanitizedMessage}`, sanitizedData || {})
  }
}

// Export singleton instance
export const safeLogger = new SafeLogger({
  enabled: isDevelopment || process.env.ENABLE_LOGGING === 'true',
  minLevel: isProduction ? 'error' : 'debug',
  includeStackTrace: isDevelopment,
})

/**
 * Convenience functions for common logging patterns
 */
export const logError = (message: string, error?: Error, data?: unknown) => {
  safeLogger.error(message, data, error)
}

export const logWarn = (message: string, data?: unknown) => {
  safeLogger.warn(message, data)
}

export const logInfo = (message: string, data?: unknown) => {
  safeLogger.info(message, data)
}

export const logDebug = (message: string, data?: unknown) => {
  safeLogger.debug(message, data)
}
