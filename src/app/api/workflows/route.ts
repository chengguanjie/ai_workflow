import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// 获取工作流列表
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const workflows = await prisma.workflow.findMany({
      where: {
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        isActive: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(workflows)
  } catch (error) {
    console.error('获取工作流列表失败:', error)
    return NextResponse.json({ error: '获取工作流列表失败' }, { status: 500 })
  }
}

// 创建工作流
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, config } = body

    if (!name || !config) {
      return NextResponse.json({ error: '名称和配置不能为空' }, { status: 400 })
    }

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description: description || '',
        config,
        organizationId: session.user.organizationId,
        creatorId: session.user.id,
      },
    })

    return NextResponse.json(workflow, { status: 201 })
  } catch (error) {
    console.error('创建工作流失败:', error)
    return NextResponse.json({ error: '创建工作流失败' }, { status: 500 })
  }
}
