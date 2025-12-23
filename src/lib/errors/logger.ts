/**
 * Error Logger Service
 * 
 * Provides comprehensive error logging with full stack traces, context,
 * request details, and severity-based classification.
 * 
 * @module errors/logger
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import {
  ErrorSeverity,
  ErrorContext,
  EnhancedErrorDetails,
} from './types'
import { EnhancedAppError } from './enhanced-errors'

// ============================================================================
// Types
// ============================================================================

/**
 * Request details for error logging
 */
export interface RequestDetails {
  /** HTTP method */
  method: string
  /** Request URL */
  url: string
  /** User agent string */
  userAgent?: string
  /** Client IP address */
  ip?: string
  /** Request headers (sanitized) */
  headers?: Record<string, string>
  /** Request body (sanitized) */
  body?: unknown
}

/**
 * Complete error log entry structure
 */
export interface ErrorLogEntry {
  /** Unique request ID for tracking */
  requestId: string
  /** ISO timestamp when the error occurred */
  timestamp: string
  /** Error severity level */
  severity: ErrorSeverity
  /** Error code for identification */
  code: string
  /** Human-readable error message */
  message: string
  /** Full error stack trace */
  stack?: string
  /** Error context information */
  context?: ErrorContext
  /** Request details */
  request?: RequestDetails
  /** User ID if available */
  userId?: string
  /** Organization ID if available */
  organizationId?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Alert handler function type
 */
export type AlertHandler = (entry: ErrorLogEntry) => void | Promise<void>

/**
 * Log output handler function type
 */
export type LogOutputHandler = (
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  data?: Record<string, unknown>
) => void

/**
 * Error logger configuration
 */
export interface ErrorLoggerConfig {
  /** Whether to include stack traces in logs */
  includeStackTrace?: boolean
  /** Whether to include request body in logs */
  includeRequestBody?: boolean
  /** Custom alert handlers for critical errors */
  alertHandlers?: AlertHandler[]
  /** Custom log output handler */
  logOutput?: LogOutputHandler
  /** Environment (affects log verbosity) */
  environment?: 'development' | 'production' | 'test'
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<ErrorLoggerConfig> = {
  includeStackTrace: true,
  includeRequestBody: false,
  alertHandlers: [],
  logOutput: defaultLogOutput,
  environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
}

// ============================================================================
// Error Logger Class
// ============================================================================

/**
 * Error Logger Service
 * 
 * Provides centralized error logging with:
 * - Full stack trace capture
 * - Context and request details
 * - Severity-based classification
 * - Critical error alerting
 */
export class ErrorLogger {
  private config: Required<ErrorLoggerConfig>
  private alertHandlers: AlertHandler[] = []

  constructor(config?: ErrorLoggerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.alertHandlers = [...this.config.alertHandlers]
  }

  /**
   * Registers an alert handler for critical errors
   */
  registerAlertHandler(handler: AlertHandler): void {
    this.alertHandlers.push(handler)
  }

  /**
   * Removes an alert handler
   */
  removeAlertHandler(handler: AlertHandler): void {
    const index = this.alertHandlers.indexOf(handler)
    if (index > -1) {
      this.alertHandlers.splice(index, 1)
    }
  }

  /**
   * Logs an error with full context
   */
  async logError(entry: ErrorLogEntry): Promise<void> {
    const logLevel = this.getLogLevel(entry.severity)
    const formattedMessage = this.formatLogMessage(entry)
    const logData = this.buildLogData(entry)

    // Output the log
    this.config.logOutput(logLevel, formattedMessage, logData)

    // Trigger alerts for critical errors
    if (entry.severity === 'critical') {
      await this.triggerAlerts(entry)
    }
  }

  /**
   * Creates an error log entry from an EnhancedAppError
   */
  createLogEntry(
    error: EnhancedAppError,
    requestId: string,
    options?: {
      request?: RequestDetails
      userId?: string
      organizationId?: string
      metadata?: Record<string, unknown>
    }
  ): ErrorLogEntry {
    return {
      requestId,
      timestamp: new Date().toISOString(),
      severity: error.severity,
      code: error.code,
      message: error.message,
      stack: this.config.includeStackTrace ? error.stack : undefined,
      context: error.context,
      request: options?.request,
      userId: options?.userId ?? error.context?.userId,
      organizationId: options?.organizationId ?? error.context?.organizationId,
      metadata: options?.metadata,
    }
  }

  /**
   * Creates an error log entry from an EnhancedErrorDetails object
   */
  createLogEntryFromDetails(
    details: EnhancedErrorDetails,
    options?: {
      stack?: string
      request?: RequestDetails
      userId?: string
      organizationId?: string
      metadata?: Record<string, unknown>
    }
  ): ErrorLogEntry {
    return {
      requestId: details.requestId,
      timestamp: details.timestamp,
      severity: details.severity,
      code: details.code,
      message: details.message,
      stack: this.config.includeStackTrace ? options?.stack : undefined,
      context: details.context,
      request: options?.request,
      userId: options?.userId ?? details.context?.userId,
      organizationId: options?.organizationId ?? details.context?.organizationId,
      metadata: options?.metadata,
    }
  }

  /**
   * Creates an error log entry from a standard Error
   */
  createLogEntryFromError(
    error: Error,
    requestId: string,
    severity: ErrorSeverity = 'error',
    options?: {
      code?: string
      context?: ErrorContext
      request?: RequestDetails
      userId?: string
      organizationId?: string
      metadata?: Record<string, unknown>
    }
  ): ErrorLogEntry {
    return {
      requestId,
      timestamp: new Date().toISOString(),
      severity,
      code: options?.code ?? 'INTERNAL_ERROR',
      message: error.message,
      stack: this.config.includeStackTrace ? error.stack : undefined,
      context: options?.context,
      request: options?.request,
      userId: options?.userId,
      organizationId: options?.organizationId,
      metadata: options?.metadata,
    }
  }

  /**
   * Maps error severity to console log level
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'debug' {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'error'
      case 'warning':
        return 'warn'
      case 'info':
        return 'info'
      default:
        return 'debug'
    }
  }

  /**
   * Formats the error log message
   */
  private formatLogMessage(entry: ErrorLogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.severity.toUpperCase()}]`,
      `[${entry.requestId}]`,
      `[${entry.code}]`,
      entry.message,
    ]

    if (entry.request) {
      parts.push(`| ${entry.request.method} ${entry.request.url}`)
    }

    if (entry.userId) {
      parts.push(`| User: ${entry.userId}`)
    }

    if (entry.organizationId) {
      parts.push(`| Org: ${entry.organizationId}`)
    }

    return parts.join(' ')
  }

  /**
   * Builds the log data object for structured logging
   */
  private buildLogData(entry: ErrorLogEntry): Record<string, unknown> {
    const data: Record<string, unknown> = {
      requestId: entry.requestId,
      timestamp: entry.timestamp,
      severity: entry.severity,
      code: entry.code,
      message: entry.message,
    }

    if (entry.stack && this.config.includeStackTrace) {
      data.stack = entry.stack
    }

    if (entry.context) {
      data.context = entry.context
    }

    if (entry.request) {
      data.request = {
        method: entry.request.method,
        url: entry.request.url,
        userAgent: entry.request.userAgent,
        ip: entry.request.ip,
      }

      if (this.config.includeRequestBody && entry.request.body) {
        data.request = {
          ...(data.request as Record<string, unknown>),
          body: entry.request.body,
        }
      }
    }

    if (entry.userId) {
      data.userId = entry.userId
    }

    if (entry.organizationId) {
      data.organizationId = entry.organizationId
    }

    if (entry.metadata) {
      data.metadata = entry.metadata
    }

    return data
  }

  /**
   * Triggers all registered alert handlers for critical errors
   */
  private async triggerAlerts(entry: ErrorLogEntry): Promise<void> {
    const alertPromises = this.alertHandlers.map(async (handler) => {
      try {
        await handler(entry)
      } catch (alertError) {
        // Log alert failure but don't throw
        console.error('[ErrorLogger] Alert handler failed:', alertError)
      }
    })

    await Promise.allSettled(alertPromises)
  }
}

// ============================================================================
// Default Log Output Handler
// ============================================================================

/**
 * Default log output handler using console
 */
function defaultLogOutput(
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  data?: Record<string, unknown>
): void {
  const isDev = process.env.NODE_ENV === 'development'

  switch (level) {
    case 'error':
      if (isDev && data) {
        console.error(message, JSON.stringify(data, null, 2))
      } else {
        console.error(message, data ? JSON.stringify(data) : '')
      }
      break
    case 'warn':
      if (isDev && data) {
        console.warn(message, JSON.stringify(data, null, 2))
      } else {
        console.warn(message, data ? JSON.stringify(data) : '')
      }
      break
    case 'info':
      if (isDev && data) {
        console.info(message, JSON.stringify(data, null, 2))
      } else {
        console.info(message, data ? JSON.stringify(data) : '')
      }
      break
    case 'debug':
    default:
      if (isDev && data) {
        console.log(message, JSON.stringify(data, null, 2))
      } else {
        console.log(message, data ? JSON.stringify(data) : '')
      }
      break
  }
}

// ============================================================================
// Built-in Alert Handlers
// ============================================================================

/**
 * Console alert handler - outputs critical errors with visual emphasis
 */
export function consoleAlertHandler(entry: ErrorLogEntry): void {
  console.error('🚨 ═══════════════════════════════════════════════════════════')
  console.error('🚨 CRITICAL ERROR ALERT')
  console.error('🚨 ═══════════════════════════════════════════════════════════')
  console.error(`🚨 Request ID: ${entry.requestId}`)
  console.error(`🚨 Timestamp:  ${entry.timestamp}`)
  console.error(`🚨 Code:       ${entry.code}`)
  console.error(`🚨 Message:    ${entry.message}`)
  
  if (entry.userId) {
    console.error(`🚨 User ID:    ${entry.userId}`)
  }
  
  if (entry.organizationId) {
    console.error(`🚨 Org ID:     ${entry.organizationId}`)
  }
  
  if (entry.request) {
    console.error(`🚨 Request:    ${entry.request.method} ${entry.request.url}`)
    if (entry.request.ip) {
      console.error(`🚨 Client IP:  ${entry.request.ip}`)
    }
  }
  
  if (entry.stack) {
    console.error('🚨 Stack Trace:')
    console.error(entry.stack)
  }
  
  console.error('🚨 ═══════════════════════════════════════════════════════════')
}

/**
 * Creates a webhook alert handler
 * 
 * @param webhookUrl - The URL to send alerts to
 * @param options - Additional options for the webhook
 */
export function createWebhookAlertHandler(
  webhookUrl: string,
  options?: {
    headers?: Record<string, string>
    timeout?: number
  }
): AlertHandler {
  return async (entry: ErrorLogEntry): Promise<void> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        options?.timeout ?? 5000
      )

      const payload = {
        type: 'critical_error',
        requestId: entry.requestId,
        timestamp: entry.timestamp,
        code: entry.code,
        message: entry.message,
        userId: entry.userId,
        organizationId: entry.organizationId,
        request: entry.request ? {
          method: entry.request.method,
          url: entry.request.url,
        } : undefined,
        context: entry.context,
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
    } catch (error) {
      console.error('[WebhookAlertHandler] Failed to send alert:', error)
    }
  }
}

/**
 * Creates an email alert handler (placeholder for integration)
 * 
 * @param config - Email configuration
 */
export function createEmailAlertHandler(config: {
  to: string[]
  from?: string
  subject?: string
}): AlertHandler {
  return async (entry: ErrorLogEntry): Promise<void> => {
    // This is a placeholder for email integration
    // In production, integrate with email services like:
    // - Resend
    // - SendGrid
    // - AWS SES
    // - Nodemailer
    
    console.warn(
      `[EmailAlertHandler] Email alert would be sent to: ${config.to.join(', ')}`
    )
    console.warn(`[EmailAlertHandler] Subject: ${config.subject ?? 'Critical Error Alert'}`)
    console.warn(`[EmailAlertHandler] Error: [${entry.code}] ${entry.message}`)
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default error logger instance
 */
let defaultLogger: ErrorLogger | null = null

/**
 * Gets the default error logger instance
 */
export function getErrorLogger(): ErrorLogger {
  if (!defaultLogger) {
    defaultLogger = new ErrorLogger({
      alertHandlers: [consoleAlertHandler],
    })
  }
  return defaultLogger
}

/**
 * Configures the default error logger
 */
export function configureErrorLogger(config: ErrorLoggerConfig): void {
  defaultLogger = new ErrorLogger({
    ...config,
    alertHandlers: [
      consoleAlertHandler,
      ...(config.alertHandlers ?? []),
    ],
  })
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Logs an error using the default logger
 */
export async function logError(entry: ErrorLogEntry): Promise<void> {
  return getErrorLogger().logError(entry)
}

/**
 * Logs an EnhancedAppError using the default logger
 */
export async function logEnhancedError(
  error: EnhancedAppError,
  requestId: string,
  options?: {
    request?: RequestDetails
    userId?: string
    organizationId?: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const logger = getErrorLogger()
  const entry = logger.createLogEntry(error, requestId, options)
  return logger.logError(entry)
}

/**
 * Logs a standard Error using the default logger
 */
export async function logStandardError(
  error: Error,
  requestId: string,
  severity: ErrorSeverity = 'error',
  options?: {
    code?: string
    context?: ErrorContext
    request?: RequestDetails
    userId?: string
    organizationId?: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const logger = getErrorLogger()
  const entry = logger.createLogEntryFromError(error, requestId, severity, options)
  return logger.logError(entry)
}

/**
 * Triggers a critical alert manually
 */
export async function triggerCriticalAlert(
  code: string,
  message: string,
  options?: {
    requestId?: string
    context?: ErrorContext
    request?: RequestDetails
    userId?: string
    organizationId?: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const entry: ErrorLogEntry = {
    requestId: options?.requestId ?? 'manual-alert',
    timestamp: new Date().toISOString(),
    severity: 'critical',
    code,
    message,
    context: options?.context,
    request: options?.request,
    userId: options?.userId,
    organizationId: options?.organizationId,
    metadata: options?.metadata,
  }

  return getErrorLogger().logError(entry)
}
