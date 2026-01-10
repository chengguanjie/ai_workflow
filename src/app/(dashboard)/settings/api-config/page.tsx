'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSafeSearchParams } from '@/hooks/use-safe-search-params'
import { Loader2 } from 'lucide-react'

const AIConfigPanel = dynamic(
  () => import('@/app/(dashboard)/settings/ai-config/page').then((m) => m.AIConfigSettingsView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    ),
  }
)

const IntegrationsPanel = dynamic(
  () =>
    import('@/app/(dashboard)/settings/integrations/page').then((m) => m.IntegrationsSettingsView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    ),
  }
)

const ApiPanel = dynamic(
  () => import('@/app/(dashboard)/settings/api/page').then((m) => m.ApiSettingsView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    ),
  }
)

type ApiConfigTab = 'ai-config' | 'integrations' | 'api'

function isApiConfigTab(value: string | null): value is ApiConfigTab {
  return value === 'ai-config' || value === 'integrations' || value === 'api'
}

export default function ApiConfigPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSafeSearchParams()

  const initialTab = useMemo<ApiConfigTab>(() => {
    const tab = searchParams.get('tab')
    return isApiConfigTab(tab) ? tab : 'ai-config'
  }, [searchParams])

  const [tab, setTab] = useState<ApiConfigTab>(initialTab)

  useEffect(() => {
    const next = searchParams.get('tab')
    if (isApiConfigTab(next) && next !== tab) setTab(next)
    if (!isApiConfigTab(next) && tab !== 'ai-config') setTab('ai-config')
  }, [searchParams, tab])

  const handleTabChange = (value: string) => {
    const next = isApiConfigTab(value) ? value : 'ai-config'
    setTab(next)

    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API 配置</h1>
          <p className="text-muted-foreground mt-1">
            集中管理 AI 服务、渠道授权与 API 调用
          </p>
        </div>

        <TabsList className="w-fit gap-2 px-2 py-1.5 sm:mt-0">
          <TabsTrigger value="ai-config" className="flex-none px-5 py-2">
            AI 配置
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex-none px-5 py-2">
            渠道授权
          </TabsTrigger>
          <TabsTrigger value="api" className="flex-none px-5 py-2">
            API 调用
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="ai-config" className="mt-0">
        {tab === 'ai-config' ? <AIConfigPanel embedded /> : null}
      </TabsContent>
      <TabsContent value="integrations" className="mt-0">
        {tab === 'integrations' ? <IntegrationsPanel embedded /> : null}
      </TabsContent>
      <TabsContent value="api" className="mt-0">
        {tab === 'api' ? <ApiPanel embedded /> : null}
      </TabsContent>
    </Tabs>
  )
}
