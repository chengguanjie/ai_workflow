import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// 获取单个工作流
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params

    const workflow = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: '工作流不存在' }, { status: 404 })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error('获取工作流失败:', error)
    return NextResponse.json({ error: '获取工作流失败' }, { status: 500 })
  }
}

// 更新工作流
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, config, isActive, category, tags } = body

    // 验证工作流存在
    const existing = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: '工作流不存在' }, { status: 404 })
    }

    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(config !== undefined && { config }),
        ...(isActive !== undefined && { isActive }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
        version: { increment: 1 },
      },
    })

    return NextResponse.json(workflow)
  } catch (error) {
    console.error('更新工作流失败:', error)
    return NextResponse.json({ error: '更新工作流失败' }, { status: 500 })
  }
}

// 删除工作流（软删除）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params

    // 验证工作流存在
    const existing = await prisma.workflow.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: '工作流不存在' }, { status: 404 })
    }

    await prisma.workflow.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除工作流失败:', error)
    return NextResponse.json({ error: '删除工作流失败' }, { status: 500 })
  }
}
