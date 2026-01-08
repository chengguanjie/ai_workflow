'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSafeSearchParams } from '@/hooks/use-safe-search-params'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Link2, Unlink } from 'lucide-react'

type IntegrationId = 'wechat_mp' | 'xiaohongshu' | 'douyin_video' | 'wechat_channels'

type IntegrationStatus = {
  provider: string
  connected: boolean
  mode: 'env' | 'oauth'
  expiresAt: string | null
  updatedAt: string | null
  connectedByUserId: string | null
}

const INTEGRATIONS: Array<{
  id: IntegrationId
  label: string
  description: string
}> = [
  { id: 'wechat_mp', label: '微信公众号', description: '通过 AppID/Secret（env）获取 access token' },
  { id: 'xiaohongshu', label: '小红书', description: 'OAuth 授权后 token 落库，用于发布工具' },
  { id: 'douyin_video', label: '抖音', description: 'OAuth 授权后 token 落库，用于发布工具' },
  { id: 'wechat_channels', label: '视频号', description: 'OAuth 授权后 token 落库，用于发布工具' },
]

export default function IntegrationsSettingsPage() {
  const searchParams = useSafeSearchParams()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<IntegrationId | null>(null)
  const [statuses, setStatuses] = useState<Record<IntegrationId, IntegrationStatus | null>>({
    wechat_mp: null,
    xiaohongshu: null,
    douyin_video: null,
    wechat_channels: null,
  })

  const appOrigin = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin
  }, [])

  const loadStatuses = async () => {
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        INTEGRATIONS.map(async (integration) => {
          const res = await fetch(`/api/integrations/${integration.id}/status`, { cache: 'no-store' })
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error?.message || '加载失败')
          return { id: integration.id, status: json.data as IntegrationStatus }
        })
      )

      const next: Record<IntegrationId, IntegrationStatus | null> = {
        wechat_mp: null,
        xiaohongshu: null,
        douyin_video: null,
        wechat_channels: null,
      }
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.id] = r.value.status
      }
      setStatuses(next)
    } catch (error) {
      console.error('Failed to load integration statuses:', error)
      toast.error('加载授权状态失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const connected = searchParams.get('connected')
    const provider = searchParams.get('provider')
    const error = searchParams.get('error')
    if (connected === '1' && provider) toast.success(`${provider} 授权成功`)
    if (error) toast.error(error)
    loadStatuses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startConnect = (id: IntegrationId) => {
    window.location.href = `/api/integrations/${id}/authorize`
  }

  const disconnect = async (id: IntegrationId) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/integrations/${id}/disconnect`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || '断开失败')
      toast.success('已断开连接')
      await loadStatuses()
    } catch (error) {
      console.error('Failed to disconnect:', error)
      toast.error(error instanceof Error ? error.message : '断开连接失败')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">渠道授权</h1>
        <p className="text-muted-foreground mt-1">
          为发布工具完成 OAuth 授权并将 token 落库；公众号使用 env 获取 access token。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>回调地址</CardTitle>
          <CardDescription>在各平台开放平台配置下列回调地址（按需替换域名）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="font-mono">{appOrigin || '(加载中...)'}/api/integrations/xiaohongshu/callback</div>
          <div className="font-mono">{appOrigin || '(加载中...)'}/api/integrations/douyin_video/callback</div>
          <div className="font-mono">{appOrigin || '(加载中...)'}/api/integrations/wechat_channels/callback</div>
        </CardContent>
      </Card>

      {INTEGRATIONS.map((integration) => {
        const status = statuses[integration.id]
        const connected = Boolean(status?.connected)
        const isOauth = status?.mode === 'oauth' || integration.id !== 'wechat_mp'
        const showDisconnect = connected && isOauth && integration.id !== 'wechat_mp'
        const showConnect = !connected && integration.id !== 'wechat_mp'

        return (
          <Card key={integration.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{integration.label}</span>
                {status ? (
                  <Badge variant={connected ? 'default' : 'secondary'}>
                    {connected ? '已连接' : '未连接'}
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>{integration.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
                  </span>
                ) : integration.id === 'wechat_mp' ? (
                  <span>使用 env 配置（WECHAT_MP_APP_ID/WECHAT_MP_APP_SECRET）。</span>
                ) : connected ? (
                  <span>
                    {status?.expiresAt ? `过期时间：${status.expiresAt}` : '已授权（未提供 expiresAt）'}
                  </span>
                ) : (
                  <span>尚未授权。</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {showConnect ? (
                  <Button onClick={() => startConnect(integration.id)} disabled={loading}>
                    <Link2 className="h-4 w-4 mr-2" />
                    连接
                  </Button>
                ) : null}
                {showDisconnect ? (
                  <Button
                    variant="outline"
                    onClick={() => disconnect(integration.id)}
                    disabled={actionLoading === integration.id || loading}
                  >
                    {actionLoading === integration.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-2" />
                    )}
                    断开
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
