/**
 * 审批请求列表 API
 *
 * GET /api/approvals - 获取审批请求列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/approvals
 * 获取审批请求列表
 *
 * Query params:
 *   status - 审批状态（可选：PENDING, APPROVED, REJECTED, TIMEOUT）
 *   workflowId - 工作流 ID（可选）
 *   limit - 每页数量（默认 20）
 *   offset - 偏移量（默认 0）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const workflowId = searchParams.get('workflowId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where = {
      workflow: {
        organizationId: session.user.organizationId,
      },
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' } : {}),
      ...(workflowId ? { workflowId } : {}),
    }

    const [approvals, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
          execution: {
            select: {
              id: true,
              status: true,
            },
          },
          decisions: {
            select: {
              id: true,
              userId: true,
              userName: true,
              decision: true,
              comment: true,
              decidedAt: true,
            },
          },
          _count: {
            select: {
              decisions: true,
            },
          },
        },
      }),
      prisma.approvalRequest.count({ where }),
    ])

    return NextResponse.json({
      approvals: approvals.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        status: a.status,
        requestedAt: a.requestedAt,
        expiresAt: a.expiresAt,
        decidedAt: a.decidedAt,
        requiredApprovals: a.requiredApprovals,
        finalDecision: a.finalDecision,
        timeoutAction: a.timeoutAction,
        customFields: a.customFields,
        inputSnapshot: a.inputSnapshot,
        workflowId: a.workflowId,
        workflowName: a.workflow.name,
        executionId: a.executionId,
        executionStatus: a.execution.status,
        nodeId: a.nodeId,
        decisions: a.decisions,
        decisionCount: a._count.decisions,
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Get approvals error:', error)
    return NextResponse.json(
      { error: '获取审批请求失败' },
      { status: 500 }
    )
  }
}
