import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

interface RouteParams {
  params: Promise<{ id: string; formId: string }>
}

// 获取表单详情
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
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
      return ApiResponse.error('工作流不存在', 404)
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
      return ApiResponse.error('表单不存在', 404)
    }

    return ApiResponse.success({ form })
  } catch (error) {
    console.error('Get form detail error:', error)
    return ApiResponse.error('获取表单详情失败', 500)
  }
}

// 更新表单
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
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
      return ApiResponse.error('工作流不存在', 404)
    }

    // 验证表单存在
    const existingForm = await prisma.workflowForm.findFirst({
      where: {
        id: formId,
        workflowId,
      },
    })

    if (!existingForm) {
      return ApiResponse.error('表单不存在', 404)
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
        return ApiResponse.error('表单名称不能为空', 400)
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

    return ApiResponse.success({ form })
  } catch (error) {
    console.error('Update form error:', error)
    return ApiResponse.error('更新表单失败', 500)
  }
}

// 删除表单
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
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
      return ApiResponse.error('工作流不存在', 404)
    }

    // 验证表单存在
    const existingForm = await prisma.workflowForm.findFirst({
      where: {
        id: formId,
        workflowId,
      },
    })

    if (!existingForm) {
      return ApiResponse.error('表单不存在', 404)
    }

    // 删除表单（级联删除提交记录）
    await prisma.workflowForm.delete({
      where: { id: formId },
    })

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Delete form error:', error)
    return ApiResponse.error('删除表单失败', 500)
  }
}
