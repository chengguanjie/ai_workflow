'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSafeSearchParams } from '@/hooks/use-safe-search-params'
import { Loader2 } from 'lucide-react'

const OrganizationPanel = dynamic(
  () => import('@/app/(dashboard)/settings/organization/page').then((m) => m.OrganizationSettingsView),
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

const DepartmentsPanel = dynamic(
  () => import('@/app/(dashboard)/settings/departments/page').then((m) => m.DepartmentsSettingsView),
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

const MembersPanel = dynamic(
  () => import('@/app/(dashboard)/settings/members/page').then((m) => m.MembersSettingsView),
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

type OrgSettingsTab = 'organization' | 'departments' | 'members'

function isOrgSettingsTab(value: string | null): value is OrgSettingsTab {
  return value === 'organization' || value === 'departments' || value === 'members'
}

export default function OrgSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSafeSearchParams()
  const { data: session } = useSession()

  const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN'

  const availableTabs = useMemo<OrgSettingsTab[]>(
    () => (isAdmin ? ['organization', 'departments', 'members'] : ['members']),
    [isAdmin]
  )

  const initialTab = useMemo<OrgSettingsTab>(() => {
    const tab = searchParams.get('tab')
    if (isOrgSettingsTab(tab) && availableTabs.includes(tab)) return tab
    return availableTabs[0]
  }, [availableTabs, searchParams])

  const [tab, setTab] = useState<OrgSettingsTab>(initialTab)

  useEffect(() => {
    const next = searchParams.get('tab')
    if (isOrgSettingsTab(next) && availableTabs.includes(next) && next !== tab) {
      setTab(next)
      return
    }
    if (!availableTabs.includes(tab)) setTab(availableTabs[0])
  }, [availableTabs, searchParams, tab])

  const handleTabChange = (value: string) => {
    const next = isOrgSettingsTab(value) && availableTabs.includes(value) ? value : availableTabs[0]
    setTab(next)

    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">组织设置</h1>
          <p className="text-muted-foreground mt-1">
            管理企业信息、部门与成员
          </p>
        </div>

        <TabsList className="w-fit gap-2 px-2 py-1.5 sm:mt-0">
          {availableTabs.includes('organization') && (
            <TabsTrigger value="organization" className="flex-none px-5 py-2">
              企业设置
            </TabsTrigger>
          )}
          {availableTabs.includes('departments') && (
            <TabsTrigger value="departments" className="flex-none px-5 py-2">
              部门管理
            </TabsTrigger>
          )}
          {availableTabs.includes('members') && (
            <TabsTrigger value="members" className="flex-none px-5 py-2">
              成员管理
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      <TabsContent value="organization" className="mt-0">
        {tab === 'organization' ? <OrganizationPanel embedded /> : null}
      </TabsContent>
      <TabsContent value="departments" className="mt-0">
        {tab === 'departments' ? <DepartmentsPanel embedded /> : null}
      </TabsContent>
      <TabsContent value="members" className="mt-0">
        {tab === 'members' ? <MembersPanel embedded /> : null}
      </TabsContent>
    </Tabs>
  )
}
