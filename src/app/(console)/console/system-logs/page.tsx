'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Terminal,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  XCircle,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface SystemLog {
  id: string
  level: string
  category: string
  message: string
  detail: Record<string, unknown> | null
  source: string | null
  traceId: string | null
  createdAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface Stats {
  byLevel: Record<string, number>
}

const levelIcons: Record<string, React.ElementType> = {
  DEBUG: Bug,
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: AlertCircle,
  FATAL: XCircle,
}

const levelColors: Record<string, string> = {
  DEBUG: 'text-gray-500 bg-gray-100',
  INFO: 'text-blue-500 bg-blue-100',
  WARN: 'text-yellow-600 bg-yellow-100',
  ERROR: 'text-red-500 bg-red-100',
  FATAL: 'text-red-700 bg-red-200',
}

const levelLabels: Record<string, string> = {
  DEBUG: '调试',
  INFO: '信息',
  WARN: '警告',
  ERROR: '错误',
  FATAL: '致命',
}

const categoryLabels: Record<string, string> = {
  scheduler: '调度器',
  queue: '队列',
  workflow: '工作流',
  system: '系统',
  error: '错误',
  auth: '认证',
  api: 'API',
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })
  const [categories, setCategories] = useState<string[]>([])
  const [stats, setStats] = useState<Stats>({ byLevel: {} })
  const [loading, setLoading] = useState(true)
  const [showCleanDialog, setShowCleanDialog] = useState(false)

  // 筛选条件
  const [selectedLevel, setSelectedLevel] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', pagination.page.toString())
      params.set('pageSize', pagination.pageSize.toString())

      if (selectedLevel) params.set('level', selectedLevel)
      if (selectedCategory) params.set('category', selectedCategory)
      if (search) params.set('search', search)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/console/system-logs?${params}`)
      if (res.ok) {
        const result = await res.json()
        // ApiResponse.success() 返回 { success, data: { logs, pagination, filters, stats } }
        setLogs(result.data.logs)
        setPagination(result.data.pagination)
        setCategories(result.data.filters.categories)
        setStats(result.data.stats)
      }
    } catch (error) {
      console.error('获取系统日志失败:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.pageSize, selectedLevel, selectedCategory, search, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, page: 1 }))
    fetchLogs()
  }

  const handleCleanLogs = async (days: number) => {
    try {
      const res = await fetch(`/api/console/system-logs?days=${days}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`已清理 ${data.deletedCount} 条日志`)
        setShowCleanDialog(false)
        fetchLogs()
      } else {
        const data = await res.json()
        toast.error(data.error || '清理失败')
      }
    } catch {
      toast.error('清理失败')
    }
  }

  const clearFilters = () => {
    setSelectedLevel('')
    setSelectedCategory('')
    setSearch('')
    setStartDate('')
    setEndDate('')
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const formatDetail = (detail: Record<string, unknown> | null) => {
    if (!detail) return null
    return JSON.stringify(detail, null, 2)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">系统日志</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchLogs()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setShowCleanDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清理日志
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-5">
        {['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].map((level) => {
          const Icon = levelIcons[level]
          const count = stats.byLevel[level] || 0
          return (
            <Card
              key={level}
              className={`cursor-pointer transition-colors hover:border-primary ${selectedLevel === level ? 'border-primary' : ''
                }`}
              onClick={() => {
                setSelectedLevel(selectedLevel === level ? '' : level)
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <div className={`rounded-full p-2 ${levelColors[level]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-medium">{levelLabels[level]}</span>
                </div>
                <span className="text-2xl font-bold">{count}</span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 筛选条件 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="搜索日志内容..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button variant="outline" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={selectedCategory}
              onValueChange={(v) => {
                setSelectedCategory(v)
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部分类</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {categoryLabels[cat] || cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
              className="w-[140px]"
            />
            <span className="flex items-center text-muted-foreground">至</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
              className="w-[140px]"
            />

            {(selectedLevel ||
              selectedCategory ||
              search ||
              startDate ||
              endDate) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  清除筛选
                </Button>
              )}
          </div>
        </CardContent>
      </Card>

      {/* 日志列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            日志记录
            <span className="text-sm font-normal text-muted-foreground">
              (共 {pagination.total} 条)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">加载中...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">暂无系统日志</div>
            </div>
          ) : (
            <div className="space-y-2 font-mono text-sm">
              {logs.map((log) => {
                const Icon = levelIcons[log.level] || Info
                return (
                  <div
                    key={log.id}
                    className="rounded border p-3 hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 rounded p-1 ${levelColors[log.level]}`}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {categoryLabels[log.category] || log.category}
                          </span>
                          {log.source && (
                            <span className="text-xs text-muted-foreground">
                              [{log.source}]
                            </span>
                          )}
                          {log.traceId && (
                            <span className="text-xs text-muted-foreground">
                              trace:{log.traceId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap break-words">
                          {log.message}
                        </p>
                        {log.detail && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground">
                              详情
                            </summary>
                            <pre className="mt-1 overflow-auto rounded bg-muted p-2">
                              {formatDetail(log.detail)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                第 {pagination.page} / {pagination.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === 1}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === pagination.totalPages}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 清理日志确认对话框 */}
      <AlertDialog open={showCleanDialog} onOpenChange={setShowCleanDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清理系统日志</AlertDialogTitle>
            <AlertDialogDescription>
              选择要清理的日志时间范围，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-3 gap-2 py-4">
            <Button variant="outline" onClick={() => handleCleanLogs(7)}>
              7天前
            </Button>
            <Button variant="outline" onClick={() => handleCleanLogs(30)}>
              30天前
            </Button>
            <Button variant="outline" onClick={() => handleCleanLogs(90)}>
              90天前
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
