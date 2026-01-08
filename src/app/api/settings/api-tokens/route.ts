import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { randomBytes, createHash } from 'crypto'
import { logApiTokenChange } from '@/lib/audit'

// 生成 API Token
function generateToken(): { token: string; hash: string; prefix: string } {
  const randomPart = randomBytes(32).toString('base64url')
  const token = `wf_${randomPart}`
  const prefix = token.slice(0, 10)
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash, prefix }
}

// GET: 获取所有 API Tokens
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const tokens = await prisma.apiToken.findMany({
      where: {
        organizationId: session.user.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        scopes: true,
        usageCount: true,
        createdAt: true,
      },
    })

    return ApiResponse.success({ tokens })
  } catch (error) {
    const { logError } = await import('@/lib/security/safe-logger')
    logError('Failed to get API tokens', error instanceof Error ? error : undefined)
    return ApiResponse.error('获取失败', 500)
  }
}

// POST: 创建新的 API Token
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.organizationId || !session.user.id) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const { name, expiresIn, scopes = ['workflows', 'executions'] } = body

    if (!name?.trim()) {
      return ApiResponse.error('请输入 Token 名称', 400)
    }

    // 生成 Token
    const { token, hash, prefix } = generateToken()

    // 计算过期时间
    let expiresAt: Date | null = null
    if (expiresIn && expiresIn !== 'never') {
      const now = new Date()
      switch (expiresIn) {
        case '7d':
          expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          break
        case '90d':
          expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
          break
        case '1y':
          expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
          break
      }
    }

    const apiToken = await prisma.apiToken.create({
      data: {
        name,
        token,
        tokenHash: hash,
        prefix,
        expiresAt,
        scopes,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
      },
    })

    // SECURITY: Never log the actual token value
    const { logInfo } = await import('@/lib/security/safe-logger')
    logInfo('Created API Token', { 
      id: apiToken.id, 
      name: apiToken.name, 
      prefix: apiToken.prefix,
      tokenLength: token.length,
      // 不记录实际的token值
    })

    // 记录审计日志
    await logApiTokenChange(
      session.user.id,
      session.user.organizationId,
      'created',
      {
        tokenId: apiToken.id,
        tokenName: apiToken.name,
        tokenPrefix: apiToken.prefix,
        scopes: Array.isArray(scopes) ? scopes : [],
        expiresAt: apiToken.expiresAt,
      }
    )

    // 返回完整 Token（仅此一次）
    // 直接使用生成的 token 变量，而不是从数据库返回的值
    return ApiResponse.success({
      id: apiToken.id,
      name: apiToken.name,
      token: token, // 使用生成的 token，确保返回完整值
      prefix: apiToken.prefix,
      expiresAt: apiToken.expiresAt,
      scopes: apiToken.scopes,
      createdAt: apiToken.createdAt,
    })
  } catch (error) {
    const { logError } = await import('@/lib/security/safe-logger')
    logError('Failed to create API token', error instanceof Error ? error : undefined)
    return ApiResponse.error('创建失败', 500)
  }
}
