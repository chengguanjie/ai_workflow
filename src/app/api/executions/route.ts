/**
 * 执行记录列表 API
 *
 * GET /api/executions - 获取执行记录列表
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { handleError } from '@/lib/api/error-middleware'
import { AuthenticationError } from '@/lib/errors'

/**
 * GET /api/executions
 * 获取执行记录列表
 *
 * Query params:
 *   workflowId - 工作流 ID（可选）
 *   status - 执行状态（可选）
 *   startDate - 开始日期（可选，ISO 格式）
 *   endDate - 结束日期（可选，ISO 格式）
 *   limit - 每页数量（默认 20）
 *   offset - 偏移量（默认 0）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new AuthenticationError('未登录')
    }

    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get('workflowId')
    const status = searchParams.get('status')
    const statusIn = searchParams.get('statusIn') // 支持多状态筛选，逗号分隔
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 构建时间筛选条件
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (startDate) {
      dateFilter.gte = new Date(startDate)
    }
    if (endDate) {
      // 结束日期设为当天结束时间
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      dateFilter.lte = end
    }

    // 构建状态筛选条件
    type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
    let statusFilter: { status?: ExecutionStatus | { in: ExecutionStatus[] } } = {}
    if (status) {
      statusFilter = { status: status as ExecutionStatus }
    } else if (statusIn) {
      // 支持多状态筛选，如 statusIn=COMPLETED,FAILED,CANCELLED
      const statuses = statusIn.split(',').map(s => s.trim()) as ExecutionStatus[]
      statusFilter = { status: { in: statuses } }
    }

    const where = {
      organizationId: session.user.organizationId,
      ...(workflowId ? { workflowId } : {}),
      ...statusFilter,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    }

    const [executions, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          input: true,
          output: true,
          startedAt: true,
          completedAt: true,
          duration: true,
          totalTokens: true,
          error: true,
          createdAt: true,
          workflowId: true,
          workflow: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              outputFiles: true,
            },
          },
        },
      }),
      prisma.execution.count({ where }),
    ])

    return ApiResponse.success({
      executions: executions.map((e) => ({
        id: e.id,
        status: e.status,
        input: e.input,
        output: e.output,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        duration: e.duration,
        totalTokens: e.totalTokens,
        error: e.error,
        createdAt: e.createdAt,
        workflowId: e.workflowId,
        workflowName: e.workflow.name,
        outputFileCount: e._count.outputFiles,
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    return handleError(error, request)
  }
}
