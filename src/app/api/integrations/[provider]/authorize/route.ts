import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/api/with-auth'
import { randomBytes } from 'crypto'
import { isOAuthProviderId, OAUTH_PROVIDERS } from '@/lib/integrations/oauth/providers'
import { buildEncryptedState, getOAuthRedirectUri, getProviderEnv } from '@/lib/integrations/oauth/utils'
import { ValidationError } from '@/lib/errors'

export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const providerRaw = params?.provider
  if (!providerRaw) throw new ValidationError('缺少 provider')

  if (!isOAuthProviderId(providerRaw)) throw new ValidationError(`不支持的 OAuth provider: ${providerRaw}`)

  const cfg = OAUTH_PROVIDERS[providerRaw]

  const accept = request.headers.get('accept') || ''
  const wantsJson = accept.includes('application/json') || request.nextUrl.searchParams.get('format') === 'json'

  let env: ReturnType<typeof getProviderEnv>
  try {
    env = getProviderEnv(providerRaw)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth 配置缺失'
    if (!wantsJson) {
      const url = new URL('/settings/integrations', request.url)
      url.searchParams.set('provider', cfg.credentialProvider)
      url.searchParams.set('error', message)
      return NextResponse.redirect(url.toString())
    }
    throw error
  }
  const redirectUri = getOAuthRedirectUri(providerRaw)

  const state = randomBytes(16).toString('hex')
  const encryptedState = buildEncryptedState({
    provider: providerRaw,
    state,
    organizationId: user.organizationId,
    userId: user.id,
    createdAt: Date.now(),
  })

  const url = new URL(env.authorizationUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', env.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  if (env.scopes) url.searchParams.set('scope', env.scopes)
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set(`oauth_state_${cfg.credentialProvider}`, encryptedState, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 10 * 60,
  })
  return res
})
