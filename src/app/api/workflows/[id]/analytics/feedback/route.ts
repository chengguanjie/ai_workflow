/**
 * 工作流执行反馈 API
 *
 * POST: 提交执行反馈（评分、准确性、问题分类）
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { createAnalyticsCollector } from '@/lib/workflow/analytics-collector'

// 反馈数据验证模式
const feedbackSchema = z.object({
  executionId: z.string(),
  rating: z.number().min(1).max(5),
  isAccurate: z.boolean(),
  issueCategories: z.array(z.string()).optional(),
  comment: z.string().optional(),
})

// POST: 提交执行反馈
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const workflowId = params.id

    // 验证请求体
    const body = await request.json()
    const validatedData = feedbackSchema.parse(body)

    // 检查执行记录是否存在且属于此工作流
    const execution = await prisma.execution.findUnique({
      where: {
        id: validatedData.executionId,
        workflowId,
      },
      include: {
        user: {
          select: {
            departmentId: true,
          },
        },
      },
    })

    if (!execution) {
      return NextResponse.json(
        { error: '执行记录不存在或不属于此工作流' },
        { status: 404 }
      )
    }

    // 检查是否已经有反馈
    const existingFeedback = await prisma.executionFeedback.findUnique({
      where: {
        executionId: validatedData.executionId,
      },
    })

    let feedback
    if (existingFeedback) {
      // 更新现有反馈
      feedback = await prisma.executionFeedback.update({
        where: {
          executionId: validatedData.executionId,
        },
        data: {
          rating: validatedData.rating,
          isAccurate: validatedData.isAccurate,
          issueCategories: validatedData.issueCategories || [],
          comment: validatedData.comment,
          submittedAt: new Date(),
        },
      })
    } else {
      // 创建新反馈
      feedback = await prisma.executionFeedback.create({
        data: {
          executionId: validatedData.executionId,
          userId,
          rating: validatedData.rating,
          isAccurate: validatedData.isAccurate,
          issueCategories: validatedData.issueCategories || [],
          comment: validatedData.comment,
        },
      })
    }

    // 使用分析收集器收集反馈数据
    const analyticsCollector = await createAnalyticsCollector(
      workflowId,
      userId,
      validatedData.executionId,
      execution.user?.departmentId || undefined
    )

    if (analyticsCollector) {
      await analyticsCollector.collectUserFeedback(
        validatedData.rating,
        validatedData.isAccurate,
        validatedData.issueCategories
      )
    }

    return NextResponse.json({
      success: true,
      feedback,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: '请求数据验证失败', details: error.errors },
        { status: 400 }
      )
    }

    console.error('提交反馈失败:', error)
    return NextResponse.json(
      { error: '提交反馈失败' },
      { status: 500 }
    )
  }
}