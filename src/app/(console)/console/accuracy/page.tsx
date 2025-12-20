'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  CheckCircle2,
  Star,
  Activity,
  GitBranch,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface OrganizationStats {
  organization: {
    id: string
    name: string
    plan: string
    status: string
    createdAt: string
  }
  stats: {
    workflowCount: number
    totalExecutions: number
    successExecutions: number
    failedExecutions: number
    successRate: number | null
    totalFeedbacks: number
    accurateFeedbacks: number
    inaccurateFeedbacks: number
    accuracyRate: number | null
    avgRating: number | null
  }
}

interface PlatformStats {
  totalExecutions: number
  successExecutions: number
  failedExecutions: number
  successRate: number | null
  totalFeedbacks: number
  accurateFeedbacks: number
  accuracyRate: number | null
  avgRating: number | null
  activeOrganizations: number
  activeWorkflows: number
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const planLabels: Record<string, { label: string; color: string }> = {
  FREE: { label: '免费版', color: 'bg-gray-100 text-gray-600' },
  STARTER: { label: '入门版', color: 'bg-blue-100 text-blue-600' },
  PROFESSIONAL: { label: '专业版', color: 'bg-purple-100 text-purple-600' },
  ENTERPRISE: { label: '企业版', color: 'bg-orange-100 text-orange-600' },
}

const statusLabels: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待激活', color: 'bg-yellow-100 text-yellow-600' },
  ACTIVE: { label: '正常', color: 'bg-green-100 text-green-600' },
  SUSPENDED: { label: '已暂停', color: 'bg-orange-100 text-orange-600' },
  DISABLED: { label: '已禁用', color: 'bg-red-100 text-red-600' },
}

export default function ConsoleAccuracyPage() {
  const [orgStats, setOrgStats] = useState<OrganizationStats[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState('30')

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
        dateRange,
      })

      if (searchQuery) {
        params.set('search', searchQuery)
      }

      const response = await fetch(`/api/console/accuracy?${params}`)
      const data = await response.json()

      if (response.ok) {
        setOrgStats(data.organizations)
        setPlatformStats(data.platformStats)
        setPagination(data.pagination)
      } else {
        toast.error(data.error || '获取统计数据失败')
      }
    } catch {
      toast.error('获取统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.pageSize, dateRange, searchQuery])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const renderAccuracyIndicator = (rate: number | null) => {
    if (rate === null) {
      return <span className="text-muted-foreground">-</span>
    }

    let color = 'text-gray-500'
    let Icon = Minus

    if (rate >= 80) {
      color = 'text-green-500'
      Icon = TrendingUp
    } else if (rate >= 60) {
      color = 'text-yellow-500'
      Icon = Minus
    } else {
      color = 'text-red-500'
      Icon = TrendingDown
    }

    return (
      <div className={`flex items-center gap-1 ${color}`}>
        <Icon className="h-4 w-4" />
        <span className="font-medium">{rate}%</span>
      </div>
    )
  }

  const renderRating = (rating: number | null) => {
    if (rating === null) {
      return <span className="text-muted-foreground">-</span>
    }

    return (
      <div className="flex items-center gap-1">
        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
        <span className="font-medium">{rating.toFixed(1)}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">执行准确率</h1>
        <p className="text-muted-foreground">
          查看各企业工作流执行准确率和反馈统计，便于主动优化改进
        </p>
      </div>

      {/* 平台整体统计 */}
      {platformStats && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                总执行数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{platformStats.totalExecutions.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">
                成功: {platformStats.successExecutions.toLocaleString()} / 失败: {platformStats.failedExecutions.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                执行成功率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {platformStats.successRate !== null ? `${platformStats.successRate}%` : '-'}
              </div>
              <Progress
                value={platformStats.successRate || 0}
                className="h-2 mt-2"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                准确率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {platformStats.accuracyRate !== null ? `${platformStats.accuracyRate}%` : '-'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                基于 {platformStats.totalFeedbacks} 条反馈
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Star className="h-4 w-4" />
                平均评分
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {platformStats.avgRating !== null ? platformStats.avgRating.toFixed(1) : '-'}
                </span>
                {platformStats.avgRating !== null && (
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                活跃情况
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{platformStats.activeOrganizations}</div>
              <div className="text-xs text-muted-foreground mt-1">
                活跃企业 / {platformStats.activeWorkflows} 活跃工作流
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 筛选器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索企业名称..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">最近 7 天</SelectItem>
                <SelectItem value="30">最近 30 天</SelectItem>
                <SelectItem value="90">最近 90 天</SelectItem>
                <SelectItem value="180">最近 180 天</SelectItem>
                <SelectItem value="365">最近 1 年</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 企业统计列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            企业执行统计
          </CardTitle>
          <CardDescription>
            各企业工作流执行情况和准确率统计（过去 {dateRange} 天）
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : orgStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无数据</h3>
              <p className="text-muted-foreground">没有找到符合条件的企业</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>企业</TableHead>
                  <TableHead>套餐</TableHead>
                  <TableHead className="text-center">工作流数</TableHead>
                  <TableHead className="text-center">执行数</TableHead>
                  <TableHead className="text-center">成功率</TableHead>
                  <TableHead className="text-center">反馈数</TableHead>
                  <TableHead className="text-center">准确率</TableHead>
                  <TableHead className="text-center">平均评分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgStats.map(({ organization, stats }) => (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{organization.name}</p>
                        <Badge className={statusLabels[organization.status]?.color || 'bg-gray-100'}>
                          {statusLabels[organization.status]?.label || organization.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={planLabels[organization.plan]?.color || 'bg-gray-100'}>
                        {planLabels[organization.plan]?.label || organization.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium">{stats.workflowCount}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div>
                        <span className="font-medium">{stats.totalExecutions}</span>
                        {stats.totalExecutions > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="text-green-600">{stats.successExecutions}</span>
                            {' / '}
                            <span className="text-red-600">{stats.failedExecutions}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {renderAccuracyIndicator(stats.successRate)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div>
                        <span className="font-medium">{stats.totalFeedbacks}</span>
                        {stats.totalFeedbacks > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="text-green-600">{stats.accurateFeedbacks}</span>
                            {' / '}
                            <span className="text-red-600">{stats.inaccurateFeedbacks}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {renderAccuracyIndicator(stats.accuracyRate)}
                    </TableCell>
                    <TableCell className="text-center">
                      {renderRating(stats.avgRating)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="text-sm text-muted-foreground">
              共 {pagination.total} 个企业
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              >
                <ChevronLeft className="h-4 w-4" />
                上一页
              </Button>
              <span className="text-sm">
                第 {pagination.page} / {pagination.totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              >
                下一页
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
