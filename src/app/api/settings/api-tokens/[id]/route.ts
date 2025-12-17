import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

// DELETE: 删除 API Token
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth()
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await context.params

    // 验证 Token 属于当前组织
    const token = await prisma.apiToken.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token 不存在' }, { status: 404 })
    }

    await prisma.apiToken.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete API token:', error)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}

// PATCH: 更新 API Token（启用/禁用）
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth()
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()
    const { isActive } = body

    // 验证 Token 属于当前组织
    const token = await prisma.apiToken.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token 不存在' }, { status: 404 })
    }

    const updated = await prisma.apiToken.update({
      where: { id },
      data: { isActive },
    })

    return NextResponse.json({
      id: updated.id,
      isActive: updated.isActive,
    })
  } catch (error) {
    console.error('Failed to update API token:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
