/**
 * APPROVAL Node Processor
 *
 * Implements Human-in-the-Loop approval workflow.
 * When executed, this node pauses the workflow execution and creates an approval request.
 * The workflow resumes when the approval is granted or rejected.
 *
 * Features:
 * - Multiple approvers support
 * - Configurable timeout and timeout actions
 * - Custom form fields for approval
 * - Notification via email, in-app, or webhook
 * - Input snapshot for review
 */

import type { ApprovalNodeConfig, NodeConfig } from '@/types/workflow'
import type { NodeProcessor, ExecutionContext, NodeOutput } from '../types'
import type { ApprovalDecision } from '@prisma/client'
import { prisma } from '@/lib/db'
import { replaceVariables } from '../utils'
import { sendPendingNotifications } from '@/lib/notifications/approval-notification'

/**
 * Create an approval request and pause the workflow
 */
export async function processApprovalNode(
  node: ApprovalNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const startedAt = new Date()
  const config = node.config

  try {
    // Validate configuration
    if (!config.approvers || config.approvers.length === 0) {
      throw new Error('审批节点必须配置至少一个审批人')
    }

    // Resolve variables in title and description
    const title = replaceVariables(config.title || '审批请求', context)
    const description = config.description
      ? replaceVariables(config.description, context)
      : undefined

    // Collect input data snapshot for the approver to review
    const inputSnapshot: Record<string, unknown> = {}
    for (const [nodeName, output] of context.nodeOutputs) {
      if (output.status === 'success') {
        inputSnapshot[nodeName] = output.data
      }
    }

    // Calculate expiration time
    const timeout = config.timeout || 86400000 // Default 24 hours
    const expiresAt = new Date(Date.now() + timeout)

    // Create approval request in database
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        title,
        description,
        status: 'PENDING',
        requestedAt: startedAt,
        expiresAt,
        requiredApprovals: config.requiredApprovals || 1,
        timeoutAction: config.timeoutAction || 'REJECT',
        customFields: config.customFields ? JSON.parse(JSON.stringify(config.customFields)) : null,
        inputSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
        executionId: context.executionId,
        nodeId: node.id,
        workflowId: context.workflowId,
      },
    })

    // Create notifications for each approver
    const notificationPromises = config.approvers.map(async (approver) => {
      const channels = config.notificationChannels || ['IN_APP']

      for (const channel of channels) {
        await prisma.approvalNotification.create({
          data: {
            channel,
            recipientId: approver.targetId,
            status: 'PENDING',
            subject: `待审批: ${title}`,
            content: description || `请审批 "${title}"`,
            requestId: approvalRequest.id,
          },
        })
      }
    })

    await Promise.all(notificationPromises)

    // Send the notifications
    // Note: We don't await this to avoid blocking the approval creation
    sendPendingNotifications(approvalRequest.id).catch((error) => {
      console.error('Failed to send approval notifications:', error)
    })

    // Update execution status to PAUSED
    // Note: The paused node info is stored in the ApprovalRequest via nodeId field
    await prisma.execution.update({
      where: { id: context.executionId },
      data: {
        status: 'PAUSED',
      },
    })

    // Return paused status - the workflow engine should stop here
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'paused',
      data: {
        approvalRequestId: approvalRequest.id,
        title,
        description,
        approvers: config.approvers.map((a) => ({
          type: a.type,
          targetId: a.targetId,
          displayName: a.displayName,
        })),
        requiredApprovals: config.requiredApprovals || 1,
        expiresAt: expiresAt.toISOString(),
        timeoutAction: config.timeoutAction || 'REJECT',
        notificationChannels: config.notificationChannels || ['IN_APP'],
      },
      approvalRequestId: approvalRequest.id,
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  } catch (error) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'error',
      data: {},
      error: error instanceof Error ? error.message : '创建审批请求失败',
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  }
}

/**
 * Resume approval node after decision
 * Called by the approval service when a decision is made
 */
export async function resumeApprovalNode(
  approvalRequestId: string
): Promise<{
  success: boolean
  approved: boolean
  data: Record<string, unknown>
  error?: string
}> {
  try {
    // Get the approval request with decisions
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: {
        decisions: true,
        execution: true,
      },
    })

    if (!approvalRequest) {
      return {
        success: false,
        approved: false,
        data: {},
        error: '未找到审批请求',
      }
    }

    if (approvalRequest.status === 'PENDING') {
      return {
        success: false,
        approved: false,
        data: {},
        error: '审批尚未完成',
      }
    }

    const approved = approvalRequest.status === 'APPROVED'
    const decisions = approvalRequest.decisions.map((d: ApprovalDecision) => ({
      userId: d.userId,
      userName: d.userName,
      decision: d.decision,
      comment: d.comment,
      decidedAt: d.decidedAt.toISOString(),
      customFieldValues: d.customFieldValues,
    }))

    return {
      success: true,
      approved,
      data: {
        status: approvalRequest.status,
        finalDecision: approvalRequest.finalDecision,
        decisions,
        approvedAt: approvalRequest.decidedAt?.toISOString(),
        approvedCount: decisions.filter((d) => d.decision === 'APPROVE').length,
        rejectedCount: decisions.filter((d) => d.decision === 'REJECT').length,
        requiredApprovals: approvalRequest.requiredApprovals,
      },
    }
  } catch (error) {
    return {
      success: false,
      approved: false,
      data: {},
      error: error instanceof Error ? error.message : '恢复审批节点失败',
    }
  }
}

/**
 * Process approval decision
 */
export async function processApprovalDecision(
  approvalRequestId: string,
  userId: string,
  userName: string,
  decision: 'APPROVE' | 'REJECT',
  comment?: string,
  customFieldValues?: Record<string, unknown>
): Promise<{
  success: boolean
  completed: boolean
  finalDecision?: 'APPROVE' | 'REJECT'
  error?: string
}> {
  try {
    // Get the approval request
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: { decisions: true },
    })

    if (!approvalRequest) {
      return { success: false, completed: false, error: '未找到审批请求' }
    }

    if (approvalRequest.status !== 'PENDING') {
      return { success: false, completed: false, error: '审批请求已处理' }
    }

    // Check if user has already decided
    const existingDecision = approvalRequest.decisions.find(
      (d: ApprovalDecision) => d.userId === userId
    )
    if (existingDecision) {
      return { success: false, completed: false, error: '您已提交过审批意见' }
    }

    // Create the decision
    await prisma.approvalDecision.create({
      data: {
        decision,
        comment,
        customFieldValues: customFieldValues
          ? JSON.parse(JSON.stringify(customFieldValues))
          : null,
        userId,
        userName,
        requestId: approvalRequestId,
      },
    })

    // Check if we have enough approvals or rejections
    const allDecisions: Array<{ decision: string }> = [
      ...approvalRequest.decisions.map((d: ApprovalDecision) => ({ decision: d.decision })),
      { decision },
    ]
    const approveCount = allDecisions.filter((d) => d.decision === 'APPROVE').length
    const rejectCount = allDecisions.filter((d) => d.decision === 'REJECT').length

    let completed = false
    let finalDecision: 'APPROVE' | 'REJECT' | undefined

    // If enough approvals, mark as approved
    if (approveCount >= approvalRequest.requiredApprovals) {
      completed = true
      finalDecision = 'APPROVE'
      await prisma.approvalRequest.update({
        where: { id: approvalRequestId },
        data: {
          status: 'APPROVED',
          finalDecision: 'APPROVE',
          decidedAt: new Date(),
        },
      })
    }
    // If any rejection (for single approval requirement) or enough rejections
    else if (rejectCount > 0 && approvalRequest.requiredApprovals === 1) {
      completed = true
      finalDecision = 'REJECT'
      await prisma.approvalRequest.update({
        where: { id: approvalRequestId },
        data: {
          status: 'REJECTED',
          finalDecision: 'REJECT',
          decidedAt: new Date(),
        },
      })
    }

    return { success: true, completed, finalDecision }
  } catch (error) {
    return {
      success: false,
      completed: false,
      error: error instanceof Error ? error.message : '处理审批决定失败',
    }
  }
}

/**
 * Handle approval timeout
 */
export async function handleApprovalTimeout(
  approvalRequestId: string
): Promise<{
  success: boolean
  action: 'APPROVE' | 'REJECT' | 'ESCALATE'
  error?: string
}> {
  try {
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
    })

    if (!approvalRequest) {
      return { success: false, action: 'REJECT', error: '未找到审批请求' }
    }

    if (approvalRequest.status !== 'PENDING') {
      return {
        success: false,
        action: approvalRequest.timeoutAction as 'APPROVE' | 'REJECT' | 'ESCALATE',
        error: '审批请求已处理',
      }
    }

    const action = approvalRequest.timeoutAction as 'APPROVE' | 'REJECT' | 'ESCALATE'

    if (action === 'ESCALATE') {
      // TODO: Implement escalation logic
      await prisma.approvalRequest.update({
        where: { id: approvalRequestId },
        data: {
          status: 'TIMEOUT',
          decidedAt: new Date(),
        },
      })
    } else {
      await prisma.approvalRequest.update({
        where: { id: approvalRequestId },
        data: {
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          finalDecision: action,
          decidedAt: new Date(),
        },
      })
    }

    return { success: true, action }
  } catch (error) {
    return {
      success: false,
      action: 'REJECT',
      error: error instanceof Error ? error.message : '处理超时失败',
    }
  }
}

/**
 * Resume workflow execution after approval is completed
 * This function is called when an approval decision completes the approval request
 */
export async function resumeApprovalExecution(
  approvalRequestId: string
): Promise<{
  success: boolean
  executionId?: string
  error?: string
}> {
  try {
    // Get the approval request with execution details
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: {
        decisions: true,
        execution: {
          include: {
            workflow: {
              select: {
                id: true,
                organizationId: true,
                config: true,
                draftConfig: true,
                publishedConfig: true,
              },
            },
          },
        },
      },
    })

    if (!approvalRequest) {
      return { success: false, error: '未找到审批请求' }
    }

    if (approvalRequest.status === 'PENDING') {
      return { success: false, error: '审批尚未完成' }
    }

    const execution = approvalRequest.execution
    if (!execution) {
      return { success: false, error: '未找到关联的执行记录' }
    }

    if (execution.status !== 'PAUSED') {
      return { success: false, error: '执行未处于暂停状态' }
    }

    // Build approval result data
    const approved = approvalRequest.status === 'APPROVED'
    const decisions = approvalRequest.decisions.map((d: ApprovalDecision) => ({
      userId: d.userId,
      userName: d.userName,
      decision: d.decision,
      comment: d.comment,
      decidedAt: d.decidedAt.toISOString(),
      customFieldValues: d.customFieldValues,
    }))

    const approvalResult = {
      approved,
      status: approvalRequest.status,
      finalDecision: approvalRequest.finalDecision,
      decisions,
      approvedAt: approvalRequest.decidedAt?.toISOString(),
      approvedCount: decisions.filter((d) => d.decision === 'APPROVE').length,
      rejectedCount: decisions.filter((d) => d.decision === 'REJECT').length,
      requiredApprovals: approvalRequest.requiredApprovals,
      title: approvalRequest.title,
      description: approvalRequest.description,
    }

    // Store approval result in checkpoint for the workflow engine to use
    const existingCheckpoint = (execution.checkpoint as Record<string, unknown>) || {}
    const checkpoint = {
      ...existingCheckpoint,
      completedNodes: {
        ...(existingCheckpoint.completedNodes as Record<string, unknown> || {}),
        [approvalRequest.nodeId]: {
          status: 'COMPLETED',
          completedAt: new Date().toISOString(),
          output: {
            nodeId: approvalRequest.nodeId,
            nodeName: 'approval', // Will be corrected by the engine
            nodeType: 'APPROVAL',
            status: 'success',
            data: approvalResult,
            startedAt: approvalRequest.requestedAt?.toISOString(),
            completedAt: new Date().toISOString(),
          },
        },
      },
      context: {
        ...(existingCheckpoint.context as Record<string, unknown> || {}),
        nodeResults: {
          ...((existingCheckpoint.context as Record<string, unknown>)?.nodeResults as Record<string, unknown> || {}),
          [approvalRequest.nodeId]: approvalResult,
        },
      },
      approvalResult,
      approvalNodeId: approvalRequest.nodeId,
    }

    // Update execution to RUNNING and save checkpoint
    await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: 'RUNNING',
        checkpoint: JSON.parse(JSON.stringify(checkpoint)),
        lastCheckpoint: new Date(),
      },
    })

    // Import and use the execution queue to continue execution
    const { executionQueue } = await import('@/lib/workflow/queue')

    // Get original input
    const originalInput = (execution.input as Record<string, unknown>) || {}

    // Add approval result to input so it's available
    const resumeInput = {
      ...originalInput,
      _approvalResult: approvalResult,
      _resumeFromApproval: {
        approvalRequestId,
        approvalNodeId: approvalRequest.nodeId,
        checkpoint,
      },
    }

    // Enqueue the workflow to continue execution
    await executionQueue.enqueue(
      execution.workflowId,
      execution.workflow.organizationId,
      execution.userId,
      resumeInput,
      {
        priority: 1, // Higher priority for resumed executions
      }
    )

    console.log(
      `[ApprovalResume] Execution ${execution.id} resumed after approval ${approvalRequestId}`
    )

    return {
      success: true,
      executionId: execution.id,
    }
  } catch (error) {
    console.error('[ApprovalResume] Error resuming execution:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '恢复执行失败',
    }
  }
}

/**
 * APPROVAL 节点处理器
 */
export const approvalNodeProcessor: NodeProcessor = {
  nodeType: 'APPROVAL',
  process: (node: NodeConfig, context: ExecutionContext) =>
    processApprovalNode(node as ApprovalNodeConfig, context),
}
