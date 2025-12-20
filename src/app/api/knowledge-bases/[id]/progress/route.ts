/**
 * 知识库处理进度 SSE 端点
 * GET /api/knowledge-bases/[id]/progress - 获取实时处理进度
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: knowledgeBaseId } = await params

  const session = await auth()
  if (!session?.user?.organizationId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
  })

  if (!knowledgeBase || knowledgeBase.organizationId !== session.user.organizationId) {
    return new Response('Not Found', { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const checkProgress = async () => {
        try {
          const documents = await prisma.knowledgeDocument.groupBy({
            by: ['status'],
            where: { knowledgeBaseId },
            _count: true,
          })

          const statusMap = documents.reduce(
            (acc, doc) => {
              acc[doc.status] = doc._count
              return acc
            },
            {} as Record<string, number>
          )

          const progress = {
            total: Object.values(statusMap).reduce((a, b) => a + b, 0),
            pending: statusMap['PENDING'] || 0,
            processing: statusMap['PROCESSING'] || 0,
            completed: statusMap['COMPLETED'] || 0,
            failed: statusMap['FAILED'] || 0,
          }

          const processingDocs = await prisma.knowledgeDocument.findMany({
            where: {
              knowledgeBaseId,
              status: 'PROCESSING',
            },
            select: {
              id: true,
              fileName: true,
            },
          })

          sendEvent({
            type: 'progress',
            progress,
            processing: processingDocs,
            timestamp: Date.now(),
          })

          if (progress.pending === 0 && progress.processing === 0) {
            sendEvent({ type: 'complete', progress })
            controller.close()
            return true
          }

          return false
        } catch (error) {
          console.error('[Progress SSE] Error:', error)
          sendEvent({ type: 'error', message: 'Failed to fetch progress' })
          return false
        }
      }

      sendEvent({ type: 'connected', knowledgeBaseId })

      const isComplete = await checkProgress()
      if (isComplete) return

      const interval = setInterval(async () => {
        const done = await checkProgress()
        if (done) {
          clearInterval(interval)
        }
      }, 2000)

      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
