export type OAuthProviderId =
  | 'xiaohongshu'
  | 'douyin_video'
  | 'wechat_channels'

export type OAuthProviderConfig = {
  id: OAuthProviderId
  label: string
  /** provider key used in IntegrationCredential.provider (and tool executor name) */
  credentialProvider: string
  clientIdEnv: string
  clientSecretEnv: string
  authorizationUrlEnv: string
  tokenUrlEnv: string
  scopesEnv?: string
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  xiaohongshu: {
    id: 'xiaohongshu',
    label: '小红书',
    credentialProvider: 'xiaohongshu',
    clientIdEnv: 'OAUTH_XHS_CLIENT_ID',
    clientSecretEnv: 'OAUTH_XHS_CLIENT_SECRET',
    authorizationUrlEnv: 'OAUTH_XHS_AUTHORIZATION_URL',
    tokenUrlEnv: 'OAUTH_XHS_TOKEN_URL',
    scopesEnv: 'OAUTH_XHS_SCOPES',
  },
  douyin_video: {
    id: 'douyin_video',
    label: '抖音',
    credentialProvider: 'douyin_video',
    clientIdEnv: 'OAUTH_DOUYIN_CLIENT_ID',
    clientSecretEnv: 'OAUTH_DOUYIN_CLIENT_SECRET',
    authorizationUrlEnv: 'OAUTH_DOUYIN_AUTHORIZATION_URL',
    tokenUrlEnv: 'OAUTH_DOUYIN_TOKEN_URL',
    scopesEnv: 'OAUTH_DOUYIN_SCOPES',
  },
  wechat_channels: {
    id: 'wechat_channels',
    label: '视频号',
    credentialProvider: 'wechat_channels',
    clientIdEnv: 'OAUTH_WECHAT_CHANNELS_CLIENT_ID',
    clientSecretEnv: 'OAUTH_WECHAT_CHANNELS_CLIENT_SECRET',
    authorizationUrlEnv: 'OAUTH_WECHAT_CHANNELS_AUTHORIZATION_URL',
    tokenUrlEnv: 'OAUTH_WECHAT_CHANNELS_TOKEN_URL',
    scopesEnv: 'OAUTH_WECHAT_CHANNELS_SCOPES',
  },
}

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return value === 'xiaohongshu' || value === 'douyin_video' || value === 'wechat_channels'
}
