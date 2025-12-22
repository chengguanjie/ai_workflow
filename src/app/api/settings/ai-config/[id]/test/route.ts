import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService, type AIProviderType } from '@/lib/ai'

// POST: 测试 AI 连接
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params

    // 获取配置
    const config = await prisma.apiKey.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
        isActive: true,
      },
    })

    if (!config) {
      return NextResponse.json({ error: '配置不存在' }, { status: 404 })
    }

    // 解密 API Key
    const apiKey = safeDecryptApiKey(config.keyEncrypted)
    const provider = config.provider as AIProviderType
    const model = config.defaultModel || getDefaultModel(provider, config.defaultModels)

    // 使用配置中的 baseUrl，如果没有则使用默认值
    const baseUrl = config.baseUrl || getDefaultBaseUrl(provider)

    const result = await aiService.chat(
      provider,
      {
        model,
        messages: [
          { role: 'user', content: 'Hello, this is a test. Please respond with "OK".' }
        ],
        maxTokens: 10,
      },
      apiKey,
      baseUrl
    )

    return NextResponse.json({
      success: true,
      model: result.model || model,
      message: '连接测试成功',
    })
  } catch (error) {
    console.error('AI connection test failed:', error)

    const message = error instanceof Error ? error.message : '连接测试失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getDefaultModel(
  provider: AIProviderType,
  defaultModels: unknown
): string {
  const textDefaultModel =
    typeof defaultModels === 'object' && defaultModels !== null
      ? (defaultModels as Record<string, string>).text
      : undefined
  if (textDefaultModel) return textDefaultModel

  switch (provider) {
    case 'ANTHROPIC':
      return 'claude-3-5-sonnet-20241022'
    case 'OPENROUTER':
      return 'anthropic/claude-sonnet-4.5'
    case 'SHENSUAN':
      return 'anthropic/claude-sonnet-4.5'
    case 'OPENAI':
      return 'gpt-4o-mini'
    default:
      return 'anthropic/claude-sonnet-4.5'
  }
}

function getDefaultBaseUrl(provider: AIProviderType): string {
  switch (provider) {
    case 'OPENAI':
      return 'https://api.openai.com/v1'
    case 'ANTHROPIC':
      return 'https://api.anthropic.com'
    case 'OPENROUTER':
      return 'https://openrouter.ai/api/v1'
    case 'SHENSUAN':
      return 'https://router.shengsuanyun.com/api/v1'
    default:
      return 'https://router.shengsuanyun.com/api/v1'
  }
}
