'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Users,
  Workflow,
  Play,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface StatsData {
  overview: {
    totalOrganizations: number
    totalUsers: number
    activeUsers: number
    totalWorkflows: number
    activeWorkflows: number
  }
  organizations: {
    byPlan: Record<string, number>
    byStatus: Record<string, number>
  }
  executions: {
    byStatus: Record<string, number>
    trend: { date: string; count: number }[]
  }
  recentOrganizations: {
    id: string
    name: string
    plan: string
    status: string
    userCount: number
    createdAt: string
  }[]
}

const planLabels: Record<string, string> = {
  FREE: '免费版',
  STARTER: '入门版',
  PROFESSIONAL: '专业版',
  ENTERPRISE: '企业版',
}

const statusLabels: Record<string, string> = {
  PENDING: '待激活',
  ACTIVE: '正常',
  SUSPENDED: '已暂停',
  DISABLED: '已禁用',
}

export default function ConsoleDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/console/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('获取统计数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">暂无数据</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">数据看板</h1>
        <Button asChild>
          <Link href="/console/organizations/create">
            创建企业
          </Link>
        </Button>
      </div>

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">企业总数</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.overview.totalOrganizations}
            </div>
            <p className="text-xs text-muted-foreground">
              活跃 {stats.organizations.byStatus?.ACTIVE || 0} 家
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">用户总数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.overview.totalUsers}
            </div>
            <p className="text-xs text-muted-foreground">
              30天活跃 {stats.overview.activeUsers} 人
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">工作流</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.overview.totalWorkflows}
            </div>
            <p className="text-xs text-muted-foreground">
              已启用 {stats.overview.activeWorkflows} 个
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">执行次数</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(stats.executions.byStatus || {}).reduce(
                (a, b) => a + b,
                0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              成功 {stats.executions.byStatus?.COMPLETED || 0} 次
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 详细统计 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 套餐分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              套餐分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.organizations.byPlan || {}).map(
                ([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className="text-sm">{planLabels[plan] || plan}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* 状态分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              企业状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.organizations.byStatus || {}).map(
                ([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">
                      {statusLabels[status] || status}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 最近创建的企业 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>最近创建的企业</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/console/organizations">
              查看全部
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recentOrganizations.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <Link
                    href={`/console/organizations/${org.id}`}
                    className="font-medium hover:underline"
                  >
                    {org.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {planLabels[org.plan]} · {org.userCount} 人
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                      org.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {statusLabels[org.status]}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
