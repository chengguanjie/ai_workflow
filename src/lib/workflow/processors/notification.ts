/**
 * Notification Node Processor
 *
 * 发送通知到各种平台
 * 支持：飞书、钉钉、企业微信
 *
 * 消息类型：
 * - text: 纯文本消息
 * - markdown: Markdown 格式消息
 * - card: 卡片消息（飞书/钉钉）
 */

import type { NodeConfig } from '@/types/workflow'
import type { NodeProcessor, ExecutionContext, NodeOutput } from '../types'

export interface NotificationNodeConfig {
  id: string
  type: 'NOTIFICATION'
  name: string
  position: { x: number; y: number }
  config: NotificationConfig
}

export interface NotificationConfig {
  platform: 'feishu' | 'dingtalk' | 'wecom'
  webhookUrl: string
  messageType: 'text' | 'markdown' | 'card'
  content: string
  title?: string // 用于 markdown 和 card 类型
  atMobiles?: string[] // @ 指定手机号
  atAll?: boolean // @ 所有人
}

// 变量替换
function replaceVariables(text: string, context: ExecutionContext): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
    const cleanVar = varPath.trim()
    const parts = cleanVar.split('.')

    if (parts.length === 0) {
      return match
    }

    const nodeName = parts[0]
    const nodeOutput = context.nodeOutputs.get(nodeName)

    if (!nodeOutput) {
      return match
    }

    let value: unknown = nodeOutput.data || nodeOutput
    for (let i = 1; i < parts.length; i++) {
      if (value && typeof value === 'object' && parts[i] in value) {
        value = (value as Record<string, unknown>)[parts[i]]
      } else {
        return match
      }
    }

    if (value === undefined || value === null) {
      return match
    }

    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  })
}

/**
 * 发送飞书消息
 */
async function sendFeishuMessage(
  webhookUrl: string,
  config: NotificationConfig,
  resolvedContent: string,
  resolvedTitle?: string
): Promise<{ success: boolean; error?: string; response?: unknown }> {
  let body: Record<string, unknown>

  switch (config.messageType) {
    case 'text':
      body = {
        msg_type: 'text',
        content: {
          text: resolvedContent,
        },
      }
      break

    case 'markdown':
      // 飞书使用 interactive 类型发送 Markdown
      body = {
        msg_type: 'interactive',
        card: {
          header: resolvedTitle
            ? {
                title: {
                  tag: 'plain_text',
                  content: resolvedTitle,
                },
                template: 'blue',
              }
            : undefined,
          elements: [
            {
              tag: 'markdown',
              content: resolvedContent,
            },
          ],
        },
      }
      break

    case 'card':
      body = {
        msg_type: 'interactive',
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: resolvedTitle || '通知',
            },
            template: 'blue',
          },
          elements: [
            {
              tag: 'markdown',
              content: resolvedContent,
            },
          ],
        },
      }
      break

    default:
      body = {
        msg_type: 'text',
        content: {
          text: resolvedContent,
        },
      }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  // 飞书成功响应: { code: 0 }
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
  config: NotificationConfig,
  resolvedContent: string,
  resolvedTitle?: string
): Promise<{ success: boolean; error?: string; response?: unknown }> {
  let body: Record<string, unknown>

  const at = {
    atMobiles: config.atMobiles || [],
    isAtAll: config.atAll || false,
  }

  switch (config.messageType) {
    case 'text':
      body = {
        msgtype: 'text',
        text: {
          content: resolvedContent,
        },
        at,
      }
      break

    case 'markdown':
      body = {
        msgtype: 'markdown',
        markdown: {
          title: resolvedTitle || '通知',
          text: resolvedContent,
        },
        at,
      }
      break

    case 'card':
      // 钉钉 ActionCard
      body = {
        msgtype: 'actionCard',
        actionCard: {
          title: resolvedTitle || '通知',
          text: resolvedContent,
          hideAvatar: '0',
          btnOrientation: '0',
        },
      }
      break

    default:
      body = {
        msgtype: 'text',
        text: {
          content: resolvedContent,
        },
        at,
      }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  // 钉钉成功响应: { errcode: 0 }
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
  config: NotificationConfig,
  resolvedContent: string,
  resolvedTitle?: string
): Promise<{ success: boolean; error?: string; response?: unknown }> {
  let body: Record<string, unknown>

  switch (config.messageType) {
    case 'text':
      body = {
        msgtype: 'text',
        text: {
          content: resolvedContent,
          mentioned_mobile_list: config.atMobiles || [],
        },
      }
      break

    case 'markdown':
      body = {
        msgtype: 'markdown',
        markdown: {
          content: resolvedTitle
            ? `## ${resolvedTitle}\n${resolvedContent}`
            : resolvedContent,
        },
      }
      break

    case 'card':
      // 企业微信使用 template_card
      body = {
        msgtype: 'template_card',
        template_card: {
          card_type: 'text_notice',
          main_title: {
            title: resolvedTitle || '通知',
          },
          sub_title_text: resolvedContent.substring(0, 200),
          horizontal_content_list: [],
          card_action: {
            type: 1,
            url: '',
          },
        },
      }
      break

    default:
      body = {
        msgtype: 'text',
        text: {
          content: resolvedContent,
        },
      }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  // 企业微信成功响应: { errcode: 0 }
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
 * 通知节点处理器
 */
export async function processNotificationNode(
  node: NotificationNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const startedAt = new Date()
  const { platform, webhookUrl, messageType, content, title } = node.config

  if (!webhookUrl) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'error',
      data: {},
      error: '通知节点需要配置 Webhook URL',
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  }

  if (!content) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'error',
      data: {},
      error: '通知节点需要配置消息内容',
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  }

  try {
    // 替换变量
    const resolvedContent = replaceVariables(content, context)
    const resolvedTitle = title ? replaceVariables(title, context) : undefined

    let result: { success: boolean; error?: string; response?: unknown }

    switch (platform) {
      case 'feishu':
        result = await sendFeishuMessage(webhookUrl, node.config, resolvedContent, resolvedTitle)
        break

      case 'dingtalk':
        result = await sendDingtalkMessage(webhookUrl, node.config, resolvedContent, resolvedTitle)
        break

      case 'wecom':
        result = await sendWecomMessage(webhookUrl, node.config, resolvedContent, resolvedTitle)
        break

      default:
        throw new Error(`不支持的平台: ${platform}`)
    }

    const completedAt = new Date()
    const duration = completedAt.getTime() - startedAt.getTime()

    if (result.success) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          platform,
          messageType,
          sent: true,
          response: result.response,
        },
        startedAt,
        completedAt,
        duration,
      }
    } else {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {
          platform,
          messageType,
          sent: false,
          response: result.response,
        },
        error: result.error,
        startedAt,
        completedAt,
        duration,
      }
    }
  } catch (error) {
    const completedAt = new Date()
    const duration = completedAt.getTime() - startedAt.getTime()
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'error',
      data: {
        platform,
        messageType,
        sent: false,
      },
      error: errorMessage,
      startedAt,
      completedAt,
      duration,
    }
  }
}

/**
 * NOTIFICATION 节点处理器
 */
export const notificationNodeProcessor: NodeProcessor = {
  nodeType: 'NOTIFICATION',
  process: (node: NodeConfig, context: ExecutionContext) =>
    processNotificationNode(node as NotificationNodeConfig, context),
}
