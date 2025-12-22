/**
 * 工作流分析配置 API
 *
 * GET: 获取工作流的分析配置
 * POST: 创建新的分析配置
 * PUT: 更新分析配置
 * DELETE: 删除分析配置
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkResourcePermission } from '@/lib/permissions/resource'
import { z } from 'zod'
import { DataPointType, DataSourceType, AggregationType, VisualizationType } from '@prisma/client'

// 分析配置验证模式
const analyticsConfigSchema = z.object({
  name: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  type: z.nativeEnum(DataPointType),
  source: z.nativeEnum(DataSourceType).default('NODE_OUTPUT'),
  sourcePath: z.string(),
  nodeId: z.string().optional(),
  nodeName: z.string().optional(),
  isRequired: z.boolean().default(false),
  defaultAggregation: z.nativeEnum(AggregationType).optional(),
  supportedAggregations: z.array(z.nativeEnum(AggregationType)).optional(),
  defaultVisualization: z.nativeEnum(VisualizationType).optional(),
  supportedVisualizations: z.array(z.nativeEnum(VisualizationType)).optional(),
  unit: z.string().optional(),
  isActive: z.boolean().default(true),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET: 获取工作流的分析配置
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      return NextResponse.json({ error: '无权限查看此工作流' }, { status: 403 })
    }

    // 获取分析配置
    const configs = await prisma.analyticsConfig.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(configs)
  } catch (error) {
    console.error('获取分析配置失败:', error)
    return NextResponse.json(
      { error: '获取分析配置失败' },
      { status: 500 }
    )
  }
}

// POST: 创建新的分析配置
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      return NextResponse.json({ error: '无权限修改此工作流' }, { status: 403 })
    }

    // 验证请求体
    const body = await request.json()
    const validatedData = analyticsConfigSchema.parse(body)

    // 检查工作流是否存在
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    })

    if (!workflow) {
      return NextResponse.json({ error: '工作流不存在' }, { status: 404 })
    }

    // 创建分析配置
    const config = await prisma.analyticsConfig.create({
      data: {
        ...validatedData,
        workflowId,
      },
    })

    // 如果工作流未启用分析，自动启用
    if (!workflow.analyticsEnabled) {
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { analyticsEnabled: true },
      })
    }

    return NextResponse.json(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: '请求数据验证失败', details: error.errors },
        { status: 400 }
      )
    }

    console.error('创建分析配置失败:', error)
    return NextResponse.json(
      { error: '创建分析配置失败' },
      { status: 500 }
    )
  }
}

// PUT: 批量更新分析配置
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      return NextResponse.json({ error: '无权限修改此工作流' }, { status: 403 })
    }

    // 获取请求体
    const body = await request.json()
    const { configs } = body

    if (!Array.isArray(configs)) {
      return NextResponse.json(
        { error: '请求数据格式错误，需要 configs 数组' },
        { status: 400 }
      )
    }

    // 批量更新
    const updatedConfigs = []
    for (const configUpdate of configs) {
      if (!configUpdate.id) continue

      const { id, ...data } = configUpdate
      const validatedData = analyticsConfigSchema.partial().parse(data)

      const updated = await prisma.analyticsConfig.update({
        where: { id, workflowId },
        data: validatedData,
      })

      updatedConfigs.push(updated)
    }

    return NextResponse.json(updatedConfigs)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: '请求数据验证失败', details: error.errors },
        { status: 400 }
      )
    }

    console.error('更新分析配置失败:', error)
    return NextResponse.json(
      { error: '更新分析配置失败' },
      { status: 500 }
    )
  }
}

// DELETE: 删除分析配置
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      return NextResponse.json({ error: '无权限修改此工作流' }, { status: 403 })
    }

    // 获取要删除的配置ID
    const searchParams = request.nextUrl.searchParams
    const configId = searchParams.get('configId')

    if (!configId) {
      return NextResponse.json(
        { error: '缺少配置ID参数' },
        { status: 400 }
      )
    }

    // 删除配置（级联删除相关数据点）
    await prisma.analyticsConfig.delete({
      where: { id: configId, workflowId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除分析配置失败:', error)
    return NextResponse.json(
      { error: '删除分析配置失败' },
      { status: 500 }
    )
  }
}