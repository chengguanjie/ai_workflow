import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { encryptApiKey, safeDecryptApiKey } from '@/lib/crypto'
import { refreshAccessToken } from './oauth/utils'
import { isOAuthProviderId, type OAuthProviderId } from './oauth/providers'

// Token 刷新配置
const TOKEN_REFRESH_CONFIG = {
  // 在过期前多少毫秒开始刷新（默认5分钟）
  REFRESH_THRESHOLD_MS: 5 * 60 * 1000,
  // 刷新失败后重试次数
  MAX_RETRY_COUNT: 2,
  // 重试间隔（毫秒）
  RETRY_DELAY_MS: 1000,
}

export async function upsertIntegrationCredential(params: {
  organizationId: string
  userId: string
  provider: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scope?: string
  externalAccountId?: string
  metadata?: Record<string, unknown>
}) {
  return prisma.integrationCredential.upsert({
    where: {
      organizationId_provider: {
        organizationId: params.organizationId,
        provider: params.provider,
      },
    },
    create: {
      organizationId: params.organizationId,
      userId: params.userId,
      provider: params.provider,
      accessTokenEncrypted: encryptApiKey(params.accessToken),
      refreshTokenEncrypted: params.refreshToken ? encryptApiKey(params.refreshToken) : null,
      expiresAt: params.expiresAt ?? null,
      scope: params.scope ?? null,
      externalAccountId: params.externalAccountId ?? null,
      metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
    },
    update: {
      userId: params.userId,
      accessTokenEncrypted: encryptApiKey(params.accessToken),
      refreshTokenEncrypted: params.refreshToken ? encryptApiKey(params.refreshToken) : null,
      expiresAt: params.expiresAt ?? null,
      scope: params.scope ?? null,
      externalAccountId: params.externalAccountId ?? null,
      metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  })
}

/**
 * 带重试的 Token 刷新
 */
async function refreshTokenWithRetry(
  provider: OAuthProviderId,
  refreshToken: string,
  maxRetries: number = TOKEN_REFRESH_CONFIG.MAX_RETRY_COUNT
): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[TokenRefresh] 重试第 ${attempt} 次，provider: ${provider}`)
        await new Promise(resolve => setTimeout(resolve, TOKEN_REFRESH_CONFIG.RETRY_DELAY_MS))
      }
      
      const result = await refreshAccessToken({ provider, refreshToken })
      console.log(`[TokenRefresh] 成功刷新 ${provider} Token`)
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[TokenRefresh] 刷新失败 (尝试 ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`)
    }
  }
  
  throw lastError || new Error('Token 刷新失败')
}

/**
 * 检查 Token 是否需要刷新
 */
function shouldRefreshToken(expiresAt: Date | null): { needsRefresh: boolean; isExpired: boolean } {
  if (!expiresAt) {
    return { needsRefresh: false, isExpired: false }
  }
  
  const now = Date.now()
  const expiresTime = expiresAt.getTime()
  const isExpired = expiresTime <= now
  const needsRefresh = expiresTime <= now + TOKEN_REFRESH_CONFIG.REFRESH_THRESHOLD_MS
  
  return { needsRefresh, isExpired }
}

export async function getIntegrationAccessToken(params: {
  organizationId: string
  provider: string
}): Promise<{
  source: 'db' | 'env' | 'refreshed'
  accessToken: string
  expiresAt?: Date | null
  refreshedAt?: Date
}> {
  const record = await prisma.integrationCredential.findUnique({
    where: {
      organizationId_provider: {
        organizationId: params.organizationId,
        provider: params.provider,
      },
    },
    select: {
      accessTokenEncrypted: true,
      refreshTokenEncrypted: true,
      expiresAt: true,
    },
  })

  if (record) {
    const accessToken = safeDecryptApiKey(record.accessTokenEncrypted)
    const { needsRefresh, isExpired } = shouldRefreshToken(record.expiresAt)
    
    // 如果需要刷新且有 refresh token 且是 OAuth provider
    if (needsRefresh && record.refreshTokenEncrypted && isOAuthProviderId(params.provider)) {
      const refreshToken = safeDecryptApiKey(record.refreshTokenEncrypted)
      
      try {
        const refreshed = await refreshTokenWithRetry(
          params.provider as OAuthProviderId,
          refreshToken
        )

        const newExpiresAt = typeof refreshed.expiresIn === 'number'
          ? new Date(Date.now() + refreshed.expiresIn * 1000)
          : null

        // 更新数据库
        await prisma.integrationCredential.update({
          where: {
            organizationId_provider: {
              organizationId: params.organizationId,
              provider: params.provider,
            },
          },
          data: {
            accessTokenEncrypted: encryptApiKey(refreshed.accessToken),
            refreshTokenEncrypted: refreshed.refreshToken 
              ? encryptApiKey(refreshed.refreshToken) 
              : record.refreshTokenEncrypted,
            expiresAt: newExpiresAt,
          },
        })

        console.log(`[TokenRefresh] 已更新 ${params.provider} Token，新过期时间: ${newExpiresAt?.toISOString()}`)

        return { 
          source: 'refreshed', 
          accessToken: refreshed.accessToken,
          expiresAt: newExpiresAt,
          refreshedAt: new Date(),
        }
      } catch (refreshError) {
        // 刷新失败的处理
        const errorMsg = refreshError instanceof Error ? refreshError.message : String(refreshError)
        console.error(`[TokenRefresh] 刷新 ${params.provider} Token 失败: ${errorMsg}`)
        
        // 如果 Token 已经过期，抛出错误
        if (isExpired) {
          throw new Error(`${params.provider} Token 已过期且刷新失败: ${errorMsg}。请重新进行 OAuth 授权。`)
        }
        
        // 如果 Token 还没过期，返回当前 Token 并记录警告
        console.warn(`[TokenRefresh] ${params.provider} Token 刷新失败但未过期，使用现有 Token`)
        return { 
          source: 'db', 
          accessToken,
          expiresAt: record.expiresAt,
        }
      }
    }

    return { 
      source: 'db', 
      accessToken,
      expiresAt: record.expiresAt,
    }
  }

  // Fallback to env (compat)
  const candidateKeys: string[] = []
  candidateKeys.push(`${params.provider.toUpperCase()}_ACCESS_TOKEN`)
  if (params.provider === 'xiaohongshu') candidateKeys.push('XHS_ACCESS_TOKEN')
  if (params.provider === 'douyin_video') candidateKeys.push('DOUYIN_ACCESS_TOKEN')
  if (params.provider === 'wechat_channels') candidateKeys.push('WECHAT_CHANNELS_ACCESS_TOKEN')

  for (const key of candidateKeys) {
    const fromEnv = process.env[key]
    if (fromEnv && fromEnv.trim()) {
      return { source: 'env', accessToken: fromEnv.trim() }
    }
  }

  throw new Error(`未找到 ${params.provider} 的 access token：请先完成 OAuth 连接或配置环境变量（例如 ${candidateKeys.join(', ')}）`)
}

/**
 * 批量检查并刷新即将过期的 Token
 * 可用于定时任务（如 cron job）
 */
export async function refreshExpiringTokens(options?: {
  thresholdMinutes?: number
  dryRun?: boolean
}): Promise<{
  checked: number
  refreshed: number
  failed: Array<{ provider: string; organizationId: string; error: string }>
}> {
  const thresholdMs = (options?.thresholdMinutes ?? 10) * 60 * 1000
  const dryRun = options?.dryRun ?? false
  
  const expiringRecords = await prisma.integrationCredential.findMany({
    where: {
      expiresAt: {
        lte: new Date(Date.now() + thresholdMs),
        gt: new Date(), // 还没过期的
      },
      refreshTokenEncrypted: {
        not: null,
      },
    },
    select: {
      organizationId: true,
      provider: true,
      refreshTokenEncrypted: true,
      expiresAt: true,
    },
  })

  console.log(`[TokenRefresh] 检查到 ${expiringRecords.length} 个即将过期的 Token`)

  const result = {
    checked: expiringRecords.length,
    refreshed: 0,
    failed: [] as Array<{ provider: string; organizationId: string; error: string }>,
  }

  if (dryRun) {
    console.log('[TokenRefresh] Dry run 模式，跳过实际刷新')
    return result
  }

  for (const record of expiringRecords) {
    if (!isOAuthProviderId(record.provider)) {
      continue
    }

    try {
      const refreshToken = safeDecryptApiKey(record.refreshTokenEncrypted!)
      const refreshed = await refreshTokenWithRetry(
        record.provider as OAuthProviderId,
        refreshToken,
        1 // 批量刷新时只重试一次
      )

      const newExpiresAt = typeof refreshed.expiresIn === 'number'
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : null

      await prisma.integrationCredential.update({
        where: {
          organizationId_provider: {
            organizationId: record.organizationId,
            provider: record.provider,
          },
        },
        data: {
          accessTokenEncrypted: encryptApiKey(refreshed.accessToken),
          refreshTokenEncrypted: refreshed.refreshToken 
            ? encryptApiKey(refreshed.refreshToken) 
            : record.refreshTokenEncrypted,
          expiresAt: newExpiresAt,
        },
      })

      result.refreshed++
      console.log(`[TokenRefresh] 批量刷新成功: ${record.provider} (org: ${record.organizationId})`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.failed.push({
        provider: record.provider,
        organizationId: record.organizationId,
        error: errorMsg,
      })
      console.error(`[TokenRefresh] 批量刷新失败: ${record.provider} (org: ${record.organizationId}): ${errorMsg}`)
    }
  }

  return result
}

/**
 * 检查指定 Token 的过期状态
 */
export async function checkTokenStatus(params: {
  organizationId: string
  provider: string
}): Promise<{
  exists: boolean
  source?: 'db' | 'env'
  isExpired?: boolean
  expiresAt?: Date | null
  minutesUntilExpiry?: number
  hasRefreshToken?: boolean
}> {
  const record = await prisma.integrationCredential.findUnique({
    where: {
      organizationId_provider: {
        organizationId: params.organizationId,
        provider: params.provider,
      },
    },
    select: {
      expiresAt: true,
      refreshTokenEncrypted: true,
    },
  })

  if (record) {
    const now = Date.now()
    const isExpired = record.expiresAt ? record.expiresAt.getTime() <= now : false
    const minutesUntilExpiry = record.expiresAt 
      ? Math.floor((record.expiresAt.getTime() - now) / 60000)
      : undefined

    return {
      exists: true,
      source: 'db',
      isExpired,
      expiresAt: record.expiresAt,
      minutesUntilExpiry,
      hasRefreshToken: !!record.refreshTokenEncrypted,
    }
  }

  // 检查环境变量
  const candidateKeys = [
    `${params.provider.toUpperCase()}_ACCESS_TOKEN`,
    params.provider === 'xiaohongshu' ? 'XHS_ACCESS_TOKEN' : null,
    params.provider === 'douyin_video' ? 'DOUYIN_ACCESS_TOKEN' : null,
    params.provider === 'wechat_channels' ? 'WECHAT_CHANNELS_ACCESS_TOKEN' : null,
  ].filter(Boolean)

  for (const key of candidateKeys) {
    if (key && process.env[key]?.trim()) {
      return {
        exists: true,
        source: 'env',
        // 环境变量中的 Token 无法判断过期状态
        isExpired: undefined,
        hasRefreshToken: false,
      }
    }
  }

  return { exists: false }
}
