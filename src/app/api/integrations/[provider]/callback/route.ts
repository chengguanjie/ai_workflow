import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { isOAuthProviderId, OAUTH_PROVIDERS } from '@/lib/integrations/oauth/providers'
import { exchangeCodeForToken, parseEncryptedState } from '@/lib/integrations/oauth/utils'
import { upsertIntegrationCredential } from '@/lib/integrations/credentials'
import { ValidationError } from '@/lib/errors'

export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const providerRaw = params?.provider
  if (!providerRaw) throw new ValidationError('缺少 provider')
  if (!isOAuthProviderId(providerRaw)) throw new ValidationError(`不支持的 OAuth provider: ${providerRaw}`)

  const cfg = OAUTH_PROVIDERS[providerRaw]
  const code = request.nextUrl.searchParams.get('code')
  const returnedState = request.nextUrl.searchParams.get('state')
  const accept = request.headers.get('accept') || ''
  const wantsJson = accept.includes('application/json') || request.nextUrl.searchParams.get('format') === 'json'

  if (!code) throw new ValidationError('缺少 code')
  if (!returnedState) throw new ValidationError('缺少 state')

  const cookieName = `oauth_state_${cfg.credentialProvider}`
  const encrypted = request.cookies.get(cookieName)?.value
  if (!encrypted) throw new ValidationError('缺少 state cookie（可能已过期），请重新发起授权')

  const statePayload = parseEncryptedState(encrypted)
  if (statePayload.provider !== providerRaw) throw new ValidationError('state provider 不匹配')
  if (statePayload.state !== returnedState) throw new ValidationError('state 不匹配')
  if (statePayload.organizationId !== user.organizationId || statePayload.userId !== user.id) {
    throw new ValidationError('state 与当前登录用户不匹配')
  }

  const token = await exchangeCodeForToken({ provider: providerRaw, code })

  const expiresAt = typeof token.expiresIn === 'number'
    ? new Date(Date.now() + token.expiresIn * 1000)
    : undefined

  await upsertIntegrationCredential({
    organizationId: user.organizationId,
    userId: user.id,
    provider: cfg.credentialProvider,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt,
    scope: token.scope,
    metadata: { oauth: token.raw as any },
  })

  if (wantsJson) {
    return ApiResponse.success({
      provider: cfg.credentialProvider,
      connected: true,
      expiresAt: expiresAt?.toISOString() || null,
    })
  }

  const url = new URL('/settings/integrations', request.url)
  url.searchParams.set('provider', cfg.credentialProvider)
  url.searchParams.set('connected', '1')
  const res = NextResponse.redirect(url.toString())
  res.cookies.delete(cookieName)
  return res
})
