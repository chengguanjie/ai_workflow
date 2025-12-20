/**
 * 平台管理后台 - 反馈详情 API
 *
 * GET   /api/console/platform-feedback/[id] - 获取反馈详情
 * PATCH /api/console/platform-feedback/[id] - 更新反馈（回复、状态、优先级）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { z } from 'zod'
import { PlatformFeedbackStatus, PlatformFeedbackPriority } from '@prisma/client'

// 更新反馈验证 Schema
const updateFeedbackSchema = z.object({
  status: z.nativeEnum(PlatformFeedbackStatus).optional(),
  priority: z.nativeEnum(PlatformFeedbackPriority).optional(),
  reply: z.string().optional(),
  assignedTo: z.string().optional(),
})

// 获取反馈详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params

    const feedback = await prisma.platformFeedback.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
          },
        },
      },
    })

    if (!feedback) {
      return NextResponse.json({ error: '反馈不存在' }, { status: 404 })
    }

    return NextResponse.json({ feedback })
  } catch (error) {
    console.error('获取反馈详情失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

// 更新反馈（回复、状态、优先级）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params

    // 验证反馈存在
    const existingFeedback = await prisma.platformFeedback.findUnique({
      where: { id },
    })

    if (!existingFeedback) {
      return NextResponse.json({ error: '反馈不存在' }, { status: 404 })
    }

    // 解析并验证请求体
    const body = await request.json()
    const parseResult = updateFeedbackSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0].message },
        { status: 400 }
      )
    }

    const { status, priority, reply, assignedTo } = parseResult.data

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (status !== undefined) {
      updateData.status = status
      if (status === 'RESOLVED') {
        updateData.resolvedAt = new Date()
      }
    }

    if (priority !== undefined) {
      updateData.priority = priority
    }

    if (reply !== undefined) {
      updateData.reply = reply
      updateData.repliedAt = new Date()
      // 如果回复了但状态还是待处理，自动更新为已回复
      if (!status && existingFeedback.status === 'PENDING') {
        updateData.status = 'REPLIED'
      }
    }

    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo
      // 如果分配了但状态还是待处理，自动更新为处理中
      if (!status && existingFeedback.status === 'PENDING') {
        updateData.status = 'PROCESSING'
      }
    }

    const feedback = await prisma.platformFeedback.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ feedback })
  } catch (error) {
    console.error('更新反馈失败:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
