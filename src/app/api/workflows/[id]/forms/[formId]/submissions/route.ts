/**
 * 表单提交记录 API
 *
 * GET /api/workflows/[id]/forms/[formId]/submissions - 获取提交记录列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string; formId: string }>
}

// 获取提交记录列表
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id: workflowId, formId } = await params

    // 验证工作流权限
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: '工作流不存在' }, { status: 404 })
    }

    // 验证表单存在
    const form = await prisma.workflowForm.findFirst({
      where: {
        id: formId,
        workflowId,
      },
    })

    if (!form) {
      return NextResponse.json({ error: '表单不存在' }, { status: 404 })
    }

    // 解析查询参数
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)
    const skip = (page - 1) * pageSize

    // 获取提交记录
    const [submissions, total] = await Promise.all([
      prisma.workflowFormSubmission.findMany({
        where: { formId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          inputData: true,
          executionId: true,
          submitterIp: true,
          createdAt: true,
        },
      }),
      prisma.workflowFormSubmission.count({
        where: { formId },
      }),
    ])

    // 获取关联的执行记录
    const executionIds = submissions
      .filter((s) => s.executionId)
      .map((s) => s.executionId as string)

    const executions = executionIds.length > 0
      ? await prisma.execution.findMany({
          where: { id: { in: executionIds } },
          select: {
            id: true,
            status: true,
            completedAt: true,
            duration: true,
          },
        })
      : []

    const executionMap = new Map(executions.map((e) => [e.id, e]))

    // 合并数据
    const submissionsWithExecution = submissions.map((s) => ({
      ...s,
      execution: s.executionId ? executionMap.get(s.executionId) || null : null,
    }))

    return NextResponse.json({
      submissions: submissionsWithExecution,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Get form submissions error:', error)
    return NextResponse.json(
      { error: '获取提交记录失败' },
      { status: 500 }
    )
  }
}
