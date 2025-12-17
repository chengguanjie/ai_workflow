import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// DELETE: 删除配置
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 检查用户权限
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const { id } = await params

    // 验证配置属于当前企业
    const config = await prisma.apiKey.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    })

    if (!config) {
      return NextResponse.json({ error: '配置不存在' }, { status: 404 })
    }

    // 软删除（标记为非活动）
    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    })

    // 如果删除的是默认配置，将第一个活动配置设为默认
    if (config.isDefault) {
      const firstConfig = await prisma.apiKey.findFirst({
        where: {
          organizationId: session.user.organizationId,
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      if (firstConfig) {
        await prisma.apiKey.update({
          where: { id: firstConfig.id },
          data: { isDefault: true },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete AI config:', error)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
