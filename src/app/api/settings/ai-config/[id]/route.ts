import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encryptApiKey, maskApiKey } from '@/lib/crypto'
import { ApiResponse } from '@/lib/api/api-response'
import { normalizeModels } from '@/lib/ai/normalize-models'

// GET: 获取单个配置详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const { id } = await params

    const config = await prisma.apiKey.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        baseUrl: true,
        defaultModel: true,
        defaultModels: true,
        models: true,
        keyMasked: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!config) {
      return ApiResponse.error('配置不存在', 404)
    }

    return ApiResponse.success({
      config: {
        ...config,
        models: normalizeModels(config.models),
      },
    })
  } catch (error) {
    console.error('Failed to get AI config:', error)
    return ApiResponse.error('获取配置失败', 500)
  }
}

// PATCH: 更新配置
export async function PATCH(
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

    // 验证配置属于当前企业
    const existingConfig = await prisma.apiKey.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        isActive: true,
      },
    })

    if (!existingConfig) {
      return ApiResponse.error('配置不存在', 404)
    }

    const body = await request.json()
    const { name, baseUrl, defaultModel, defaultModels, models, apiKey } = body

    // 构建更新数据
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      updateData.name = name
    }
    if (baseUrl !== undefined) {
      updateData.baseUrl = baseUrl
    }
    if (defaultModel !== undefined) {
      updateData.defaultModel = defaultModel
    }
    if (defaultModels !== undefined) {
      updateData.defaultModels = defaultModels && typeof defaultModels === 'object'
        ? JSON.parse(JSON.stringify(defaultModels))
        : {}
    }
    if (models !== undefined) {
      updateData.models = Array.isArray(models) ? models : []
    }
    // 只有提供了新的 API Key 才更新
    if (apiKey && apiKey.trim()) {
      updateData.keyEncrypted = encryptApiKey(apiKey)
      updateData.keyMasked = maskApiKey(apiKey)
    }

    const config = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        provider: true,
        baseUrl: true,
        defaultModel: true,
        defaultModels: true,
        models: true,
        keyMasked: true,
        isDefault: true,
        isActive: true,
      },
    })

    return ApiResponse.success({ config })
  } catch (error) {
    console.error('Failed to update AI config:', error)
    return ApiResponse.error('更新配置失败', 500)
  }
}

// DELETE: 删除配置
export async function DELETE(
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

    // 验证配置属于当前企业
    const config = await prisma.apiKey.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    })

    if (!config) {
      return ApiResponse.error('配置不存在', 404)
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

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete AI config:', error)
    return ApiResponse.error('删除失败', 500)
  }
}
