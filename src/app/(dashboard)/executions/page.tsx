'use client'

/**
 * 执行历史页面
 */

import { useState, useEffect, useCallback } from 'react'
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
  History,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react'
import Link from 'next/link'

interface Execution {
  id: string
  status: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  duration: number | null
  totalTokens: number
  error: string | null
  createdAt: string
  workflowId: string
  workflowName: string
  outputFileCount: number
}

interface Workflow {
  id: string
  name: string
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 筛选状态
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // 加载工作流列表
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const response = await fetch('/api/workflows')
        if (response.ok) {
          const data = await response.json()
          // API 直接返回数组
          setWorkflows(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error('Load workflows error:', error)
      }
    }
    loadWorkflows()
  }, [])

  const loadExecutions = useCallback(async () => {
    setIsLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      })
      if (selectedWorkflowId) {
        params.append('workflowId', selectedWorkflowId)
      }
      if (startDate) {
        params.append('startDate', startDate)
      }
      if (endDate) {
        params.append('endDate', endDate)
      }
      const response = await fetch(`/api/executions?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setExecutions(data.executions)
        setTotal(data.total)
      }
    } catch (error) {
      console.error('Load executions error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [page, selectedWorkflowId, startDate, endDate])

  useEffect(() => {
    loadExecutions()
  }, [loadExecutions])

  // 重置筛选
  const resetFilters = () => {
    setSelectedWorkflowId('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  // 检查是否有筛选条件
  const hasFilters = selectedWorkflowId || startDate || endDate

  const formatDuration = (ms: number | null): string => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const formatDate = (date: string | null): string => {
    if (!date) return '-'
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'PENDING':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return '成功'
      case 'FAILED':
        return '失败'
      case 'RUNNING':
        return '运行中'
      case 'PENDING':
        return '等待中'
      case 'CANCELLED':
        return '已取消'
      default:
        return status
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="container mx-auto py-6">
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">执行历史</h1>
          <span className="text-sm text-muted-foreground">共 {total} 条记录</span>
        </div>
        <Button variant="outline" size="sm" onClick={loadExecutions} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">筛选:</span>
        </div>

        {/* 工作流筛选 */}
        <Select
          value={selectedWorkflowId}
          onValueChange={(value) => {
            setSelectedWorkflowId(value === 'all' ? '' : value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[200px]" size="sm">
            <SelectValue placeholder="选择工作流" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工作流</SelectItem>
            {workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 开始日期 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">从</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
            className="h-8 w-[140px]"
          />
        </div>

        {/* 结束日期 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">至</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
            className="h-8 w-[140px]"
          />
        </div>

        {/* 重置筛选 */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="mr-1 h-4 w-4" />
            重置
          </Button>
        )}
      </div>

      {/* 表格 */}
      <div className="rounded-lg border bg-background">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium">工作流</th>
              <th className="px-4 py-3 text-left text-sm font-medium">执行时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium">耗时</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Tokens</th>
              <th className="px-4 py-3 text-left text-sm font-medium">文件</th>
              <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            ) : executions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  暂无执行记录
                </td>
              </tr>
            ) : (
              executions.map((execution) => (
                <tr key={execution.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(execution.status)}
                      <span className="text-sm">{getStatusText(execution.status)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/workflows/${execution.workflowId}`}
                      className="text-sm font-medium hover:text-primary hover:underline"
                    >
                      {execution.workflowName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(execution.startedAt || execution.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatDuration(execution.duration)}</td>
                  <td className="px-4 py-3 text-sm">{execution.totalTokens.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {execution.outputFileCount > 0 && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        <span>{execution.outputFileCount}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/executions/${execution.id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="mr-1 h-4 w-4" />
                        详情
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            显示 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
