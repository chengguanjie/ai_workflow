import { encryptApiKey, safeDecryptApiKey } from '@/lib/crypto'
import { OAUTH_PROVIDERS, type OAuthProviderId } from './providers'
import { ValidationError } from '@/lib/errors'

export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

export function getOAuthRedirectUri(provider: OAuthProviderId): string {
  const base = getAppBaseUrl()
  return new URL(`/api/integrations/${provider}/callback`, base).toString()
}

export function getProviderEnv(provider: OAuthProviderId) {
  const cfg = OAUTH_PROVIDERS[provider]
  const clientId = process.env[cfg.clientIdEnv]
  const clientSecret = process.env[cfg.clientSecretEnv]
  const authorizationUrl = process.env[cfg.authorizationUrlEnv]
  const tokenUrl = process.env[cfg.tokenUrlEnv]
  const scopes = cfg.scopesEnv ? process.env[cfg.scopesEnv] : undefined

  if (!clientId || !clientId.trim()) throw new ValidationError(`缺少环境变量 ${cfg.clientIdEnv}`)
  if (!clientSecret || !clientSecret.trim()) throw new ValidationError(`缺少环境变量 ${cfg.clientSecretEnv}`)
  if (!authorizationUrl || !authorizationUrl.trim()) throw new ValidationError(`缺少环境变量 ${cfg.authorizationUrlEnv}`)
  if (!tokenUrl || !tokenUrl.trim()) throw new ValidationError(`缺少环境变量 ${cfg.tokenUrlEnv}`)

  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    authorizationUrl: authorizationUrl.trim(),
    tokenUrl: tokenUrl.trim(),
    scopes: scopes?.trim(),
  }
}

export type OAuthStatePayload = {
  provider: OAuthProviderId
  state: string
  organizationId: string
  userId: string
  createdAt: number
}

export function buildEncryptedState(payload: OAuthStatePayload): string {
  return encryptApiKey(JSON.stringify(payload))
}

export function parseEncryptedState(encrypted: string): OAuthStatePayload {
  const plain = safeDecryptApiKey(encrypted)
  const obj = JSON.parse(plain) as OAuthStatePayload
  if (!obj || typeof obj !== 'object') throw new ValidationError('无效 state')
  return obj
}

export async function exchangeCodeForToken(params: {
  provider: OAuthProviderId
  code: string
}): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
  raw: unknown
}> {
  const env = getProviderEnv(params.provider)
  const redirectUri = getOAuthRedirectUri(params.provider)

  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', env.clientId)
  body.set('client_secret', env.clientSecret)
  body.set('code', params.code)
  body.set('redirect_uri', redirectUri)

  const response = await fetch(env.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const rawText = await response.text()
  let data: any = rawText
  try { data = rawText ? JSON.parse(rawText) : {} } catch { /* keep */ }

  if (!response.ok) {
    throw new Error(`OAuth token 交换失败: HTTP ${response.status} ${response.statusText}`)
  }

  const accessToken = data.access_token || data.accessToken
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('OAuth token 响应缺少 access_token')
  }

  const refreshToken = typeof (data.refresh_token || data.refreshToken) === 'string'
    ? (data.refresh_token || data.refreshToken)
    : undefined

  const expiresIn = typeof (data.expires_in || data.expiresIn) === 'number'
    ? (data.expires_in || data.expiresIn)
    : undefined

  const scope = typeof data.scope === 'string' ? data.scope : undefined

  return {
    accessToken: accessToken.trim(),
    refreshToken: refreshToken?.trim(),
    expiresIn,
    scope,
    raw: data,
  }
}

export async function refreshAccessToken(params: {
  provider: OAuthProviderId
  refreshToken: string
}): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
  raw: unknown
}> {
  const env = getProviderEnv(params.provider)

  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('client_id', env.clientId)
  body.set('client_secret', env.clientSecret)
  body.set('refresh_token', params.refreshToken)

  const response = await fetch(env.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const rawText = await response.text()
  let data: any = rawText
  try { data = rawText ? JSON.parse(rawText) : {} } catch { /* keep */ }

  if (!response.ok) {
    throw new Error(`OAuth refresh 失败: HTTP ${response.status} ${response.statusText}`)
  }

  const accessToken = data.access_token || data.accessToken
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('OAuth refresh 响应缺少 access_token')
  }

  const refreshToken = typeof (data.refresh_token || data.refreshToken) === 'string'
    ? (data.refresh_token || data.refreshToken)
    : undefined

  const expiresIn = typeof (data.expires_in || data.expiresIn) === 'number'
    ? (data.expires_in || data.expiresIn)
    : undefined

  const scope = typeof data.scope === 'string' ? data.scope : undefined

  return {
    accessToken: accessToken.trim(),
    refreshToken: refreshToken?.trim(),
    expiresIn,
    scope,
    raw: data,
  }
}
