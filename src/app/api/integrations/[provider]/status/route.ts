import { NextRequest } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'
import { isOAuthProviderId, OAUTH_PROVIDERS } from '@/lib/integrations/oauth/providers'
import { ValidationError } from '@/lib/errors'

type IntegrationStatusPayload = {
  provider: string
  connected: boolean
  mode: 'env' | 'oauth'
  expiresAt: string | null
  updatedAt: string | null
  connectedByUserId: string | null
}

export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const providerRaw = params?.provider
  if (!providerRaw) throw new ValidationError('缺少 provider')

  // wechat_mp 不是 OAuth：用 env 作为“已配置”信号
  if (providerRaw === 'wechat_mp') {
    const configured = Boolean(process.env.WECHAT_MP_APP_ID && process.env.WECHAT_MP_APP_SECRET)
    return ApiResponse.success<IntegrationStatusPayload>({
      provider: 'wechat_mp',
      connected: configured,
      mode: 'env',
      expiresAt: null,
      updatedAt: null,
      connectedByUserId: null,
    })
  }

  if (!isOAuthProviderId(providerRaw)) {
    throw new ValidationError(`不支持的 provider: ${providerRaw}`)
  }

  const cfg = OAUTH_PROVIDERS[providerRaw]
  const record = await prisma.integrationCredential.findUnique({
    where: {
      organizationId_provider: {
        organizationId: user.organizationId,
        provider: cfg.credentialProvider,
      },
    },
    select: {
      expiresAt: true,
      updatedAt: true,
      userId: true,
    },
  })

  return ApiResponse.success<IntegrationStatusPayload>({
    provider: cfg.credentialProvider,
    connected: Boolean(record),
    expiresAt: record?.expiresAt?.toISOString() || null,
    updatedAt: record?.updatedAt?.toISOString() || null,
    connectedByUserId: record?.userId || null,
    mode: 'oauth',
  })
})
