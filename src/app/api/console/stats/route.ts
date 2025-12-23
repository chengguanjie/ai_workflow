import { NextResponse } from 'next/server'
import { consoleAuth } from '@/lib/console-auth'
import { hasPermission } from '@/lib/console-auth/permissions'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import type { PlatformRole } from '@prisma/client'

// GET - 获取平台统计数据
export async function GET() {
  const session = await consoleAuth()

  if (!session?.user) {
    return ApiResponse.error('未登录', 401)
  }

  if (!hasPermission(session.user.role as PlatformRole, 'stats:read')) {
    return ApiResponse.error('权限不足', 403)
  }

  // 获取各类统计数据
  const [
    // 企业统计
    orgStats,
    orgByPlan,
    orgByStatus,

    // 用户统计
    totalUsers,
    activeUsers,

    // 工作流统计
    totalWorkflows,
    activeWorkflows,

    // 执行统计
    executionStats,
    recentExecutions,

    // 最近创建的企业
    recentOrgs,
  ] = await Promise.all([
    // 企业总数
    prisma.organization.count(),

    // 按套餐分组
    prisma.organization.groupBy({
      by: ['plan'],
      _count: true,
    }),

    // 按状态分组
    prisma.organization.groupBy({
      by: ['status'],
      _count: true,
    }),

    // 用户总数
    prisma.user.count(),

    // 活跃用户（30天内登录）
    prisma.user.count({
      where: {
        lastLoginAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),

    // 工作流总数
    prisma.workflow.count({
      where: { deletedAt: null },
    }),

    // 活跃工作流
    prisma.workflow.count({
      where: {
        deletedAt: null,
        isActive: true,
      },
    }),

    // 执行统计（按状态分组）
    prisma.execution.groupBy({
      by: ['status'],
      _count: true,
    }),

    // 最近7天执行趋势
    prisma.$queryRaw`
      SELECT
        DATE(createdAt) as date,
        COUNT(*) as count
      FROM executions
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    ` as Promise<{ date: Date; count: bigint }[]>,

    // 最近创建的企业
    prisma.organization.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        createdAt: true,
        _count: {
          select: { users: true },
        },
      },
    }),
  ])

  return ApiResponse.success({
    overview: {
      totalOrganizations: orgStats,
      totalUsers,
      activeUsers,
      totalWorkflows,
      activeWorkflows,
    },
    organizations: {
      byPlan: orgByPlan.reduce(
        (acc, item) => ({
          ...acc,
          [item.plan]: item._count,
        }),
        {}
      ),
      byStatus: orgByStatus.reduce(
        (acc, item) => ({
          ...acc,
          [item.status]: item._count,
        }),
        {}
      ),
    },
    executions: {
      byStatus: executionStats.reduce(
        (acc, item) => ({
          ...acc,
          [item.status]: item._count,
        }),
        {}
      ),
      trend: recentExecutions.map((item) => ({
        date: item.date,
        count: Number(item.count),
      })),
    },
    recentOrganizations: recentOrgs.map((org) => ({
      id: org.id,
      name: org.name,
      plan: org.plan,
      status: org.status,
      userCount: org._count.users,
      createdAt: org.createdAt,
    })),
  })
}
