/**
 * 执行进度 SSE 流
 *
 * 使用 Server-Sent Events 实时推送执行进度
 *
 * GET /api/executions/[id]/stream
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { executionEvents, type ExecutionProgressEvent } from '@/lib/workflow/execution-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: executionId } = await params

  // 验证会话
  const session = await auth()
  if (!session?.user?.organizationId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 验证执行记录存在且属于当前组织
  const execution = await prisma.execution.findFirst({
    where: {
      id: executionId,
      workflow: {
        organizationId: session.user.organizationId,
      },
    },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          config: true,
        },
      },
    },
  })

  if (!execution) {
    return new Response('Execution not found', { status: 404 })
  }

  // 创建 SSE 响应流
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 发送初始状态
      const initialEvent: ExecutionProgressEvent = {
        executionId,
        type: execution.status === 'COMPLETED'
          ? 'execution_complete'
          : execution.status === 'FAILED'
            ? 'execution_error'
            : 'node_start',
        progress: execution.status === 'COMPLETED' ? 100 : 0,
        completedNodes: [],
        totalNodes: 0,
        currentNodeIndex: 0,
        timestamp: new Date(),
        error: execution.error || undefined,
      }

      // 解析工作流配置获取节点数
      try {
        const config = execution.workflow.config as { nodes?: unknown[] }
        if (config?.nodes) {
          initialEvent.totalNodes = config.nodes.length
        }
      } catch {
        // 忽略解析错误
      }

      // 发送初始事件
      const initialData = `data: ${JSON.stringify(initialEvent)}\n\n`
      controller.enqueue(encoder.encode(initialData))

      // 如果执行已完成，直接关闭流
      if (execution.status === 'COMPLETED' || execution.status === 'FAILED') {
        controller.close()
        return
      }

      // 订阅执行进度事件
      const unsubscribe = executionEvents.subscribe(executionId, (event) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))

          // 如果执行完成或失败，关闭流
          if (event.type === 'execution_complete' || event.type === 'execution_error') {
            setTimeout(() => {
              unsubscribe()
              controller.close()
            }, 100)
          }
        } catch {
          // 流已关闭，取消订阅
          unsubscribe()
        }
      })

      // 心跳保持连接
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
          unsubscribe()
        }
      }, 30000) // 每 30 秒发送心跳

      // 清理函数
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
    },
  })
}
