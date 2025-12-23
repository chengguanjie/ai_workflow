import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// 获取订阅信息和使用统计
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查权限（仅 OWNER 和 ADMIN 可访问）
    const userRole = (session.user as { role?: string }).role
    if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
      return ApiResponse.error('权限不足', 403)
    }

    const organizationId = session.user.organizationId

    // 获取企业信息
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        plan: true,
        apiQuota: true,
        apiUsed: true,
        _count: {
          select: {
            users: true,
            workflows: {
              where: { deletedAt: null },
            },
          },
        },
      },
    })

    if (!organization) {
      return ApiResponse.error('企业不存在', 404)
    }

    // 获取本月执行统计
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const executionCount = await prisma.execution.count({
      where: {
        workflow: {
          organizationId,
        },
        createdAt: {
          gte: startOfMonth,
        },
      },
    })

    // 获取存储使用（知识库文档大小）
    const storageStats = await prisma.knowledgeDocument.aggregate({
      where: {
        knowledgeBase: {
          organizationId,
        },
      },
      _sum: {
        fileSize: true,
      },
    })

    // 套餐限制配置
    const planLimits: Record<string, {
      workflows: number | null
      executions: number | null
      users: number | null
      storage: number | null // MB
    }> = {
      FREE: { workflows: 3, executions: 100, users: 3, storage: 100 },
      STARTER: { workflows: 10, executions: 1000, users: 10, storage: 1024 },
      PROFESSIONAL: { workflows: 50, executions: 10000, users: 50, storage: 10240 },
      ENTERPRISE: { workflows: null, executions: null, users: null, storage: null },
    }

    const limits = planLimits[organization.plan] || planLimits.FREE

    return ApiResponse.success({
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
      },
      usage: {
        workflows: {
          used: organization._count.workflows,
          limit: limits.workflows,
        },
        executions: {
          used: executionCount,
          limit: limits.executions,
        },
        users: {
          used: organization._count.users,
          limit: limits.users,
        },
        storage: {
          used: Math.round((storageStats._sum.fileSize || 0) / 1024 / 1024), // MB
          limit: limits.storage,
        },
        apiCalls: {
          used: organization.apiUsed,
          limit: organization.apiQuota,
        },
      },
      subscription: null, // 暂时没有订阅数据，后续从 Subscription 表获取
    })
  } catch (error) {
    console.error('获取账单信息失败:', error)
    return ApiResponse.error('获取账单信息失败', 500)
  }
}
