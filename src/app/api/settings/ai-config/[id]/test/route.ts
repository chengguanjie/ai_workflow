import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

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
    const apiKey = decryptApiKey(config.keyEncrypted)
    const model = config.defaultModel || getDefaultModel(config.provider)

    // 使用配置中的 baseUrl，如果没有则使用默认值
    const baseUrl = config.baseUrl || getDefaultBaseUrl(config.provider)

    // 直接调用 API 进行测试
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: 'Hello, this is a test. Please respond with "OK".' }
        ],
        max_tokens: 10,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      model: data.model || model,
      message: '连接测试成功',
    })
  } catch (error) {
    console.error('AI connection test failed:', error)

    const message = error instanceof Error ? error.message : '连接测试失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'OPENROUTER':
      return 'anthropic/claude-sonnet-4.5'
    case 'SHENSUAN':
      return 'anthropic/claude-sonnet-4.5'
    default:
      return 'anthropic/claude-sonnet-4.5'
  }
}

function getDefaultBaseUrl(provider: string): string {
  switch (provider) {
    case 'OPENROUTER':
      return 'https://openrouter.ai/api/v1'
    case 'SHENSUAN':
      return 'https://router.shengsuanyun.com/api/v1'
    default:
      return 'https://router.shengsuanyun.com/api/v1'
  }
}
