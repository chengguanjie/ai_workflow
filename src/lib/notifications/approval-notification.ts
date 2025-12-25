/**
 * 审批通知服务
 *
 * 发送审批相关的通知：
 * - EMAIL: 邮件通知
 * - IN_APP: 站内信通知
 * - WEBHOOK: Webhook 通知
 */

import { prisma } from '@/lib/db'
import type { ApprovalNotification, NotificationType as _NotificationType, NotificationStatus as _NotificationStatus } from '@prisma/client'

interface SendNotificationResult {
  success: boolean
  error?: string
}

/**
 * 发送单个审批通知
 */
export async function sendApprovalNotification(
  notification: ApprovalNotification
): Promise<SendNotificationResult> {
  try {
    switch (notification.channel) {
      case 'EMAIL':
        return await sendEmailNotification(notification)
      case 'IN_APP':
        return await sendInAppNotification(notification)
      default:
        return { success: false, error: `不支持的通知类型: ${notification.channel}` }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '发送通知失败'

    // 更新通知状态为失败
    await prisma.approvalNotification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * 发送邮件通知
 *
 * 注意：目前项目未配置邮件服务，此功能暂时只更新状态
 * TODO: 集成邮件服务（如 Resend、SendGrid、Nodemailer 等）
 */
async function sendEmailNotification(
  notification: ApprovalNotification
): Promise<SendNotificationResult> {
  // 检查是否配置了邮件服务
  const smtpHost = process.env.SMTP_HOST
  const resendApiKey = process.env.RESEND_API_KEY

  if (!smtpHost && !resendApiKey) {
    // 未配置邮件服务，标记为失败
    await prisma.approvalNotification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        errorMessage: '未配置邮件服务 (SMTP_HOST 或 RESEND_API_KEY)',
      },
    })

    console.warn(
      `[ApprovalNotification] Email notification ${notification.id} failed: 未配置邮件服务`
    )

    return {
      success: false,
      error: '未配置邮件服务',
    }
  }

  // TODO: 实现邮件发送逻辑
  // 1. 如果配置了 RESEND_API_KEY，使用 Resend API
  // 2. 如果配置了 SMTP_HOST，使用 SMTP 发送

  // 暂时标记为失败，等待邮件服务集成
  await prisma.approvalNotification.update({
    where: { id: notification.id },
    data: {
      status: 'FAILED',
      errorMessage: '邮件发送功能待实现',
    },
  })

  return {
    success: false,
    error: '邮件发送功能待实现',
  }
}

/**
 * 发送站内信通知
 *
 * 站内信通知通过更新通知状态为 SENT 来标记
 * 用户可以在审批待办页面看到待处理的审批请求
 */
async function sendInAppNotification(
  notification: ApprovalNotification
): Promise<SendNotificationResult> {
  // 站内信只需要更新状态为已发送
  // 用户在审批页面可以看到待处理的审批请求
  await prisma.approvalNotification.update({
    where: { id: notification.id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  })

  console.log(`[ApprovalNotification] In-app notification ${notification.id} sent`)

  return { success: true }
}

/**
 * 发送 Webhook 通知
 */
async function _sendWebhookNotification(
  notification: ApprovalNotification
): Promise<SendNotificationResult> {
  // 获取审批请求详情
  const approvalRequest = await prisma.approvalRequest.findUnique({
    where: { id: notification.requestId },
  })

  if (!approvalRequest) {
    await prisma.approvalNotification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        errorMessage: '未找到关联的审批请求',
      },
    })
    return { success: false, error: '未找到关联的审批请求' }
  }

  // 构建 Webhook payload
  const payload = {
    type: 'approval_request',
    timestamp: new Date().toISOString(),
    data: {
      requestId: approvalRequest.id,
      title: approvalRequest.title,
      description: approvalRequest.description,
      status: approvalRequest.status,
      workflowId: approvalRequest.workflowId,
      workflowName: approvalRequest.workflowName,
      executionId: approvalRequest.executionId,
      nodeId: approvalRequest.nodeId || '',
      expiresAt: approvalRequest.expiresAt?.toISOString(),
      approvalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/approvals`,
    },
  }

  // TODO: 从配置中获取 Webhook URL
  // 目前需要在审批节点配置中指定 webhookUrl
  const webhookUrl = process.env.APPROVAL_WEBHOOK_URL

  if (!webhookUrl) {
    await prisma.approvalNotification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        errorMessage: '未配置 Webhook URL (APPROVAL_WEBHOOK_URL)',
      },
    })
    return { success: false, error: '未配置 Webhook URL' }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Webhook 返回错误: ${response.status} ${response.statusText}`)
    }

    await prisma.approvalNotification.update({
      where: { id: notification.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    })

    console.log(`[ApprovalNotification] Webhook notification ${notification.id} sent`)

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Webhook 发送失败'

    await prisma.approvalNotification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * 发送审批请求的所有待发送通知
 */
export async function sendPendingNotifications(
  approvalRequestId: string
): Promise<{
  total: number
  sent: number
  failed: number
  errors: string[]
}> {
  const pendingNotifications = await prisma.approvalNotification.findMany({
    where: {
      requestId: approvalRequestId,
      status: 'PENDING',
    },
  })

  const results = await Promise.all(
    pendingNotifications.map((notification) => sendApprovalNotification(notification))
  )

  const sent = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  const errors = results.filter((r) => !r.success && r.error).map((r) => r.error!)

  console.log(
    `[ApprovalNotification] Sent ${sent}/${pendingNotifications.length} notifications for request ${approvalRequestId}`
  )

  return {
    total: pendingNotifications.length,
    sent,
    failed,
    errors,
  }
}

/**
 * 发送所有待发送的审批通知（用于定时任务）
 */
export async function processAllPendingNotifications(): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const pendingNotifications = await prisma.approvalNotification.findMany({
    where: {
      status: 'PENDING',
    },
    take: 100, // 限制批量处理数量
  })

  const results = await Promise.all(
    pendingNotifications.map((notification) => sendApprovalNotification(notification))
  )

  const sent = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return {
    processed: pendingNotifications.length,
    sent,
    failed,
  }
}
