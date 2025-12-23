/**
 * 审批超时处理器
 *
 * 定期检查已过期的审批请求，根据配置的超时策略进行处理：
 * - APPROVE: 自动批准
 * - REJECT: 自动拒绝
 * - ESCALATE: 升级通知管理员
 */

import { prisma } from '@/lib/db'
import {
  handleApprovalTimeout,
  resumeApprovalNode,
  resumeApprovalExecution,
} from '@/lib/workflow/processors/approval'

interface TimeoutProcessResult {
  requestId: string
  action: 'APPROVE' | 'REJECT' | 'ESCALATE'
  success: boolean
  error?: string
}

/**
 * 处理单个超时的审批请求
 */
async function processTimeoutRequest(
  requestId: string
): Promise<TimeoutProcessResult> {
  try {
    // 处理超时
    const result = await handleApprovalTimeout(requestId)

    if (!result.success) {
      return {
        requestId,
        action: result.action,
        success: false,
        error: result.error,
      }
    }

    // 如果是 APPROVE 或 REJECT，获取恢复结果并恢复工作流执行
    if (result.action === 'APPROVE' || result.action === 'REJECT') {
      // 尝试恢复审批节点获取结果数据
      const resumeResult = await resumeApprovalNode(requestId)

      if (!resumeResult.success) {
        console.warn(`[ApprovalTimeout] Resume result for ${requestId}:`, resumeResult.error)
      }

      // 恢复工作流执行
      const workflowResumeResult = await resumeApprovalExecution(requestId)

      if (!workflowResumeResult.success) {
        console.warn(
          `[ApprovalTimeout] Failed to resume workflow for ${requestId}:`,
          workflowResumeResult.error
        )
      } else {
        console.log(
          `[ApprovalTimeout] Workflow ${workflowResumeResult.executionId} resumed after timeout`
        )
      }
    }

    console.log(`[ApprovalTimeout] Processed timeout for ${requestId}: ${result.action}`)

    return {
      requestId,
      action: result.action,
      success: true,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '处理超时失败'
    console.error(`[ApprovalTimeout] Error processing ${requestId}:`, errorMessage)

    return {
      requestId,
      action: 'REJECT',
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * 检查并处理所有已超时的审批请求
 */
export async function processExpiredApprovals(): Promise<{
  processed: number
  approved: number
  rejected: number
  escalated: number
  failed: number
  results: TimeoutProcessResult[]
}> {
  const now = new Date()

  // 查找所有已过期但仍在等待中的审批请求
  const expiredRequests = await prisma.approvalRequest.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        lte: now,
      },
    },
    take: 50, // 限制批量处理数量
  })

  if (expiredRequests.length === 0) {
    return {
      processed: 0,
      approved: 0,
      rejected: 0,
      escalated: 0,
      failed: 0,
      results: [],
    }
  }

  console.log(`[ApprovalTimeout] Found ${expiredRequests.length} expired approval requests`)

  // 处理每个超时请求
  const results = await Promise.all(
    expiredRequests.map((request) => processTimeoutRequest(request.id))
  )

  const approved = results.filter((r) => r.success && r.action === 'APPROVE').length
  const rejected = results.filter((r) => r.success && r.action === 'REJECT').length
  const escalated = results.filter((r) => r.success && r.action === 'ESCALATE').length
  const failed = results.filter((r) => !r.success).length

  console.log(
    `[ApprovalTimeout] Processed: ${results.length}, ` +
    `Approved: ${approved}, Rejected: ${rejected}, ` +
    `Escalated: ${escalated}, Failed: ${failed}`
  )

  return {
    processed: results.length,
    approved,
    rejected,
    escalated,
    failed,
    results,
  }
}

/**
 * 获取即将超时的审批请求（用于提前通知）
 * @param warningMinutes 提前多少分钟警告
 */
export async function getUpcomingTimeouts(
  warningMinutes: number = 60
): Promise<{
  requests: Array<{
    id: string
    title: string
    expiresAt: Date
    minutesRemaining: number
    workflowId: string
    workflowName: string
  }>
}> {
  const now = new Date()
  const warningTime = new Date(now.getTime() + warningMinutes * 60 * 1000)

  const upcomingTimeouts = await prisma.approvalRequest.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        gt: now,
        lte: warningTime,
      },
    },
  })

  return {
    requests: upcomingTimeouts.map((request) => ({
      id: request.id,
      title: request.title,
      expiresAt: request.expiresAt!,
      minutesRemaining: Math.ceil(
        (request.expiresAt!.getTime() - now.getTime()) / (60 * 1000)
      ),
      workflowId: request.workflowId,
      workflowName: request.workflowName || 'Unknown Workflow',
    })),
  }
}
