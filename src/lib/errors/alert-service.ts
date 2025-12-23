/**
 * Critical Error Alert Service
 * 
 * Provides integration with various notification channels for critical error alerts.
 * Supports console, webhook, email, and extensible custom handlers.
 * 
 * @module errors/alert-service
 * 
 * Requirements: 10.4
 */

import {
  ErrorLogEntry,
  AlertHandler,
  consoleAlertHandler,
  createWebhookAlertHandler,
  createEmailAlertHandler,
  getErrorLogger,
} from './logger'

// ============================================================================
// Types
// ============================================================================

/**
 * Alert channel configuration
 */
export interface AlertChannelConfig {
  /** Whether this channel is enabled */
  enabled: boolean
  /** Channel-specific configuration */
  config?: Record<string, unknown>
}

/**
 * Alert service configuration
 */
export interface AlertServiceConfig {
  /** Console alert configuration */
  console?: AlertChannelConfig
  /** Webhook alert configuration */
  webhook?: AlertChannelConfig & {
    config?: {
      url: string
      headers?: Record<string, string>
      timeout?: number
    }
  }
  /** Email alert configuration */
  email?: AlertChannelConfig & {
    config?: {
      to: string[]
      from?: string
      subject?: string
    }
  }
  /** Slack alert configuration */
  slack?: AlertChannelConfig & {
    config?: {
      webhookUrl: string
      channel?: string
      username?: string
      iconEmoji?: string
    }
  }
  /** Custom alert handlers */
  custom?: AlertHandler[]
}

// ============================================================================
// Alert Service Class
// ============================================================================

/**
 * Alert Service
 * 
 * Manages critical error alerting across multiple channels.
 * Integrates with the ErrorLogger to provide comprehensive alerting.
 */
export class AlertService {
  private handlers: AlertHandler[] = []
  private initialized = false

  constructor(config?: AlertServiceConfig) {
    if (config) {
      this.configure(config)
    }
  }

  /**
   * Configures the alert service with the specified channels
   */
  configure(config: AlertServiceConfig): void {
    this.handlers = []

    // Console alerts (enabled by default)
    if (config.console?.enabled !== false) {
      this.handlers.push(consoleAlertHandler)
    }

    // Webhook alerts
    if (config.webhook?.enabled && config.webhook.config?.url) {
      this.handlers.push(
        createWebhookAlertHandler(config.webhook.config.url, {
          headers: config.webhook.config.headers,
          timeout: config.webhook.config.timeout,
        })
      )
    }

    // Email alerts
    if (config.email?.enabled && config.email.config?.to?.length) {
      this.handlers.push(
        createEmailAlertHandler({
          to: config.email.config.to,
          from: config.email.config.from,
          subject: config.email.config.subject,
        })
      )
    }

    // Slack alerts
    if (config.slack?.enabled && config.slack.config?.webhookUrl) {
      this.handlers.push(
        createSlackAlertHandler(config.slack.config)
      )
    }

    // Custom handlers
    if (config.custom?.length) {
      this.handlers.push(...config.custom)
    }

    // Register handlers with the error logger
    this.registerWithLogger()
    this.initialized = true
  }

  /**
   * Registers all handlers with the error logger
   */
  private registerWithLogger(): void {
    const logger = getErrorLogger()
    for (const handler of this.handlers) {
      logger.registerAlertHandler(handler)
    }
  }

  /**
   * Adds a custom alert handler
   */
  addHandler(handler: AlertHandler): void {
    this.handlers.push(handler)
    if (this.initialized) {
      getErrorLogger().registerAlertHandler(handler)
    }
  }

  /**
   * Removes an alert handler
   */
  removeHandler(handler: AlertHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index > -1) {
      this.handlers.splice(index, 1)
      getErrorLogger().removeAlertHandler(handler)
    }
  }

  /**
   * Manually triggers an alert
   */
  async triggerAlert(entry: ErrorLogEntry): Promise<void> {
    const promises = this.handlers.map(async (handler) => {
      try {
        await handler(entry)
      } catch (error) {
        console.error('[AlertService] Handler failed:', error)
      }
    })

    await Promise.allSettled(promises)
  }

  /**
   * Gets the number of registered handlers
   */
  getHandlerCount(): number {
    return this.handlers.length
  }
}

// ============================================================================
// Slack Alert Handler
// ============================================================================

/**
 * Creates a Slack alert handler
 */
export function createSlackAlertHandler(config: {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
}): AlertHandler {
  return async (entry: ErrorLogEntry): Promise<void> => {
    try {
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Critical Error Alert',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Error Code:*\n${entry.code}`,
            },
            {
              type: 'mrkdwn',
              text: `*Severity:*\n${entry.severity.toUpperCase()}`,
            },
            {
              type: 'mrkdwn',
              text: `*Request ID:*\n${entry.requestId}`,
            },
            {
              type: 'mrkdwn',
              text: `*Timestamp:*\n${entry.timestamp}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Message:*\n${entry.message}`,
          },
        },
      ]

      // Add user info if available
      if (entry.userId || entry.organizationId) {
        const userFields = []
        if (entry.userId) {
          userFields.push({
            type: 'mrkdwn',
            text: `*User ID:*\n${entry.userId}`,
          })
        }
        if (entry.organizationId) {
          userFields.push({
            type: 'mrkdwn',
            text: `*Organization ID:*\n${entry.organizationId}`,
          })
        }
        blocks.push({
          type: 'section',
          fields: userFields,
        })
      }

      // Add request info if available
      if (entry.request) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Request:*\n\`${entry.request.method} ${entry.request.url}\``,
          },
        })
      }

      const payload: Record<string, unknown> = {
        blocks,
      }

      if (config.channel) {
        payload.channel = config.channel
      }
      if (config.username) {
        payload.username = config.username
      }
      if (config.iconEmoji) {
        payload.icon_emoji = config.iconEmoji
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
    } catch (error) {
      console.error('[SlackAlertHandler] Failed to send alert:', error)
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default alert service instance
 */
let defaultAlertService: AlertService | null = null

/**
 * Gets the default alert service instance
 */
export function getAlertService(): AlertService {
  if (!defaultAlertService) {
    defaultAlertService = new AlertService()
  }
  return defaultAlertService
}

/**
 * Initializes the alert service with configuration from environment
 */
export function initializeAlertService(): AlertService {
  const config: AlertServiceConfig = {
    console: {
      enabled: true,
    },
  }

  // Configure webhook alerts if URL is provided
  const webhookUrl = process.env.ERROR_ALERT_WEBHOOK_URL
  if (webhookUrl) {
    config.webhook = {
      enabled: true,
      config: {
        url: webhookUrl,
        timeout: parseInt(process.env.ERROR_ALERT_WEBHOOK_TIMEOUT ?? '5000', 10),
      },
    }
  }

  // Configure email alerts if recipients are provided
  const emailRecipients = process.env.ERROR_ALERT_EMAIL_TO
  if (emailRecipients) {
    config.email = {
      enabled: true,
      config: {
        to: emailRecipients.split(',').map(e => e.trim()),
        from: process.env.ERROR_ALERT_EMAIL_FROM,
        subject: process.env.ERROR_ALERT_EMAIL_SUBJECT ?? 'Critical Error Alert',
      },
    }
  }

  // Configure Slack alerts if webhook URL is provided
  const slackWebhookUrl = process.env.ERROR_ALERT_SLACK_WEBHOOK_URL
  if (slackWebhookUrl) {
    config.slack = {
      enabled: true,
      config: {
        webhookUrl: slackWebhookUrl,
        channel: process.env.ERROR_ALERT_SLACK_CHANNEL,
        username: process.env.ERROR_ALERT_SLACK_USERNAME ?? 'Error Alert Bot',
        iconEmoji: process.env.ERROR_ALERT_SLACK_ICON ?? ':rotating_light:',
      },
    }
  }

  defaultAlertService = new AlertService(config)
  return defaultAlertService
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Triggers a critical alert using the default alert service
 */
export async function sendCriticalAlert(
  code: string,
  message: string,
  options?: {
    requestId?: string
    context?: ErrorLogEntry['context']
    request?: ErrorLogEntry['request']
    userId?: string
    organizationId?: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const entry: ErrorLogEntry = {
    requestId: options?.requestId ?? `alert-${Date.now()}`,
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

  return getAlertService().triggerAlert(entry)
}
