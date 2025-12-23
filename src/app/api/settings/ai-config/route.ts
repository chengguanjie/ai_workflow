import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encryptApiKey, maskApiKey } from '@/lib/crypto'
import { ApiResponse } from '@/lib/api/api-response'
import { AIProvider } from '@prisma/client'

// GET: 获取所有 AI 配置
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const configs = await prisma.apiKey.findMany({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        baseUrl: true,
        defaultModel: true,
        defaultModels: true, // 各模态默认模型
        models: true,
        keyMasked: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return ApiResponse.success({ configs })
  } catch (error) {
    console.error('Failed to get AI configs:', error)
    return ApiResponse.error('获取配置失败', 500)
  }
}

// POST: 添加新的 AI 配置
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查用户权限（只有 OWNER 和 ADMIN 可以修改配置）
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const { provider, name, baseUrl, defaultModel, defaultModels, models, apiKey } = body

    if (!provider || !name || !apiKey) {
      return ApiResponse.error('服务商、名称和 API Key 不能为空', 400)
    }

    // 验证 provider 是有效的枚举值
    if (!Object.values(AIProvider).includes(provider)) {
      return ApiResponse.error('无效的服务商', 400)
    }

    const organizationId = session.user.organizationId

    // 检查是否是第一个配置（设为默认）
    const existingCount = await prisma.apiKey.count({
      where: { organizationId, isActive: true },
    })

    // 确保 JSON 字段是有效的对象
    const safeDefaultModels = defaultModels && typeof defaultModels === 'object'
      ? JSON.parse(JSON.stringify(defaultModels))
      : {}
    const safeModels = Array.isArray(models) ? models : []

    const config = await prisma.apiKey.create({
      data: {
        name,
        provider,
        baseUrl: baseUrl || '',
        defaultModel: defaultModel || '',
        defaultModels: safeDefaultModels, // 各模态默认模型
        models: safeModels,
        keyEncrypted: encryptApiKey(apiKey),
        keyMasked: maskApiKey(apiKey),
        isDefault: existingCount === 0, // 第一个配置设为默认
        organizationId,
      },
    })

    return ApiResponse.success({
      config: {
        id: config.id,
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        defaultModel: config.defaultModel,
        defaultModels: config.defaultModels,
        models: config.models,
        keyMasked: config.keyMasked,
        isDefault: config.isDefault,
      },
    })
  } catch (error) {
    console.error('Failed to create AI config:', error)
    // 返回更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : '创建配置失败'
    return ApiResponse.error(errorMessage, 500)
  }
}
