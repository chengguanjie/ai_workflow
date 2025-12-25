import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { ApiResponse } from '@/lib/api/api-response';
import { templateRecommender } from '@/lib/templates/recommender';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401);
    }

    const { requirement, limit = 3 } = await request.json();

    if (!requirement || typeof requirement !== 'string') {
      return ApiResponse.error('需求描述不能为空', 400);
    }

    const recommendations = await templateRecommender.recommend(
      requirement,
      session.user.organizationId,
      limit
    );

    // 从数据库获取对应模板的 ID
    const templateNames = recommendations.map(r => r.template.name);
    const dbTemplates = await prisma.workflowTemplate.findMany({
      where: {
        name: { in: templateNames },
        isOfficial: true
      },
      select: { id: true, name: true }
    });

    const nameToIdMap = new Map(dbTemplates.map(t => [t.name, t.id]));

    return ApiResponse.success({
      recommendations: recommendations.map(r => ({
        id: nameToIdMap.get(r.template.name) || null,
        name: r.template.name,
        description: r.template.description,
        score: r.score,
        reason: r.reason,
        tags: r.template.tags,
        category: r.template.category
      }))
    });

  } catch (error) {
    console.error('Template recommendation error:', error);
    return ApiResponse.error('推荐请求失败', 500);
  }
}
