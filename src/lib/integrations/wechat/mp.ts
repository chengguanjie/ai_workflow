/**
 * 微信公众号（MP）基础能力
 * - access_token 获取与缓存
 *
 * 说明：这里使用环境变量提供 appid/secret，避免引入数据库存储。
 */

type AccessTokenCache = {
  token: string
  expiresAt: number
}

let cache: AccessTokenCache | null = null

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value.trim()
}

export function clearWeChatMpTokenCache(): void {
  cache = null
}

export async function getWeChatMpAccessToken(): Promise<string> {
  const now = Date.now()
  if (cache && cache.expiresAt > now + 30_000) {
    return cache.token
  }

  const appId = requireEnv('WECHAT_MP_APP_ID')
  const appSecret = requireEnv('WECHAT_MP_APP_SECRET')

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)

  const response = await fetch(url.toString(), { method: 'GET' })
  const data = (await response.json()) as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }

  if (!response.ok || !data.access_token) {
    throw new Error(`获取微信公众号 access_token 失败: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`)
  }

  const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 7200
  cache = {
    token: data.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  }

  return cache.token
}

