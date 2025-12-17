import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET: 获取当前企业可用的 AI 服务商配置列表（供节点选择）
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
        models: true,
        isDefault: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    // 返回格式化后的数据供节点选择
    const providers = configs.map(config => ({
      id: config.id,
      name: config.name,
      provider: config.provider,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      models: config.models as string[] || [],
      isDefault: config.isDefault,
      // 显示名称：配置名称 (服务商)
      displayName: `${config.name} (${getProviderDisplayName(config.provider)})`,
    }))

    return NextResponse.json({
      providers,
      // 默认配置（如果有）
      defaultProvider: providers.find(p => p.isDefault) || providers[0] || null,
    })
  } catch (error) {
    console.error('Failed to get AI providers:', error)
    return NextResponse.json({ error: '获取服务商列表失败' }, { status: 500 })
  }
}

function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    OPENROUTER: 'OpenRouter',
    SHENSUAN: '胜算云',
  }
  return names[provider] || provider
}
