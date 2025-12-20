/**
 * 公开表单提交 API（无需认证）
 *
 * POST /api/public/forms/[token]/submit - 提交表单
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'

interface RouteParams {
  params: Promise<{ token: string }>
}

// 提交表单
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params

    // 查找表单
    const form = await prisma.workflowForm.findUnique({
      where: { shareToken: token },
      include: {
        workflow: {
          select: {
            id: true,
            organizationId: true,
            creatorId: true,
          },
        },
      },
    })

    if (!form) {
      return NextResponse.json(
        { error: '表单不存在或已失效' },
        { status: 404 }
      )
    }

    // 检查表单是否激活
    if (!form.isActive) {
      return NextResponse.json(
        { error: '表单已停用' },
        { status: 403 }
      )
    }

    // 检查是否过期
    if (form.expiresAt && new Date(form.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: '表单已过期' },
        { status: 403 }
      )
    }

    // 检查提交次数限制
    if (form.maxSubmissions && form.submissionCount >= form.maxSubmissions) {
      return NextResponse.json(
        { error: '表单已达到最大提交次数' },
        { status: 403 }
      )
    }

    // 获取提交数据
    const body = await request.json()
    const { input } = body as { input: Record<string, unknown> }

    // 获取客户端信息
    const submitterIp = request.headers.get('x-forwarded-for') ||
                        request.headers.get('x-real-ip') ||
                        'unknown'
    const userAgent = request.headers.get('user-agent') || null

    // 更新提交计数
    await prisma.workflowForm.update({
      where: { id: form.id },
      data: {
        submissionCount: { increment: 1 },
      },
    })

    // 根据配置决定是否等待结果
    if (form.showResult) {
      // 同步执行，等待结果
      try {
        const result = await executeWorkflow(
          form.workflow.id,
          form.workflow.organizationId,
          form.workflow.creatorId,
          input
        )

        // 创建提交记录
        await prisma.workflowFormSubmission.create({
          data: {
            formId: form.id,
            inputData: input as object,
            executionId: result.executionId || null,
            submitterIp,
            submitterInfo: userAgent ? { userAgent } : undefined,
          },
        })

        // 获取输出文件
        let outputFiles: Array<{
          id: string
          fileName: string
          format: string
          url: string
          size: number
        }> = []

        if (result.executionId) {
          const files = await prisma.outputFile.findMany({
            where: { executionId: result.executionId },
            select: {
              id: true,
              fileName: true,
              format: true,
              url: true,
              size: true,
            },
          })
          outputFiles = files.map(f => ({
            ...f,
            url: f.url || '',
          }))
        }

        return NextResponse.json({
          success: true,
          status: result.status,
          output: result.output,
          error: result.error,
          duration: result.duration,
          executionId: result.executionId,
          outputFiles,
        })
      } catch (error) {
        console.error('Workflow execution error:', error)
        return NextResponse.json({
          success: false,
          status: 'FAILED',
          error: error instanceof Error ? error.message : '执行失败',
        })
      }
    } else {
      // 异步执行，立即返回
      const taskId = await executionQueue.enqueue(
        form.workflow.id,
        form.workflow.organizationId,
        form.workflow.creatorId,
        input
      )

      // 创建提交记录（无执行ID，稍后更新）
      await prisma.workflowFormSubmission.create({
        data: {
          formId: form.id,
          inputData: input as object,
          submitterIp,
          submitterInfo: userAgent ? { userAgent } : undefined,
        },
      })

      return NextResponse.json({
        success: true,
        taskId,
        message: form.successMessage || '提交成功！',
      })
    }
  } catch (error) {
    console.error('Submit public form error:', error)
    return NextResponse.json(
      { error: '提交表单失败' },
      { status: 500 }
    )
  }
}

// CORS 支持
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
