/**
 * 单个执行记录 API
 *
 * GET /api/executions/[id] - 获取执行记录详情
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { handleError } from '@/lib/api/error-middleware'
import { AuthenticationError, NotFoundError } from '@/lib/errors'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/executions/[id]
 * 获取执行记录详情
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new AuthenticationError('未登录')
    }

    const { id } = await params

    const execution = await prisma.execution.findFirst({
      where: {
        id,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        logs: {
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            nodeId: true,
            nodeName: true,
            nodeType: true,
            input: true,
            output: true,
            status: true,
            promptTokens: true,
            completionTokens: true,
            startedAt: true,
            completedAt: true,
            duration: true,
            error: true,
          },
        },
        outputFiles: {
          select: {
            id: true,
            fileName: true,
            format: true,
            mimeType: true,
            size: true,
            url: true,
            downloadCount: true,
            maxDownloads: true,
            expiresAt: true,
            nodeId: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (!execution) {
      throw new NotFoundError('执行记录不存在或无权访问')
    }

    return ApiResponse.success({
      execution: {
        id: execution.id,
        status: execution.status,
        input: execution.input,
        output: execution.output,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        duration: execution.duration,
        totalTokens: execution.totalTokens,
        promptTokens: execution.promptTokens,
        completionTokens: execution.completionTokens,
        estimatedCost: execution.estimatedCost,
        error: execution.error,
        errorDetail: execution.errorDetail,
        createdAt: execution.createdAt,
        workflow: execution.workflow,
        logs: execution.logs,
        outputFiles: execution.outputFiles,
        user: execution.user,
      },
    })
  } catch (error) {
    return handleError(error, request)
  }
}
