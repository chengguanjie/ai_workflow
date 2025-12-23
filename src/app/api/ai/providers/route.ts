import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import {
  SHENSUAN_MODELS,
  SHENSUAN_DEFAULT_MODELS,
  type ModelModality
} from '@/lib/ai/types'

// GET: 获取当前企业可用的 AI 服务商配置列表（供节点选择）
// 支持 ?modality=text|image-gen|video-gen|... 参数过滤模型
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 获取模态过滤参数
    const { searchParams } = new URL(request.url)
    const modality = searchParams.get('modality') as ModelModality | null

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
        isDefault: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    // 返回格式化后的数据供节点选择
    const providers = configs.map(config => {
      let models = config.models as string[] || []
      let defaultModel = config.defaultModel
      const configDefaultModels = config.defaultModels as Record<string, string> || {}

      // 如果是胜算云，根据模态过滤模型列表
      if (config.provider === 'SHENSUAN' && modality) {
        const modalityModels = SHENSUAN_MODELS[modality] || []
        models = modalityModels as unknown as string[]
        // 优先使用用户配置的模态默认模型，其次使用系统默认
        defaultModel = configDefaultModels[modality] || SHENSUAN_DEFAULT_MODELS[modality] || modalityModels[0] || ''
      } else if (config.provider === 'SHENSUAN' && !modality) {
        // 没有指定模态时，返回文本模型作为默认
        models = SHENSUAN_MODELS.text as unknown as string[]
        defaultModel = configDefaultModels.text || SHENSUAN_DEFAULT_MODELS.text
      } else if (modality && configDefaultModels[modality]) {
        // 其他服务商，如果有配置的模态默认模型，使用它
        defaultModel = configDefaultModels[modality]
      }

      return {
        id: config.id,
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        defaultModel,
        models,
        isDefault: config.isDefault,
        // 显示名称：配置名称 (服务商)
        displayName: `${config.name} (${getProviderDisplayName(config.provider)})`,
      }
    })

    return ApiResponse.success({
      providers,
      defaultProvider: providers.find(p => p.isDefault) || providers[0] || null,
    })
  } catch (error) {
    console.error('Failed to get AI providers:', error)
    return ApiResponse.error('获取服务商列表失败', 500)
  }
}

function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    OPENROUTER: 'OpenRouter',
    SHENSUAN: '胜算云',
    OPENAI: 'OpenAI兼容',
    ANTHROPIC: 'Anthropic',
  }
  return names[provider] || provider
}
