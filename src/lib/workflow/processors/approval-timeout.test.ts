/**
 * Approval Timeout Processor Tests
 *
 * Tests for the scheduled approval timeout handler:
 * - Processing expired approvals
 * - Auto-approve/reject/escalate on timeout
 * - Resuming workflow execution after timeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processExpiredApprovals, getUpcomingTimeouts } from './approval-timeout'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    approvalRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mock approval processor
vi.mock('@/lib/workflow/processors/approval', () => ({
  handleApprovalTimeout: vi.fn(),
  resumeApprovalNode: vi.fn(),
  resumeApprovalExecution: vi.fn(),
}))

import { prisma } from '@/lib/db'
import {
  handleApprovalTimeout,
  resumeApprovalNode,
  resumeApprovalExecution,
} from '@/lib/workflow/processors/approval'

describe('Approval Timeout Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('processExpiredApprovals', () => {
    it('should process expired approvals and resume workflows', async () => {
      const expiredRequests = [
        { id: 'expired-1', status: 'PENDING', timeoutAction: 'REJECT' },
        { id: 'expired-2', status: 'PENDING', timeoutAction: 'APPROVE' },
      ]

      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce(
        expiredRequests as never
      )

      // Mock handleApprovalTimeout responses
      vi.mocked(handleApprovalTimeout).mockResolvedValueOnce({
        success: true,
        action: 'REJECT',
      })
      vi.mocked(handleApprovalTimeout).mockResolvedValueOnce({
        success: true,
        action: 'APPROVE',
      })

      // Mock resumeApprovalNode responses
      vi.mocked(resumeApprovalNode).mockResolvedValue({
        success: true,
        approved: true,
        data: {},
      })

      // Mock resumeApprovalExecution responses
      vi.mocked(resumeApprovalExecution).mockResolvedValue({
        success: true,
        executionId: 'exec-1',
      })

      const result = await processExpiredApprovals()

      expect(result.processed).toBe(2)
      expect(result.rejected).toBe(1)
      expect(result.approved).toBe(1)
      expect(result.failed).toBe(0)

      // Verify handleApprovalTimeout was called for each expired request
      expect(handleApprovalTimeout).toHaveBeenCalledTimes(2)
      expect(handleApprovalTimeout).toHaveBeenCalledWith('expired-1')
      expect(handleApprovalTimeout).toHaveBeenCalledWith('expired-2')

      // Verify resumeApprovalExecution was called for APPROVE and REJECT actions
      expect(resumeApprovalExecution).toHaveBeenCalledTimes(2)
      expect(resumeApprovalExecution).toHaveBeenCalledWith('expired-1')
      expect(resumeApprovalExecution).toHaveBeenCalledWith('expired-2')
    })

    it('should return empty results when no expired approvals', async () => {
      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce([])

      const result = await processExpiredApprovals()

      expect(result.processed).toBe(0)
      expect(result.approved).toBe(0)
      expect(result.rejected).toBe(0)
      expect(result.escalated).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.results).toHaveLength(0)
    })

    it('should handle escalation without resuming workflow', async () => {
      const expiredRequests = [
        { id: 'expired-1', status: 'PENDING', timeoutAction: 'ESCALATE' },
      ]

      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce(
        expiredRequests as never
      )

      vi.mocked(handleApprovalTimeout).mockResolvedValueOnce({
        success: true,
        action: 'ESCALATE',
      })

      const result = await processExpiredApprovals()

      expect(result.processed).toBe(1)
      expect(result.escalated).toBe(1)
      expect(result.approved).toBe(0)
      expect(result.rejected).toBe(0)

      // resumeApprovalExecution should NOT be called for ESCALATE
      expect(resumeApprovalExecution).not.toHaveBeenCalled()
    })

    it('should handle timeout processing failure', async () => {
      const expiredRequests = [
        { id: 'expired-1', status: 'PENDING', timeoutAction: 'REJECT' },
      ]

      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce(
        expiredRequests as never
      )

      vi.mocked(handleApprovalTimeout).mockResolvedValueOnce({
        success: false,
        action: 'REJECT',
        error: 'Processing failed',
      })

      const result = await processExpiredApprovals()

      expect(result.processed).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.rejected).toBe(0)

      // resumeApprovalExecution should NOT be called on failure
      expect(resumeApprovalExecution).not.toHaveBeenCalled()
    })

    it('should handle workflow resume failure gracefully', async () => {
      const expiredRequests = [
        { id: 'expired-1', status: 'PENDING', timeoutAction: 'APPROVE' },
      ]

      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce(
        expiredRequests as never
      )

      vi.mocked(handleApprovalTimeout).mockResolvedValueOnce({
        success: true,
        action: 'APPROVE',
      })

      vi.mocked(resumeApprovalNode).mockResolvedValueOnce({
        success: true,
        approved: true,
        data: {},
      })

      vi.mocked(resumeApprovalExecution).mockResolvedValueOnce({
        success: false,
        error: 'Failed to resume workflow',
      })

      // Should not throw, just log warning
      const result = await processExpiredApprovals()

      expect(result.processed).toBe(1)
      expect(result.approved).toBe(1) // Still counts as approved
      expect(result.failed).toBe(0) // The timeout action succeeded
    })
  })

  describe('getUpcomingTimeouts', () => {
    it('should return approvals expiring within warning window', async () => {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes

      const upcomingApprovals = [
        {
          id: 'upcoming-1',
          title: 'Urgent Approval',
          expiresAt,
          workflowId: 'wf-1',
          workflowName: 'Test Workflow',
        },
      ]

      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce(
        upcomingApprovals as never
      )

      const result = await getUpcomingTimeouts(60) // 60 minute warning

      expect(result.requests).toHaveLength(1)
      expect(result.requests[0].id).toBe('upcoming-1')
      expect(result.requests[0].title).toBe('Urgent Approval')
      expect(result.requests[0].minutesRemaining).toBeLessThanOrEqual(30)
      expect(result.requests[0].workflowName).toBe('Test Workflow')

      // Verify query filters
      expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'PENDING',
          expiresAt: expect.objectContaining({
            gt: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    })

    it('should return empty array when no upcoming timeouts', async () => {
      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValueOnce([])

      const result = await getUpcomingTimeouts(60)

      expect(result.requests).toHaveLength(0)
    })
  })
})
