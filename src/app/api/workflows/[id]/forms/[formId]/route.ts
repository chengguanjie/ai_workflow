/**
 * 工作流表单详情 API
 *
 * GET /api/workflows/[id]/forms/[formId] - 获取表单详情
 * PATCH /api/workflows/[id]/forms/[formId] - 更新表单
 * DELETE /api/workflows/[id]/forms/[formId] - 删除表单
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string; formId: string }>
}

// 获取表单详情
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

    // 获取表单详情
    const form = await prisma.workflowForm.findFirst({
      where: {
        id: formId,
        workflowId,
      },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    })

    if (!form) {
      return NextResponse.json({ error: '表单不存在' }, { status: 404 })
    }

    return NextResponse.json({ form })
  } catch (error) {
    console.error('Get form detail error:', error)
    return NextResponse.json(
      { error: '获取表单详情失败' },
      { status: 500 }
    )
  }
}

// 更新表单
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    const existingForm = await prisma.workflowForm.findFirst({
      where: {
        id: formId,
        workflowId,
      },
    })

    if (!existingForm) {
      return NextResponse.json({ error: '表单不存在' }, { status: 404 })
    }

    // 解析请求体
    const body = await request.json()
    const {
      name,
      description,
      isActive,
      expiresAt,
      maxSubmissions,
      showResult,
      successMessage,
      theme,
    } = body

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!name?.trim()) {
        return NextResponse.json({ error: '表单名称不能为空' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive)
    }

    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt ? new Date(expiresAt) : null
    }

    if (maxSubmissions !== undefined) {
      updateData.maxSubmissions = maxSubmissions ? parseInt(maxSubmissions, 10) : null
    }

    if (showResult !== undefined) {
      updateData.showResult = Boolean(showResult)
    }

    if (successMessage !== undefined) {
      updateData.successMessage = successMessage?.trim() || null
    }

    if (theme !== undefined) {
      updateData.theme = theme
    }

    // 更新表单
    const form = await prisma.workflowForm.update({
      where: { id: formId },
      data: updateData,
    })

    return NextResponse.json({ form })
  } catch (error) {
    console.error('Update form error:', error)
    return NextResponse.json(
      { error: '更新表单失败' },
      { status: 500 }
    )
  }
}

// 删除表单
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
    const existingForm = await prisma.workflowForm.findFirst({
      where: {
        id: formId,
        workflowId,
      },
    })

    if (!existingForm) {
      return NextResponse.json({ error: '表单不存在' }, { status: 404 })
    }

    // 删除表单（级联删除提交记录）
    await prisma.workflowForm.delete({
      where: { id: formId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete form error:', error)
    return NextResponse.json(
      { error: '删除表单失败' },
      { status: 500 }
    )
  }
}
