/**
 * 通知工具执行器
 * 
 * 支持飞书、钉钉、企业微信等平台的消息发送
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'

/**
 * 发送飞书消息
 */
async function sendFeishuMessage(
  webhookUrl: string,
  content: string,
  title?: string,
  messageType: 'text' | 'markdown' | 'card' = 'text'
): Promise<{ success: boolean; error?: string; response?: unknown }> {
  let body: Record<string, unknown>

  switch (messageType) {
    case 'text':
      body = {
        msg_type: 'text',
        content: { text: content },
      }
      break

    case 'markdown':
      body = {
        msg_type: 'interactive',
        card: {
          header: title ? {
            title: { tag: 'plain_text', content: title },
            template: 'blue',
          } : undefined,
          elements: [{ tag: 'markdown', content }],
        },
      }
      break

    case 'card':
      body = {
        msg_type: 'interactive',
        card: {
          header: {
            title: { tag: 'plain_text', content: title || '通知' },
            template: 'blue',
          },
          elements: [{ tag: 'markdown', content }],
        },
      }
      break
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (data.code === 0 || data.StatusCode === 0) {
    return { success: true, response: data }
  }

  return {
    success: false,
    error: data.msg || data.Message || '发送失败',
    response: data,
  }
}

/**
 * 发送钉钉消息
 */
async function sendDingtalkMessage(
  webhookUrl: string,
  content: string,
  title?: string,
  messageType: 'text' | 'markdown' | 'card' = 'text',
  atMobiles?: string[],
  atAll?: boolean
): Promise<{ success: boolean; error?: string; response?: unknown }> {
  let body: Record<string, unknown>
  const at = { atMobiles: atMobiles || [], isAtAll: atAll || false }

  switch (messageType) {
    case 'text':
      body = { msgtype: 'text', text: { content }, at }
      break

    case 'markdown':
      body = {
        msgtype: 'markdown',
        markdown: { title: title || '通知', text: content },
        at,
      }
      break

    case 'card':
      body = {
        msgtype: 'actionCard',
        actionCard: {
          title: title || '通知',
          text: content,
          hideAvatar: '0',
          btnOrientation: '0',
        },
      }
      break
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (data.errcode === 0) {
    return { success: true, response: data }
  }

  return {
    success: false,
    error: data.errmsg || '发送失败',
    response: data,
  }
}

/**
 * 发送企业微信消息
 */
async function sendWecomMessage(
  webhookUrl: string,
  content: string,
  title?: string,
  messageType: 'text' | 'markdown' | 'card' = 'text',
  atMobiles?: string[]
): Promise<{ success: boolean; error?: string; response?: unknown }> {
  let body: Record<string, unknown>

  switch (messageType) {
    case 'text':
      body = {
        msgtype: 'text',
        text: {
          content,
          mentioned_mobile_list: atMobiles || [],
        },
      }
      break

    case 'markdown':
      body = {
        msgtype: 'markdown',
        markdown: {
          content: title ? `## ${title}\n${content}` : content,
        },
      }
      break

    case 'card':
      body = {
        msgtype: 'template_card',
        template_card: {
          card_type: 'text_notice',
          main_title: { title: title || '通知' },
          sub_title_text: content.substring(0, 200),
          horizontal_content_list: [],
          card_action: { type: 1, url: '' },
        },
      }
      break
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (data.errcode === 0) {
    return { success: true, response: data }
  }

  return {
    success: false,
    error: data.errmsg || '发送失败',
    response: data,
  }
}

/**
 * 通知工具执行器
 */
export class NotificationToolExecutor implements ToolExecutor {
  name = 'send_notification'
  description = '发送通知消息到飞书、钉钉或企业微信'
  category = 'notification'

  private webhookUrl?: string
  private platform?: 'feishu' | 'dingtalk' | 'wecom'

  constructor(config?: { webhookUrl?: string; platform?: 'feishu' | 'dingtalk' | 'wecom' }) {
    this.webhookUrl = config?.webhookUrl
    this.platform = config?.platform
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'notification',
      parameters: [
        {
          name: 'platform',
          type: 'string',
          description: '通知平台：feishu（飞书）、dingtalk（钉钉）、wecom（企业微信）',
          required: !this.platform,
          enum: ['feishu', 'dingtalk', 'wecom'],
        },
        {
          name: 'webhook_url',
          type: 'string',
          description: 'Webhook URL 地址',
          required: !this.webhookUrl,
        },
        {
          name: 'content',
          type: 'string',
          description: '消息内容',
          required: true,
        },
        {
          name: 'title',
          type: 'string',
          description: '消息标题（可选，用于 markdown 和 card 类型）',
          required: false,
        },
        {
          name: 'message_type',
          type: 'string',
          description: '消息类型：text（纯文本）、markdown、card（卡片）',
          required: false,
          enum: ['text', 'markdown', 'card'],
          default: 'text',
        },
        {
          name: 'at_mobiles',
          type: 'array',
          description: '需要@的手机号列表（钉钉/企业微信支持）',
          required: false,
          items: { type: 'string' },
        },
        {
          name: 'at_all',
          type: 'boolean',
          description: '是否@所有人（钉钉支持）',
          required: false,
          default: false,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    const platform = (args.platform as string) || this.platform
    const webhookUrl = (args.webhook_url as string) || this.webhookUrl
    const content = args.content as string
    const title = args.title as string | undefined
    const messageType = (args.message_type as 'text' | 'markdown' | 'card') || 'text'
    const atMobiles = args.at_mobiles as string[] | undefined
    const atAll = args.at_all as boolean | undefined

    if (!platform) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: platform',
      }
    }

    if (!webhookUrl) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: webhook_url',
      }
    }

    if (!content) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: content',
      }
    }

    // 测试模式下不实际发送
    if (context.testMode) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: true,
        result: {
          testMode: true,
          message: `[测试模式] 将发送 ${platform} ${messageType} 消息`,
          platform,
          messageType,
          content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        },
      }
    }

    try {
      let result: { success: boolean; error?: string; response?: unknown }

      switch (platform) {
        case 'feishu':
          result = await sendFeishuMessage(webhookUrl, content, title, messageType)
          break
        case 'dingtalk':
          result = await sendDingtalkMessage(webhookUrl, content, title, messageType, atMobiles, atAll)
          break
        case 'wecom':
          result = await sendWecomMessage(webhookUrl, content, title, messageType, atMobiles)
          break
        default:
          return {
            toolCallId: '',
            toolName: this.name,
            success: false,
            error: `不支持的平台: ${platform}`,
          }
      }

      return {
        toolCallId: '',
        toolName: this.name,
        success: result.success,
        result: result.response,
        error: result.error,
      }
    } catch (error) {
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
 * 创建飞书专用通知工具
 */
export function createFeishuNotificationTool(webhookUrl: string): NotificationToolExecutor {
  const executor = new NotificationToolExecutor({ webhookUrl, platform: 'feishu' })
  executor.name = 'send_feishu_notification'
  executor.description = '发送飞书通知消息'
  return executor
}

/**
 * 创建钉钉专用通知工具
 */
export function createDingtalkNotificationTool(webhookUrl: string): NotificationToolExecutor {
  const executor = new NotificationToolExecutor({ webhookUrl, platform: 'dingtalk' })
  executor.name = 'send_dingtalk_notification'
  executor.description = '发送钉钉通知消息'
  return executor
}

/**
 * 创建企业微信专用通知工具
 */
export function createWecomNotificationTool(webhookUrl: string): NotificationToolExecutor {
  const executor = new NotificationToolExecutor({ webhookUrl, platform: 'wecom' })
  executor.name = 'send_wecom_notification'
  executor.description = '发送企业微信通知消息'
  return executor
}
