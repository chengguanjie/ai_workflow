import { prisma } from '@/lib/db'

/**
 * 模板评分服务
 */

export interface RatingStats {
  averageScore: number
  totalRatings: number
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
}

export interface RatingItem {
  id: string
  score: number
  comment: string | null
  userId: string
  userName: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 获取模板的评分统计
 */
export async function getTemplateRatingStats(templateId: string): Promise<RatingStats> {
  const ratings = await prisma.templateRating.findMany({
    where: { templateId },
    select: { score: true },
  })

  if (ratings.length === 0) {
    return {
      averageScore: 0,
      totalRatings: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }
  }

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let totalScore = 0

  for (const rating of ratings) {
    totalScore += rating.score
    if (rating.score >= 1 && rating.score <= 5) {
      distribution[rating.score as 1 | 2 | 3 | 4 | 5]++
    }
  }

  return {
    averageScore: Math.round((totalScore / ratings.length) * 10) / 10,
    totalRatings: ratings.length,
    distribution,
  }
}

/**
 * 提交或更新评分
 */
export async function submitRating(
  templateId: string,
  userId: string,
  userName: string | null,
  score: number,
  comment?: string
): Promise<void> {
  // 验证评分范围
  if (score < 1 || score > 5 || !Number.isInteger(score)) {
    throw new Error('评分必须是 1-5 之间的整数')
  }

  // 验证模板存在且不是公域模板
  const template = await prisma.workflowTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, templateType: true, isOfficial: true },
  })

  if (!template) {
    throw new Error('模板不存在')
  }

  if (template.isOfficial || template.templateType === 'PUBLIC') {
    throw new Error('公域模板不允许评分')
  }

  // 创建或更新评分
  await prisma.templateRating.upsert({
    where: {
      templateId_userId: {
        templateId,
        userId,
      },
    },
    create: {
      templateId,
      userId,
      userName,
      score,
      comment: comment || null,
    },
    update: {
      score,
      comment: comment || null,
    },
  })

  // 更新模板的平均评分
  await updateTemplateRating(templateId)
}

/**
 * 更新模板的平均评分（缓存字段）
 */
async function updateTemplateRating(templateId: string): Promise<void> {
  const stats = await getTemplateRatingStats(templateId)

  await prisma.workflowTemplate.update({
    where: { id: templateId },
    data: {
      rating: stats.averageScore,
      ratingCount: stats.totalRatings,
    },
  })
}

/**
 * 获取用户对模板的评分
 */
export async function getUserRating(
  templateId: string,
  userId: string
): Promise<{ score: number; comment: string | null } | null> {
  const rating = await prisma.templateRating.findUnique({
    where: {
      templateId_userId: {
        templateId,
        userId,
      },
    },
    select: { score: true, comment: true },
  })

  return rating
}

/**
 * 获取模板的评分列表（分页）
 */
export async function getTemplateRatings(
  templateId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<{ ratings: RatingItem[]; total: number }> {
  const skip = (page - 1) * pageSize

  const [ratings, total] = await Promise.all([
    prisma.templateRating.findMany({
      where: { templateId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.templateRating.count({
      where: { templateId },
    }),
  ])

  return {
    ratings: ratings.map((r) => ({
      id: r.id,
      score: r.score,
      comment: r.comment,
      userId: r.userId,
      userName: r.userName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
  }
}

/**
 * 删除评分
 */
export async function deleteRating(templateId: string, userId: string): Promise<void> {
  await prisma.templateRating.delete({
    where: {
      templateId_userId: {
        templateId,
        userId,
      },
    },
  })

  // 更新模板的平均评分
  await updateTemplateRating(templateId)
}

/**
 * 删除模板的所有评分（模板删除时调用）
 */
export async function deleteAllRatings(templateId: string): Promise<void> {
  await prisma.templateRating.deleteMany({
    where: { templateId },
  })
}
