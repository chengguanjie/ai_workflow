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

type WorkflowConfigForStream = {
  nodes?: Array<{ id: string; name: string; type: string }>
  edges?: Array<{ source: string; target: string }>
}

function getExecutionOrder(nodeIds: string[], edges: Array<{ source: string; target: string }>): string[] {
  const adjList = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const nodeId of nodeIds) {
    adjList.set(nodeId, [])
    inDegree.set(nodeId, 0)
  }

  for (const edge of edges) {
    if (!adjList.has(edge.source) || !inDegree.has(edge.target)) continue
    adjList.get(edge.source)!.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
  }

  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId)
  }

  const result: string[] = []
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    result.push(nodeId)
    for (const neighbor of adjList.get(nodeId) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  return result.length === nodeIds.length ? result : nodeIds
}

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
      logs: {
        orderBy: { startedAt: 'asc' },
        select: {
          nodeId: true,
          nodeName: true,
          nodeType: true,
          status: true,
          output: true,
          error: true,
          startedAt: true,
          completedAt: true,
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

      const enqueue = (event: ExecutionProgressEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(data))
      }

      const isTerminal = execution.status === 'COMPLETED' || execution.status === 'FAILED'
      if (!isTerminal) {
        enqueue(initialEvent)
      }

      // 发送快照：回放已产生的日志，并推断当前运行节点，避免 SSE 连接稍晚导致错过 node_start
      try {
        const config = execution.workflow.config as WorkflowConfigForStream
        const nodes = Array.isArray(config?.nodes) ? config.nodes : []
        const edges = Array.isArray(config?.edges) ? config.edges : []

        const totalNodes = nodes.length
        const completedNodes = execution.logs
          .filter((l) => l.status === 'COMPLETED')
          .map((l) => l.nodeId)
        const finishedSet = new Set(
          execution.logs
            .filter((l) => l.status === 'COMPLETED' || l.status === 'FAILED' || l.status === 'CANCELLED')
            .map((l) => l.nodeId)
        )

        // 回放日志（只发最终状态事件）
        for (const log of execution.logs) {
          const isFailed = log.status === 'FAILED'
          const snapshotEvent: ExecutionProgressEvent = {
            executionId,
            type: isFailed ? 'node_error' : 'node_complete',
            nodeId: log.nodeId,
            nodeName: log.nodeName,
            nodeType: log.nodeType,
            status: isFailed ? 'failed' : 'completed',
            progress: totalNodes ? Math.round((completedNodes.length / totalNodes) * 100) : 0,
            completedNodes,
            totalNodes,
            currentNodeIndex: completedNodes.length,
            output: (log.output as Record<string, unknown>) || undefined,
            error: log.error || undefined,
            timestamp: log.completedAt || log.startedAt || new Date(),
          }
          enqueue(snapshotEvent)
        }

        // 推断当前运行节点（顺序执行场景）
        if (execution.status !== 'COMPLETED' && execution.status !== 'FAILED') {
          const order = getExecutionOrder(nodes.map((n) => n.id), edges)
          const runningNodeId = order.find((id) => !finishedSet.has(id))
          if (runningNodeId) {
            const node = nodes.find((n) => n.id === runningNodeId)
            const runningEvent: ExecutionProgressEvent = {
              executionId,
              type: 'node_start',
              nodeId: runningNodeId,
              nodeName: node?.name,
              nodeType: node?.type,
              status: 'running',
              progress: totalNodes ? Math.round((completedNodes.length / totalNodes) * 100) : 0,
              completedNodes,
              totalNodes,
              currentNodeIndex: completedNodes.length,
              timestamp: new Date(),
              inputStatus: 'valid',
            }
            enqueue(runningEvent)
          }
        }
      } catch {
        // 忽略快照错误
      }

      // 如果执行已完成，直接关闭流
      if (isTerminal) {
        enqueue(initialEvent)
        controller.close()
        return
      }

      // 订阅执行进度事件
      const unsubscribe = executionEvents.subscribe(executionId, (event) => {
        try {
          enqueue(event)

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
