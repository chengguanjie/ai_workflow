/**
 * 审批决定 API
 *
 * POST /api/approvals/[id]/decide - 提交审批决定
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: approvalRequestId } = await params
    const body = (await request.json()) as DecideRequest

    if (!body.decision || !['APPROVE', 'REJECT'].includes(body.decision)) {
      return NextResponse.json(
        { error: '无效的审批决定' },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: result.error || '处理审批决定失败' },
        { status: 400 }
      )
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

    return NextResponse.json({
      success: true,
      completed: result.completed,
      finalDecision: result.finalDecision,
      resumeResult,
      workflowResumed: workflowResumeResult?.success || false,
      executionId: workflowResumeResult?.executionId,
    })
  } catch (error) {
    console.error('Process approval decision error:', error)
    return NextResponse.json(
      { error: '处理审批决定失败' },
      { status: 500 }
    )
  }
}
