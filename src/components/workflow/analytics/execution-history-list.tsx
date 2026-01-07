'use client'

/**
 * 执行历史列表组件 - 用于统计分析页面的执行历史 Tab
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Zap,
  Timer,
  Coins,
  AlertCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface Execution {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  duration: number | null
  totalTokens: number | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface ExecutionHistoryListProps {
  workflowId: string
  period: string // 时间周期，与页面选择器联动
}

export type StatusFilter = 'all' | 'COMPLETED' | 'FAILED' | 'RUNNING' | 'PENDING'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'COMPLETED', label: '成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'RUNNING', label: '运行中' },
  { value: 'PENDING', label: '等待中' },
]

// 根据 period 计算开始日期
export function getStartDateFromPeriod(period: string): string | undefined {
  const now = new Date()
  switch (period) {
    case 'day':
      now.setDate(now.getDate() - 1)
      break
    case 'week':
      now.setDate(now.getDate() - 7)
      break
    case 'month':
      now.setDate(now.getDate() - 30)
      break
    default:
      return undefined
  }
  return now.toISOString()
}

// 根据时间范围筛选执行记录
export function filterExecutionsByTimeRange(
  executions: Execution[],
  startDate: string | undefined
): Execution[] {
  if (!startDate) {
    return executions
  }
  const startTime = new Date(startDate).getTime()
  return executions.filter((e) => new Date(e.createdAt).getTime() >= startTime)
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function getStatusIcon(status: Execution['status']) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'FAILED':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'RUNNING':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    case 'PENDING':
      return <Clock className="h-4 w-4 text-amber-500" />
    default:
      return null
  }
}

export function getStatusText(status: Execution['status']): string {
  switch (status) {
    case 'COMPLETED':
      return '成功'
    case 'FAILED':
      return '失败'
    case 'RUNNING':
      return '执行中'
    case 'PENDING':
      return '等待中'
    default:
      return status
  }
}

export function getStatusColor(status: Execution['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-50 border-green-200 hover:bg-green-100'
    case 'FAILED':
      return 'bg-red-50 border-red-200 hover:bg-red-100'
    case 'RUNNING':
      return 'bg-blue-50 border-blue-200 hover:bg-blue-100'
    case 'PENDING':
      return 'bg-amber-50 border-amber-200 hover:bg-amber-100'
    default:
      return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
  }
}

// 筛选执行记录
export function filterExecutionsByStatus(
  executions: Execution[],
  statusFilter: StatusFilter
): Execution[] {
  if (statusFilter === 'all') {
    return executions
  }
  return executions.filter((e) => e.status === statusFilter)
}

export function ExecutionHistoryList({
  workflowId,
  period,
}: ExecutionHistoryListProps) {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20


  const fetchExecutions = useCallback(
    async (pageNum: number = 0, append: boolean = false) => {
      if (!append) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const params = new URLSearchParams({
          workflowId,
          limit: String(PAGE_SIZE),
          offset: String(pageNum * PAGE_SIZE),
        })

        // 添加状态筛选
        if (statusFilter !== 'all') {
          params.set('status', statusFilter)
        }

        // 添加时间范围筛选
        const startDate = getStartDateFromPeriod(period)
        if (startDate) {
          params.set('startDate', startDate)
        }

        const response = await fetch(`/api/executions?${params.toString()}`)
        if (!response.ok) {
          throw new Error('获取执行历史失败')
        }

        const result = await response.json()
        const data = result.data || result
        const newExecutions = data.executions || []
        const totalCount = data.total || 0

        if (append) {
          setExecutions((prev) => [...prev, ...newExecutions])
        } else {
          setExecutions(newExecutions)
        }

        setTotal(totalCount)
        setHasMore((pageNum + 1) * PAGE_SIZE < totalCount)
        setPage(pageNum)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取执行历史失败')
      } finally {
        setIsLoading(false)
      }
    },
    [workflowId, statusFilter, period]
  )

  // 初始加载和筛选条件变化时重新加载
  useEffect(() => {
    setPage(0)
    setSelectedExecutionId(null)
    fetchExecutions(0, false)
  }, [fetchExecutions])

  // 自动刷新：当有运行中的执行时
  useEffect(() => {
    const hasRunning = executions.some(
      (e) => e.status === 'RUNNING' || e.status === 'PENDING'
    )

    if (hasRunning) {
      const interval = setInterval(() => {
        fetchExecutions(0, false)
      }, 3000)
      return () => clearInterval(interval)
    }

    return undefined
  }, [executions, fetchExecutions])

  const handleLoadMore = () => {
    fetchExecutions(page + 1, true)
  }

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value)
  }

  const toggleExecutionDetails = (executionId: string) => {
    setSelectedExecutionId(
      selectedExecutionId === executionId ? null : executionId
    )
  }

  return (
    <div className="space-y-4">
      {/* 头部：状态筛选和刷新 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={statusFilter}
            onValueChange={(value) => handleStatusFilterChange(value as StatusFilter)}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="筛选状态" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs">
            共 {total} 条记录
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchExecutions(0, false)}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          刷新
        </Button>
      </div>

      {/* 内容区域 */}
      {isLoading && executions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fetchExecutions(0, false)}
          >
            重试
          </Button>
        </div>
      ) : executions.length === 0 ? (
        <div className="py-12 text-center rounded-lg border bg-muted/30">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            暂无执行记录
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            执行工作流后，记录将显示在这里
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {executions.map((execution, index) => (
            <div
              key={execution.id}
              className={cn(
                'rounded-lg border p-4 transition-all cursor-pointer',
                getStatusColor(execution.status),
                selectedExecutionId === execution.id && 'ring-2 ring-primary',
                execution.status === 'RUNNING' && 'animate-pulse'
              )}
              onClick={() => toggleExecutionDetails(execution.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(execution.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {getStatusText(execution.status)}
                      </span>
                      {index === 0 && execution.status === 'RUNNING' && (
                        <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">
                          当前
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(execution.createdAt), {
                        addSuffix: true,
                        locale: zhCN,
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mr-2">
                    <div className="flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5" />
                      <span>{formatDuration(execution.duration)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5" />
                      <span>{(execution.totalTokens ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <Link href={`/executions/${execution.id}`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="查看详情"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      selectedExecutionId === execution.id && 'rotate-90'
                    )}
                  />
                </div>
              </div>

              {/* 展开的详情 */}
              {selectedExecutionId === execution.id && (
                <div className="mt-3 pt-3 border-t space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">执行 ID:</span>
                      <span className="ml-2 font-mono">{execution.id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">创建时间:</span>
                      <span className="ml-2">
                        {new Date(execution.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {execution.completedAt && (
                      <div>
                        <span className="text-muted-foreground">完成时间:</span>
                        <span className="ml-2">
                          {new Date(execution.completedAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    )}
                  </div>
                  {execution.error && (
                    <div className="rounded bg-red-100 p-2 text-xs text-red-700">
                      <p className="font-medium">错误信息:</p>
                      <p className="mt-1 line-clamp-3">{execution.error}</p>
                    </div>
                  )}
                  <Link href={`/executions/${execution.id}`} className="block">
                    <Button variant="outline" size="sm" className="w-full mt-2">
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      查看完整详情
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ))}

          {/* 加载更多 */}
          {hasMore && (
            <div className="pt-4 text-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    加载中...
                  </>
                ) : (
                  '加载更多'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ExecutionHistoryList
