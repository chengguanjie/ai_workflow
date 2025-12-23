import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'
import { createHash } from 'crypto'
import { ApiResponse } from '@/lib/api/api-response'

interface RouteParams {
  params: Promise<{ id: string }>
}

type AuthResult =
  | { organizationId: string; createdById: string; token: any }
  | { error: string; status: number }

// 验证 API Token
async function verifyApiToken(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: '缺少 Authorization 头', status: 401 }
  }

  const token = authHeader.slice(7)
  if (!token) {
    return { error: '无效的 Token', status: 401 }
  }

  // 计算 Token 哈希
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // 查找 Token
  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: {
      organization: {
        select: {
          id: true,
          apiQuota: true,
          apiUsed: true,
        },
      },
    },
  })

  if (!apiToken) {
    return { error: '无效的 Token', status: 401 }
  }

  if (!apiToken.isActive) {
    return { error: 'Token 已禁用', status: 403 }
  }

  // 检查过期
  if (apiToken.expiresAt && new Date(apiToken.expiresAt) < new Date()) {
    return { error: 'Token 已过期', status: 403 }
  }

  // 检查权限
  const scopes = apiToken.scopes as string[]
  if (!scopes.includes('workflow:execute')) {
    return { error: '该 Token 无权执行工作流', status: 403 }
  }

  return {
    token: apiToken,
    organizationId: apiToken.organizationId,
    createdById: apiToken.createdById,
  }
}

/**
 * POST /api/v1/workflows/[id]/execute
 * 使用 API Token 执行工作流
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // 验证 Token
    const authResult = await verifyApiToken(request.headers.get('Authorization'))
    if ('error' in authResult) {
      return ApiResponse.error(authResult.error, authResult.status)
    }

    const { token, organizationId, createdById } = authResult
    const { id: workflowId } = await params

    // 验证工作流存在且属于该组织
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在或无权访问', 404)
    }

    // 解析请求体
    const body = await request.json().catch(() => ({}))
    const { input, async: asyncExecution } = body as {
      input?: Record<string, unknown>
      async?: boolean
    }

    // 更新 Token 使用统计
    await prisma.apiToken.update({
      where: { id: token.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    })

    // 异步执行模式
    if (asyncExecution) {
      const taskId = await executionQueue.enqueue(
        workflowId,
        organizationId,
        createdById,
        input
      )

      return ApiResponse.success({
        taskId,
        status: 'pending',
        message: '任务已加入队列',
        pollUrl: `/api/v1/tasks/${taskId}`,
      })
    }

    // 同步执行
    const result = await executeWorkflow(
      workflowId,
      organizationId,
      createdById,
      input
    )

    return ApiResponse.success({
      status: result.status,
      output: result.output,
      error: result.error,
      duration: result.duration,
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      outputFiles: result.outputFiles?.map(f => ({
        fileName: f.fileName,
        format: f.format,
        size: f.size,
        url: f.url,
      })),
    })
  } catch (error) {
    console.error('Public API execute workflow error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '执行工作流失败',
      500,
      { status: 'FAILED' }
    )
  }
}

// OPTIONS: 支持 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
