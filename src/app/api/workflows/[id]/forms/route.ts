import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormMode } from '@prisma/client'
import crypto from 'crypto'
import { ApiResponse } from '@/lib/api/api-response'

// 生成分享 token
function generateShareToken(length = 12): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length)
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// 获取表单列表
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { id: workflowId } = await params

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

    // 获取表单列表
    const forms = await prisma.workflowForm.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        shareToken: true,
        isActive: true,
        expiresAt: true,
        maxSubmissions: true,
        submissionCount: true,
        showResult: true,
        mode: true,
        stylePrompt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // 转换枚举为小写字符串以兼容前端
    const formsWithMode = forms.map(form => ({
      ...form,
      mode: form.mode === FormMode.AI_PAGE ? 'ai_page' : 'form',
    }))

    return ApiResponse.success({ forms: formsWithMode })
  } catch (error) {
    console.error('Get workflow forms error:', error)
    return ApiResponse.error('获取表单列表失败', 500)
  }
}

// 创建新表单
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { id: workflowId } = await params

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

    // 解析请求体
    const body = await request.json()
    const {
      name,
      description,
      expiresAt,
      maxSubmissions,
      showResult = true,
      successMessage,
      theme = 'default',
      mode = 'form',
      stylePrompt,
      htmlTemplate,
      cssStyles,
    } = body

    if (!name?.trim()) {
      return ApiResponse.error('表单名称不能为空', 400)
    }

    // 转换 mode 字符串为枚举值
    const formMode: FormMode = mode === 'ai_page' ? FormMode.AI_PAGE : FormMode.FORM

    // AI 网页模式需要 HTML 模板
    if (formMode === FormMode.AI_PAGE && !htmlTemplate) {
      return ApiResponse.error('AI网页模式需要先生成HTML模板', 400)
    }

    // 生成分享 token
    const shareToken = generateShareToken(12)

    // 创建表单
    const form = await prisma.workflowForm.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        shareToken,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxSubmissions: maxSubmissions ? parseInt(maxSubmissions, 10) : null,
        showResult,
        successMessage: successMessage?.trim() || null,
        theme,
        mode: formMode,
        stylePrompt: stylePrompt?.trim() || null,
        htmlTemplate: htmlTemplate || null,
        cssStyles: cssStyles || null,
        workflowId,
        createdById: session.user.id,
      },
    })

    return ApiResponse.created({ form })
  } catch (error) {
    console.error('Create workflow form error:', error)
    return ApiResponse.error('创建表单失败', 500)
  }
}
