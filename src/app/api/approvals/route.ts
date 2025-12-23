/**
 * 审批请求列表 API
 *
 * GET /api/approvals - 获取审批请求列表
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

/**
 * GET /api/approvals
 * 获取审批请求列表
 *
 * Query params:
 *   status - 审批状态（可选：PENDING, APPROVED, REJECTED, EXPIRED, CANCELLED）
 *   workflowId - 工作流 ID（可选）
 *   limit - 每页数量（默认 20）
 *   offset - 偏移量（默认 0）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const workflowId = searchParams.get('workflowId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where clause
    const where = {
      // Since ApprovalRequest doesn't have a direct workflow relation,
      // we can't filter by organizationId directly
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' } : {}),
      ...(workflowId ? { workflowId } : {}),
    }

    const [approvals, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.approvalRequest.count({ where }),
    ])

    return ApiResponse.success({
      approvals: approvals.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        status: a.status,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
        approvedAt: a.approvedAt,
        rejectedAt: a.rejectedAt,
        approvedBy: a.approvedBy,
        rejectedBy: a.rejectedBy,
        comment: a.comment,
        timeoutAction: a.timeoutAction,
        requestData: a.requestData,
        approvers: a.approvers,
        workflowId: a.workflowId,
        workflowName: a.workflowName,
        executionId: a.executionId,
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Get approvals error:', error)
    return ApiResponse.error('获取审批请求失败', 500)
  }
}