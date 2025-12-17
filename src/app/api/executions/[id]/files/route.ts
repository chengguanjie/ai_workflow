/**
 * 执行输出文件 API
 *
 * GET /api/executions/[id]/files - 获取某次执行的所有输出文件
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { storageService } from '@/lib/storage'
import { prisma } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/executions/[id]/files
 * 获取某次执行的所有输出文件
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: executionId } = await params

    // 验证执行记录属于当前企业
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
      select: {
        id: true,
        status: true,
        workflowId: true,
        createdAt: true,
      },
    })

    if (!execution) {
      return NextResponse.json(
        { error: '执行记录不存在或无权访问' },
        { status: 404 }
      )
    }

    // 获取输出文件
    const files = await storageService.getExecutionFiles(
      executionId,
      session.user.organizationId
    )

    return NextResponse.json({
      execution: {
        id: execution.id,
        status: execution.status,
        workflowId: execution.workflowId,
        createdAt: execution.createdAt,
      },
      files: files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        format: file.format,
        mimeType: file.mimeType,
        size: file.size,
        url: file.url,
        downloadCount: file.downloadCount,
        maxDownloads: file.maxDownloads,
        expiresAt: file.expiresAt,
        nodeId: file.nodeId,
        createdAt: file.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get execution files error:', error)
    return NextResponse.json(
      { error: '获取输出文件失败' },
      { status: 500 }
    )
  }
}
