import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  getTemplateRatingStats,
  getTemplateRatings,
  submitRating,
  getUserRating,
  deleteRating,
} from '@/lib/services/template-rating'
import { ApiResponse } from '@/lib/api/api-response'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET: 获取模板评分列表和统计
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')

    // 检查模板是否存在
    const template = await prisma.workflowTemplate.findFirst({
      where: {
        id,
        OR: [
          { organizationId: session.user.organizationId },
          { isOfficial: true },
          { visibility: 'PUBLIC' },
        ],
      },
      select: {
        id: true,
        templateType: true,
        isOfficial: true,
      },
    })

    if (!template) {
      return ApiResponse.error('模板不存在', 404)
    }

    // 公域模板不支持评分
    if (template.isOfficial || template.templateType === 'PUBLIC') {
      return ApiResponse.error('公域模板不支持评分', 400)
    }

    // 获取评分统计
    const stats = await getTemplateRatingStats(id)

    // 获取评分列表
    const { ratings, total } = await getTemplateRatings(id, page, pageSize)

    // 获取当前用户的评分
    const myRating = await getUserRating(id, session.user.id)

    return ApiResponse.success({
      stats,
      data: ratings,
      myRating,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Failed to get template ratings:', error)
    return ApiResponse.error('获取评分失败', 500)
  }
}

// POST: 提交评分
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const { score, comment } = body as { score: number; comment?: string }

    // 验证参数
    if (!score || score < 1 || score > 5 || !Number.isInteger(score)) {
      return ApiResponse.error('评分必须是 1-5 之间的整数', 400)
    }

    // 检查模板是否存在且属于同一组织
    const template = await prisma.workflowTemplate.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        templateType: 'INTERNAL',
        isOfficial: false,
      },
    })

    if (!template) {
      return ApiResponse.error('模板不存在或不支持评分', 404)
    }

    // 提交评分
    await submitRating(
      id,
      session.user.id,
      session.user.name || null,
      score,
      comment
    )

    // 获取更新后的统计
    const stats = await getTemplateRatingStats(id)
    const myRating = await getUserRating(id, session.user.id)

    return ApiResponse.success({
      success: true,
      stats,
      myRating,
    })
  } catch (error) {
    console.error('Failed to submit rating:', error)
    return ApiResponse.error('提交评分失败', 500)
  }
}

// DELETE: 删除自己的评分
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 删除评分
    await deleteRating(id, session.user.id)

    // 获取更新后的统计
    const stats = await getTemplateRatingStats(id)

    return ApiResponse.success({
      success: true,
      stats,
    })
  } catch (error) {
    console.error('Failed to delete rating:', error)
    return ApiResponse.error('删除评分失败', 500)
  }
}
