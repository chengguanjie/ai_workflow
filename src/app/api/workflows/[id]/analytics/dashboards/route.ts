import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkResourcePermission } from '@/lib/permissions/resource'
import { z } from 'zod'
import { VisualizationType } from '@prisma/client'
import { ApiResponse } from '@/lib/api/api-response'

// 仪表板小部件配置模式
const widgetConfigSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(VisualizationType),
  title: z.string(),
  configId: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  size: z.object({
    width: z.number(),
    height: z.number(),
  }),
  settings: z.record(z.any()).optional(),
})

// 仪表板配置验证模式
const dashboardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  layout: z.array(widgetConfigSchema),
  settings: z.record(z.any()).optional(),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(false),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET: 获取工作流的分析仪表板
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { id: workflowId } = await params

    // 检查权限
    const canRead = await checkResourcePermission({
      userId: session.user.id,
      resourceType: 'workflow',
      resourceId: workflowId,
      action: 'read',
    })

    if (!canRead) {
      return ApiResponse.error('无权限查看此工作流', 403)
    }

    // 获取仪表板配置
    const dashboards = await prisma.analyticsDashboard.findMany({
      where: {
        workflowId,
        OR: [
          { createdById: session.user.id },
          { isPublic: true },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return ApiResponse.success(dashboards)
  } catch (error) {
    console.error('获取仪表板配置失败:', error)
    return ApiResponse.error('获取仪表板配置失败', 500)
  }
}

// POST: 创建新的分析仪表板
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { id: workflowId } = await params

    // 检查权限
    const canUpdate = await checkResourcePermission({
      userId: session.user.id,
      resourceType: 'workflow',
      resourceId: workflowId,
      action: 'update',
    })

    if (!canUpdate) {
      return ApiResponse.error('无权限修改此工作流', 403)
    }

    // 验证请求体
    const body = await request.json()
    const validatedData = dashboardSchema.parse(body)

    // 如果设置为默认，取消其他默认仪表板
    if (validatedData.isDefault) {
      await prisma.analyticsDashboard.updateMany({
        where: { workflowId, isDefault: true },
        data: { isDefault: false },
      })
    }

    // 创建仪表板
    const dashboard = await prisma.analyticsDashboard.create({
      data: {
        ...validatedData,
        workflowId,
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return ApiResponse.success(dashboard)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ApiResponse.error('请求数据验证失败', 400, { details: error.errors })
    }

    console.error('创建仪表板失败:', error)
    return ApiResponse.error('创建仪表板失败', 500)
  }
}

// PUT: 更新分析仪表板
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { id: workflowId } = await params

    // 获取仪表板ID
    const searchParams = request.nextUrl.searchParams
    const dashboardId = searchParams.get('dashboardId')

    if (!dashboardId) {
      return ApiResponse.error('缺少仪表板ID参数', 400)
    }

    // 检查仪表板所有权或管理权限
    const dashboard = await prisma.analyticsDashboard.findUnique({
      where: { id: dashboardId, workflowId },
    })

    if (!dashboard) {
      return ApiResponse.error('仪表板不存在', 404)
    }

    // 只有创建者或有更新权限的用户可以修改
    const canUpdate = dashboard.createdById === session.user.id ||
      await checkResourcePermission({
        userId: session.user.id,
        resourceType: 'workflow',
        resourceId: workflowId,
        action: 'update',
      })

    if (!canUpdate) {
      return ApiResponse.error('无权限修改此仪表板', 403)
    }

    // 验证请求体
    const body = await request.json()
    const validatedData = dashboardSchema.partial().parse(body)

    // 如果设置为默认，取消其他默认仪表板
    if (validatedData.isDefault) {
      await prisma.analyticsDashboard.updateMany({
        where: {
          workflowId,
          isDefault: true,
          id: { not: dashboardId },
        },
        data: { isDefault: false },
      })
    }

    // 更新仪表板
    const updated = await prisma.analyticsDashboard.update({
      where: { id: dashboardId },
      data: validatedData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return ApiResponse.success(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ApiResponse.error('请求数据验证失败', 400, { details: error.errors })
    }

    console.error('更新仪表板失败:', error)
    return ApiResponse.error('更新仪表板失败', 500)
  }
}

// DELETE: 删除分析仪表板
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权', 401)
    }

    const { id: workflowId } = await params

    // 获取仪表板ID
    const searchParams = request.nextUrl.searchParams
    const dashboardId = searchParams.get('dashboardId')

    if (!dashboardId) {
      return ApiResponse.error('缺少仪表板ID参数', 400)
    }

    // 检查仪表板所有权
    const dashboard = await prisma.analyticsDashboard.findUnique({
      where: { id: dashboardId, workflowId },
    })

    if (!dashboard) {
      return ApiResponse.error('仪表板不存在', 404)
    }

    // 只有创建者或有更新权限的用户可以删除
    const canDelete = dashboard.createdById === session.user.id ||
      await checkResourcePermission({
        userId: session.user.id,
        resourceType: 'workflow',
        resourceId: workflowId,
        action: 'update',
      })

    if (!canDelete) {
      return ApiResponse.error('无权限删除此仪表板', 403)
    }

    // 删除仪表板
    await prisma.analyticsDashboard.delete({
      where: { id: dashboardId },
    })

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('删除仪表板失败:', error)
    return ApiResponse.error('删除仪表板失败', 500)
  }
}