import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

interface RouteParams {
  params: Promise<{ token: string; id: string }>
}

// 查询执行状态
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token, id: executionId } = await params

    // 验证表单存在且有效
    const form = await prisma.workflowForm.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        showResult: true,
        workflowId: true,
      },
    })

    if (!form) {
      return ApiResponse.error('表单不存在或已失效', 404)
    }

    // 如果不显示结果，返回禁止访问
    if (!form.showResult) {
      return ApiResponse.error('该表单不支持查看执行结果', 403)
    }

    // 查询执行记录
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflowId: form.workflowId,
      },
      select: {
        id: true,
        status: true,
        output: true,
        error: true,
        startedAt: true,
        completedAt: true,
        duration: true,
      },
    })

    if (!execution) {
      return ApiResponse.error('执行记录不存在', 404)
    }

    // 获取输出文件
    let outputFiles: Array<{
      id: string
      fileName: string
      format: string
      url: string
      size: number
    }> = []

    if (execution.status === 'COMPLETED') {
      const files = await prisma.outputFile.findMany({
        where: { executionId: execution.id },
        select: {
          id: true,
          fileName: true,
          format: true,
          url: true,
          size: true,
        },
      })
      outputFiles = files.map((f: { id: string; fileName: string; format: string; url: string | null; size: number }) => ({
        ...f,
        url: f.url || '',
      }))
    }

    return ApiResponse.success({
      execution: {
        id: execution.id,
        status: execution.status,
        output: execution.output,
        error: execution.error,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        duration: execution.duration,
      },
      outputFiles,
    })
  } catch (error) {
    console.error('Get execution status error:', error)
    return ApiResponse.error('获取执行状态失败', 500)
  }
}

// CORS 支持
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
