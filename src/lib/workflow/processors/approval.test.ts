/**
 * APPROVAL Node Processor Tests
 *
 * End-to-end tests for the Human-in-the-Loop approval workflow:
 * 1. Creating approval request and pausing workflow
 * 2. Processing approval decisions
 * 3. Resuming workflow after approval
 * 4. Handling approval timeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  processApprovalNode,
  processApprovalDecision,
  resumeApprovalNode,
  resumeApprovalExecution,
  handleApprovalTimeout,
} from './approval'
import type { ApprovalNodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from '../types'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    approvalRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    approvalNotification: {
      create: vi.fn(),
    },
    approvalDecision: {
      create: vi.fn(),
    },
    execution: {
      update: vi.fn(),
    },
  },
}))

// Mock notification sender
vi.mock('@/lib/notifications/approval-notification', () => ({
  sendPendingNotifications: vi.fn().mockResolvedValue(undefined),
}))

// Mock execution queue
vi.mock('@/lib/workflow/queue', () => ({
  executionQueue: {
    enqueue: vi.fn().mockResolvedValue(undefined),
  },
}))

import { prisma } from '@/lib/db'
import { sendPendingNotifications } from '@/lib/notifications/approval-notification'

// Helper to create execution context
function createContext(nodeOutputs: Record<string, unknown> = {}): ExecutionContext {
  const context: ExecutionContext = {
    executionId: 'test-exec-1',
    workflowId: 'test-wf-1',
    organizationId: 'test-org-1',
    userId: 'test-user-1',
    nodeOutputs: new Map(),
    globalVariables: {},
    aiConfigs: new Map(),
  }

  for (const [key, value] of Object.entries(nodeOutputs)) {
    context.nodeOutputs.set(key, {
      nodeId: key,
      nodeName: key,
      nodeType: 'INPUT',
      status: 'success',
      data: value as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    } as NodeOutput)
  }

  return context
}

// Helper to create approval node config
function createApprovalNode(
  config: Partial<ApprovalNodeConfig['config']> = {}
): ApprovalNodeConfig {
  return {
    id: 'test-approval',
    type: 'APPROVAL',
    name: 'Test Approval',
    position: { x: 0, y: 0 },
    config: {
      title: 'Test Approval Request',
      description: 'Please review and approve',
      approvers: [
        {
          type: 'USER',
          targetId: 'approver-1',
          displayName: 'Approver One',
        },
      ],
      timeout: 3600000, // 1 hour
      timeoutAction: 'REJECT',
      notificationChannels: ['IN_APP'],
      requiredApprovals: 1,
      allowComments: true,
      customFields: [],
      ...config,
    },
  }
}

describe('Approval Node Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('processApprovalNode', () => {
    it('should create approval request and return paused status', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        title: 'Test Approval Request',
        description: 'Please review and approve',
        status: 'PENDING',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        requiredApprovals: 1,
        timeoutAction: 'REJECT',
      }

      vi.mocked(prisma.approvalRequest.create).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalNotification.create).mockResolvedValue({} as never)
      vi.mocked(prisma.execution.update).mockResolvedValue({} as never)

      const node = createApprovalNode()
      const context = createContext({
        input: { data: { message: 'test data' } },
      })

      const result = await processApprovalNode(node, context)

      expect(result.status).toBe('paused')
      expect(result.nodeType).toBe('APPROVAL')
      expect(result.data.approvalRequestId).toBe('approval-req-1')
      expect(result.data.title).toBe('Test Approval Request')
      expect(result.approvalRequestId).toBe('approval-req-1')

      // Verify approval request was created
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Approval Request',
          description: 'Please review and approve',
          status: 'PENDING',
          requiredApprovals: 1,
          timeoutAction: 'REJECT',
          executionId: 'test-exec-1',
          nodeId: 'test-approval',
          workflowId: 'test-wf-1',
        }),
      })

      // Verify execution was paused
      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'test-exec-1' },
        data: { status: 'PAUSED' },
      })

      // Verify notifications were created
      expect(prisma.approvalNotification.create).toHaveBeenCalled()
      expect(sendPendingNotifications).toHaveBeenCalledWith('approval-req-1')
    })

    it('should capture input snapshot from previous nodes', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-2',
        title: 'Review Data',
        status: 'PENDING',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        requiredApprovals: 1,
        timeoutAction: 'REJECT',
      }

      vi.mocked(prisma.approvalRequest.create).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalNotification.create).mockResolvedValue({} as never)
      vi.mocked(prisma.execution.update).mockResolvedValue({} as never)

      const node = createApprovalNode({ title: 'Review Data' })
      const context = createContext({
        'input-node': { data: { userId: '123', amount: 1000 } },
        'process-node': { data: { analyzed: true, risk: 'low' } },
      })

      await processApprovalNode(node, context)

      // Verify input snapshot was captured (data is nested under 'data' property from NodeOutput)
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inputSnapshot: expect.objectContaining({
            'input-node': { data: { userId: '123', amount: 1000 } },
            'process-node': { data: { analyzed: true, risk: 'low' } },
          }),
        }),
      })
    })

    it('should return error when no approvers configured', async () => {
      const node = createApprovalNode({ approvers: [] })
      const context = createContext()

      const result = await processApprovalNode(node, context)

      expect(result.status).toBe('error')
      expect(result.error).toContain('必须配置至少一个审批人')
    })

    it('should support multiple approvers', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-3',
        title: 'Multi-Approver Request',
        status: 'PENDING',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        requiredApprovals: 2,
        timeoutAction: 'REJECT',
      }

      vi.mocked(prisma.approvalRequest.create).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalNotification.create).mockResolvedValue({} as never)
      vi.mocked(prisma.execution.update).mockResolvedValue({} as never)

      const node = createApprovalNode({
        approvers: [
          { type: 'USER', targetId: 'approver-1', displayName: 'Approver One' },
          { type: 'USER', targetId: 'approver-2', displayName: 'Approver Two' },
        ],
        requiredApprovals: 2,
      })
      const context = createContext()

      const result = await processApprovalNode(node, context)

      expect(result.status).toBe('paused')
      expect(result.data.requiredApprovals).toBe(2)
      expect(result.data.approvers).toHaveLength(2)

      // Verify notifications created for each approver
      expect(prisma.approvalNotification.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('processApprovalDecision', () => {
    it('should record approval decision and complete when threshold met', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        requiredApprovals: 1,
        decisions: [],
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalDecision.create).mockResolvedValue({} as never)
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const result = await processApprovalDecision(
        'approval-req-1',
        'user-1',
        'User One',
        'APPROVE',
        'Looks good!'
      )

      expect(result.success).toBe(true)
      expect(result.completed).toBe(true)
      expect(result.finalDecision).toBe('APPROVE')

      // Verify decision was recorded
      expect(prisma.approvalDecision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          decision: 'APPROVE',
          comment: 'Looks good!',
          userId: 'user-1',
          userName: 'User One',
          requestId: 'approval-req-1',
        }),
      })

      // Verify request was marked as approved
      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-req-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          finalDecision: 'APPROVE',
        }),
      })
    })

    it('should record rejection and complete for single approver', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        requiredApprovals: 1,
        decisions: [],
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalDecision.create).mockResolvedValue({} as never)
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const result = await processApprovalDecision(
        'approval-req-1',
        'user-1',
        'User One',
        'REJECT',
        'Does not meet requirements'
      )

      expect(result.success).toBe(true)
      expect(result.completed).toBe(true)
      expect(result.finalDecision).toBe('REJECT')

      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-req-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          finalDecision: 'REJECT',
        }),
      })
    })

    it('should not complete when more approvals needed', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        requiredApprovals: 2,
        decisions: [],
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalDecision.create).mockResolvedValue({} as never)

      const result = await processApprovalDecision(
        'approval-req-1',
        'user-1',
        'User One',
        'APPROVE'
      )

      expect(result.success).toBe(true)
      expect(result.completed).toBe(false)
      expect(result.finalDecision).toBeUndefined()

      // Request should not be updated
      expect(prisma.approvalRequest.update).not.toHaveBeenCalled()
    })

    it('should prevent duplicate decisions from same user', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        requiredApprovals: 1,
        decisions: [
          { userId: 'user-1', decision: 'APPROVE' },
        ],
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await processApprovalDecision(
        'approval-req-1',
        'user-1',
        'User One',
        'REJECT'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('已提交过审批意见')
    })

    it('should reject decision for already processed request', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'APPROVED',
        requiredApprovals: 1,
        decisions: [],
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await processApprovalDecision(
        'approval-req-1',
        'user-1',
        'User One',
        'APPROVE'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('已处理')
    })
  })

  describe('resumeApprovalNode', () => {
    it('should return approval result data', async () => {
      const decidedAt = new Date()
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'APPROVED',
        finalDecision: 'APPROVE',
        requiredApprovals: 1,
        decidedAt,
        decisions: [
          {
            userId: 'user-1',
            userName: 'User One',
            decision: 'APPROVE',
            comment: 'Approved',
            decidedAt,
            customFieldValues: null,
          },
        ],
        execution: { id: 'exec-1' },
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await resumeApprovalNode('approval-req-1')

      expect(result.success).toBe(true)
      expect(result.approved).toBe(true)
      expect(result.data.status).toBe('APPROVED')
      expect(result.data.finalDecision).toBe('APPROVE')
      expect(result.data.approvedCount).toBe(1)
      expect(result.data.rejectedCount).toBe(0)
      expect(result.data.decisions).toHaveLength(1)
    })

    it('should return error for pending approval', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        decisions: [],
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await resumeApprovalNode('approval-req-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('尚未完成')
    })

    it('should return error for non-existent approval', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(null)

      const result = await resumeApprovalNode('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toContain('未找到')
    })
  })

  describe('resumeApprovalExecution', () => {
    it('should resume workflow execution after approval', async () => {
      const decidedAt = new Date()
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'APPROVED',
        finalDecision: 'APPROVE',
        requiredApprovals: 1,
        decidedAt,
        title: 'Test Approval',
        description: 'Test',
        nodeId: 'approval-node-1',
        requestedAt: new Date(),
        decisions: [
          {
            userId: 'user-1',
            userName: 'User One',
            decision: 'APPROVE',
            comment: 'OK',
            decidedAt,
            customFieldValues: null,
          },
        ],
        execution: {
          id: 'exec-1',
          status: 'PAUSED',
          workflowId: 'wf-1',
          userId: 'user-1',
          checkpoint: {},
          input: { originalData: 'test' },
          workflow: {
            id: 'wf-1',
            organizationId: 'org-1',
            config: {},
            draftConfig: null,
            publishedConfig: null,
          },
        },
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.execution.update).mockResolvedValue({} as never)

      const { executionQueue } = await import('@/lib/workflow/queue')

      const result = await resumeApprovalExecution('approval-req-1')

      expect(result.success).toBe(true)
      expect(result.executionId).toBe('exec-1')

      // Verify execution was updated to RUNNING
      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'RUNNING',
        }),
      })

      // Verify workflow was enqueued
      expect(executionQueue.enqueue).toHaveBeenCalledWith(
        'wf-1',
        'org-1',
        'user-1',
        expect.objectContaining({
          originalData: 'test',
          _approvalResult: expect.objectContaining({
            approved: true,
            status: 'APPROVED',
          }),
          _resumeFromApproval: expect.objectContaining({
            approvalRequestId: 'approval-req-1',
            approvalNodeId: 'approval-node-1',
          }),
        }),
        { priority: 1 }
      )
    })

    it('should return error for pending approval', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        decisions: [],
        execution: { id: 'exec-1', status: 'PAUSED' },
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await resumeApprovalExecution('approval-req-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('尚未完成')
    })

    it('should return error for non-paused execution', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'APPROVED',
        finalDecision: 'APPROVE',
        decisions: [],
        execution: {
          id: 'exec-1',
          status: 'COMPLETED', // Not paused
        },
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await resumeApprovalExecution('approval-req-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('未处于暂停状态')
    })
  })

  describe('handleApprovalTimeout', () => {
    it('should auto-reject on timeout when configured', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        timeoutAction: 'REJECT',
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const result = await handleApprovalTimeout('approval-req-1')

      expect(result.success).toBe(true)
      expect(result.action).toBe('REJECT')

      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-req-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          finalDecision: 'REJECT',
        }),
      })
    })

    it('should auto-approve on timeout when configured', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        timeoutAction: 'APPROVE',
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const result = await handleApprovalTimeout('approval-req-1')

      expect(result.success).toBe(true)
      expect(result.action).toBe('APPROVE')

      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-req-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          finalDecision: 'APPROVE',
        }),
      })
    })

    it('should escalate on timeout when configured', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'PENDING',
        timeoutAction: 'ESCALATE',
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const result = await handleApprovalTimeout('approval-req-1')

      expect(result.success).toBe(true)
      expect(result.action).toBe('ESCALATE')

      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-req-1' },
        data: expect.objectContaining({
          status: 'TIMEOUT',
        }),
      })
    })

    it('should not process already completed approval', async () => {
      const mockApprovalRequest = {
        id: 'approval-req-1',
        status: 'APPROVED',
        timeoutAction: 'REJECT',
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )

      const result = await handleApprovalTimeout('approval-req-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('已处理')
    })
  })

  describe('End-to-End Approval Flow', () => {
    it('should complete full approval workflow', async () => {
      // Step 1: Create approval request
      const approvalId = 'e2e-approval-1'
      const mockApprovalRequest = {
        id: approvalId,
        title: 'E2E Test Approval',
        description: 'Full workflow test',
        status: 'PENDING',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        requiredApprovals: 1,
        timeoutAction: 'REJECT',
        nodeId: 'approval-node-1',
      }

      vi.mocked(prisma.approvalRequest.create).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalNotification.create).mockResolvedValue({} as never)
      vi.mocked(prisma.execution.update).mockResolvedValue({} as never)

      const node = createApprovalNode({
        title: 'E2E Test Approval',
        description: 'Full workflow test',
      })
      node.id = 'approval-node-1'
      const context = createContext({
        input: { data: { amount: 5000, reason: 'Test purchase' } },
      })

      const createResult = await processApprovalNode(node, context)
      expect(createResult.status).toBe('paused')
      expect(createResult.data.approvalRequestId).toBe(approvalId)

      // Step 2: Process approval decision
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce({
        ...mockApprovalRequest,
        decisions: [],
      } as never)
      vi.mocked(prisma.approvalDecision.create).mockResolvedValue({} as never)
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const decisionResult = await processApprovalDecision(
        approvalId,
        'approver-1',
        'Approver One',
        'APPROVE',
        'Amount within budget'
      )
      expect(decisionResult.success).toBe(true)
      expect(decisionResult.completed).toBe(true)
      expect(decisionResult.finalDecision).toBe('APPROVE')

      // Step 3: Resume workflow
      const decidedAt = new Date()
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce({
        ...mockApprovalRequest,
        status: 'APPROVED',
        finalDecision: 'APPROVE',
        decidedAt,
        decisions: [
          {
            userId: 'approver-1',
            userName: 'Approver One',
            decision: 'APPROVE',
            comment: 'Amount within budget',
            decidedAt,
            customFieldValues: null,
          },
        ],
        execution: {
          id: 'exec-1',
          status: 'PAUSED',
          workflowId: 'wf-1',
          userId: 'user-1',
          checkpoint: {},
          input: { amount: 5000, reason: 'Test purchase' },
          workflow: {
            id: 'wf-1',
            organizationId: 'org-1',
            config: {},
            draftConfig: null,
            publishedConfig: null,
          },
        },
      } as never)

      const resumeResult = await resumeApprovalExecution(approvalId)
      expect(resumeResult.success).toBe(true)
      expect(resumeResult.executionId).toBe('exec-1')

      // Verify the workflow was enqueued with approval result
      const { executionQueue } = await import('@/lib/workflow/queue')
      expect(executionQueue.enqueue).toHaveBeenCalledWith(
        'wf-1',
        'org-1',
        'user-1',
        expect.objectContaining({
          _approvalResult: expect.objectContaining({
            approved: true,
            status: 'APPROVED',
            finalDecision: 'APPROVE',
            decisions: expect.arrayContaining([
              expect.objectContaining({
                decision: 'APPROVE',
                comment: 'Amount within budget',
              }),
            ]),
          }),
        }),
        expect.any(Object)
      )
    })

    it('should handle rejection flow', async () => {
      const approvalId = 'e2e-rejection-1'
      const mockApprovalRequest = {
        id: approvalId,
        status: 'PENDING',
        requiredApprovals: 1,
        decisions: [],
        nodeId: 'approval-node-1',
      }

      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValueOnce(
        mockApprovalRequest as never
      )
      vi.mocked(prisma.approvalDecision.create).mockResolvedValue({} as never)
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({} as never)

      const decisionResult = await processApprovalDecision(
        approvalId,
        'approver-1',
        'Approver One',
        'REJECT',
        'Budget exceeded'
      )

      expect(decisionResult.success).toBe(true)
      expect(decisionResult.completed).toBe(true)
      expect(decisionResult.finalDecision).toBe('REJECT')

      // Verify the request was marked as rejected
      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: approvalId },
        data: expect.objectContaining({
          status: 'REJECTED',
          finalDecision: 'REJECT',
        }),
      })
    })
  })
})
