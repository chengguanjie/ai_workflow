/**
 * 公开表单信息 API（无需认证）
 *
 * GET /api/public/forms/[token] - 获取表单信息
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { FormMode } from '@prisma/client'

interface RouteParams {
  params: Promise<{ token: string }>
}

// 获取公开表单信息
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params

    // 查找表单
    const form = await prisma.workflowForm.findUnique({
      where: { shareToken: token },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            description: true,
            config: true,
            organizationId: true,
            organization: {
              select: {
                name: true,
                logo: true,
              },
            },
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

    // 从工作流配置中提取输入节点信息
    // 节点格式: { id, type: 'INPUT', name, position, config: { fields: [...] } }
    const config = form.workflow.config as {
      nodes?: Array<{
        id: string
        type?: string
        name?: string
        config?: {
          fields?: Array<{
            id: string
            name: string
            value?: string
            fieldType?: string
            options?: Array<{ label: string; value: string }>
            placeholder?: string
            required?: boolean
            description?: string
          }>
        }
      }>
    }

    // 提取输入字段
    const inputFields = (config?.nodes || [])
      .filter((node) => node.type === 'INPUT')
      .flatMap((node) => {
        const fields = node.config?.fields || []
        return fields.map((field) => ({
          nodeId: node.id,
          nodeName: node.name || '输入',
          fieldId: field.id,
          fieldName: field.name,
          fieldType: field.fieldType || 'text',
          defaultValue: field.value || '',
          options: field.options || [],
          placeholder: field.placeholder || '',
          required: field.required || false,
          description: field.description || '',
        }))
      })

    // 返回表单信息（不包含敏感数据）
    return NextResponse.json({
      form: {
        id: form.id,
        name: form.name,
        description: form.description,
        showResult: form.showResult,
        successMessage: form.successMessage,
        theme: form.theme,
        // AI 网页模式字段 - 转换枚举为小写字符串
        mode: form.mode === FormMode.AI_PAGE ? 'ai_page' : 'form',
        stylePrompt: form.stylePrompt,
        htmlTemplate: form.htmlTemplate,
        cssStyles: form.cssStyles,
      },
      workflow: {
        name: form.workflow.name,
        description: form.workflow.description,
      },
      organization: {
        name: form.workflow.organization.name,
        logo: form.workflow.organization.logo,
      },
      inputFields,
    })
  } catch (error) {
    console.error('Get public form error:', error)
    return NextResponse.json(
      { error: '获取表单信息失败' },
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
