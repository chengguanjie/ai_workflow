/**
 * 节点调试流式 API
 *
 * POST /api/workflows/[id]/nodes/[nodeId]/debug/stream - 流式调试单个节点
 *
 * 使用 Server-Sent Events 实时推送调试日志
 * Requirements: 2.1, 2.2, 2.4
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { debugNodeWithStream } from '@/lib/workflow/debug'
import type { WorkflowConfig } from '@/types/workflow'
import {
  createLogEvent,
  createStatusEvent,
  createCompleteEvent,
  createErrorEvent,
  type DebugLogEvent,
} from '@/lib/workflow/debug-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface DebugStreamRequest {
  mockInputs?: Record<string, Record<string, unknown>>
  timeout?: number
  /** 当前节点配置（前端传递，优先于数据库配置） */
  nodeConfig?: Record<string, unknown>
}

const DEFAULT_DEBUG_TIMEOUT_MS = 240 * 1000 // 240 秒，支持较慢的网关/模型响应
const HEARTBEAT_INTERVAL_MS = 15000 // 15 秒心跳间隔

/**
 * POST /api/workflows/[id]/nodes/[nodeId]/debug/stream
 * 流式调试单个节点
 *
 * Request body:
 * {
 *   mockInputs?: Record<string, Record<string, unknown>>  // 模拟的上游节点输出
 *   timeout?: number                                       // 超时时间（秒，1-60）
 *   nodeConfig?: Record<string, unknown>                   // 当前节点配置
 * }
 *
 * Response: SSE 流
 * - log 事件: 调试日志
 * - status 事件: 执行状态变更
 * - complete 事件: 执行完成
 * - error 事件: 执行错误
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; nodeId: string }> }
) {
  const { id: workflowId, nodeId } = await params

  // 验证会话
  const session = await auth()
  if (!session?.user?.organizationId) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 解析请求体
  let body: DebugStreamRequest
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: '无效的请求体' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { mockInputs = {}, timeout, nodeConfig } = body

  // 验证超时参数
  if (timeout !== undefined && (timeout < 1 || timeout > 300)) {
    return new Response(JSON.stringify({ error: '超时时间必须在1-300秒之间' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 获取工作流
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      organizationId: session.user.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      config: true,
    },
  })

  if (!workflow) {
    return new Response(JSON.stringify({ error: '工作流不存在或无权访问' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const config = workflow.config as unknown as WorkflowConfig

  if (!config || !config.nodes) {
    return new Response(JSON.stringify({ error: '工作流配置无效' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const foundNode = config.nodes.find((n) => n.id === nodeId)

  if (!foundNode) {
    return new Response(JSON.stringify({ error: '节点不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 如果前端传递了节点配置，使用前端的配置
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetNode: any = nodeConfig
    ? { ...foundNode, config: nodeConfig }
    : foundNode

  const timeoutMs = timeout ? timeout * 1000 : DEFAULT_DEBUG_TIMEOUT_MS

  // 创建 SSE 响应流
  const encoder = new TextEncoder()

  const safeStringify = (value: unknown): string => {
    const seen = new WeakSet<object>()
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack }
      }
      if (typeof v === 'function') {
        return `[Function${v.name ? ` ${v.name}` : ''}]`
      }
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]'
        seen.add(v)
      }
      return v
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeatInterval: NodeJS.Timeout | null = null
      let isStreamClosed = false

      // 发送 SSE 事件的辅助函数
      const sendEvent = (event: DebugLogEvent) => {
        if (isStreamClosed) return
        try {
          const data = `data: ${safeStringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch {
          // 流已关闭
          isStreamClosed = true
        }
      }

      // 关闭流的辅助函数
      const closeStream = () => {
        if (isStreamClosed) return
        isStreamClosed = true
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval)
          heartbeatInterval = null
        }
        try {
          controller.close()
        } catch {
          // 流已关闭
        }
      }

      // 启动心跳
      heartbeatInterval = setInterval(() => {
        if (isStreamClosed) {
          if (heartbeatInterval) clearInterval(heartbeatInterval)
          return
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          isStreamClosed = true
          if (heartbeatInterval) clearInterval(heartbeatInterval)
        }
      }, HEARTBEAT_INTERVAL_MS)

      // 监听请求中断
      request.signal.addEventListener('abort', () => {
        closeStream()
      })

      // 发送初始状态
      sendEvent(createStatusEvent('running'))

      // 超时处理
      const timeoutId = setTimeout(() => {
        sendEvent(createErrorEvent(`节点调试超时 (${timeoutMs / 1000}秒)`))
        sendEvent(createCompleteEvent({
          status: 'error',
          output: {},
          error: `节点调试超时 (${timeoutMs / 1000}秒)`,
          duration: timeoutMs,
        }))
        closeStream()
      }, timeoutMs)

      try {
        // 执行调试，使用流式日志回调
        const result = await debugNodeWithStream({
          workflowId,
          organizationId: session.user.organizationId,
          userId: session.user.id,
          node: targetNode,
          mockInputs,
          config,
          timeoutMs,
          onLog: (log) => {
            sendEvent(createLogEvent(log))
          },
        })

        // 清除超时
        clearTimeout(timeoutId)

        // 发送完成事件
        sendEvent(createCompleteEvent({
          status: result.status,
          output: result.output,
          error: result.error,
          duration: result.duration,
          tokenUsage: result.tokenUsage,
          approvalRequestId: result.approvalRequestId,
        }))

        // 发送最终状态
        sendEvent(createStatusEvent(
          result.status === 'success' ? 'completed' : 'failed'
        ))

      } catch (error) {
        // 清除超时
        clearTimeout(timeoutId)

        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined

        sendEvent(createErrorEvent(errorMessage, errorStack))
        sendEvent(createCompleteEvent({
          status: 'error',
          output: {},
          error: errorMessage,
          duration: Date.now(),
        }))
        sendEvent(createStatusEvent('failed'))
      } finally {
        // 延迟关闭流，确保客户端收到所有事件
        setTimeout(() => {
          closeStream()
        }, 100)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
    },
  })
}
