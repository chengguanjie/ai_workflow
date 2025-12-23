/**
 * 审批决定 API
 *
 * POST /api/approvals/[id]/decide - 提交审批决定
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ApiResponse } from '@/lib/api/api-response'
import {
  processApprovalDecision,
  resumeApprovalNode,
  resumeApprovalExecution,
} from '@/lib/workflow/processors/approval'

interface DecideRequest {
  decision: 'APPROVE' | 'REJECT'
  comment?: string
  customFieldValues?: Record<string, unknown>
}

/**
 * POST /api/approvals/[id]/decide
 * 提交审批决定
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    const { id: approvalRequestId } = await params
    const body = (await request.json()) as DecideRequest

    if (!body.decision || !['APPROVE', 'REJECT'].includes(body.decision)) {
      return ApiResponse.error('无效的审批决定', 400)
    }

    // Process the approval decision
    const result = await processApprovalDecision(
      approvalRequestId,
      session.user.id,
      session.user.name || session.user.email || '未知用户',
      body.decision,
      body.comment,
      body.customFieldValues
    )

    if (!result.success) {
      return ApiResponse.error(result.error || '处理审批决定失败', 400)
    }

    // If the approval is completed, get the final result and resume workflow
    let resumeResult = null
    let workflowResumeResult = null

    if (result.completed) {
      // Get the approval result data
      resumeResult = await resumeApprovalNode(approvalRequestId)

      // Resume the workflow execution with the approval result
      workflowResumeResult = await resumeApprovalExecution(approvalRequestId)

      if (!workflowResumeResult.success) {
        console.warn(
          `[ApprovalDecide] Failed to resume workflow: ${workflowResumeResult.error}`
        )
      }
    }

    return ApiResponse.success({
      success: true,
      completed: result.completed,
      finalDecision: result.finalDecision,
      resumeResult,
      workflowResumed: workflowResumeResult?.success || false,
      executionId: workflowResumeResult?.executionId,
    })
  } catch (error) {
    console.error('Process approval decision error:', error)
    return ApiResponse.error('处理审批决定失败', 500)
  }
}
