import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// POST: 设置为默认配置
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查用户权限
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('权限不足', 403)
    }

    const { id } = await params
    const organizationId = session.user.organizationId

    // 验证配置属于当前企业
    const config = await prisma.apiKey.findFirst({
      where: {
        id,
        organizationId,
        isActive: true,
      },
    })

    if (!config) {
      return ApiResponse.error('配置不存在', 404)
    }

    // 先将所有配置设为非默认
    await prisma.apiKey.updateMany({
      where: { organizationId },
      data: { isDefault: false },
    })

    // 将指定配置设为默认
    await prisma.apiKey.update({
      where: { id },
      data: { isDefault: true },
    })

    return ApiResponse.success({})
  } catch (error) {
    console.error('Failed to set default AI config:', error)
    return ApiResponse.error('设置失败', 500)
  }
}
