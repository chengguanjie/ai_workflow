'use client'

/**
 * 工作流执行历史面板 - 侧边栏样式
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  History,
  Zap,
  Timer,
  Coins,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Execution {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  duration: number | null
  totalTokens: number | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

interface ExecutionHistoryPanelProps {
  workflowId: string
  isOpen: boolean
  onClose: () => void
}

export function ExecutionHistoryPanel({
  workflowId,
  isOpen,
  onClose,
}: ExecutionHistoryPanelProps) {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null)

  const fetchExecutions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/executions?workflowId=${workflowId}&limit=20`)
      if (!response.ok) {
        throw new Error('获取执行历史失败')
      }
      const result = await response.json()
      // API 返回格式: { success: true, data: { executions: [...] } }
      const data = result.data || result
      setExecutions(data.executions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取执行历史失败')
    } finally {
      setIsLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    if (isOpen) {
      fetchExecutions()
    }
  }, [isOpen, fetchExecutions])

  // 自动刷新：当面板打开时持续轮询
  // 1. 如果有运行中的执行，每 3 秒刷新一次
  // 2. 如果没有记录，每 2 秒刷新一次（等待新执行记录创建）
  // 3. 如果有已完成的记录且没有运行中的，停止轮询
  useEffect(() => {
    if (!isOpen) return
    
    const hasRunning = executions.some(e => e.status === 'RUNNING' || e.status === 'PENDING')
    
    // 如果有运行中的执行，或者没有任何记录（可能正在创建），则持续轮询
    if (hasRunning || (executions.length === 0 && !error)) {
      const interval = setInterval(fetchExecutions, hasRunning ? 3000 : 2000)
      return () => clearInterval(interval)
    }
    
    return undefined
  }, [isOpen, executions, fetchExecutions, error])

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const getStatusIcon = (status: Execution['status']) => {
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

  const getStatusText = (status: Execution['status']) => {
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

  const getStatusColor = (status: Execution['status']) => {
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

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-[380px] flex-col bg-background shadow-2xl border-l animate-in slide-in-from-right duration-300">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <History className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">执行历史</h2>
            <p className="text-xs text-muted-foreground">
              共 {executions.length} 条记录
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={fetchExecutions}
            disabled={isLoading}
            title="刷新"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && executions.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 p-4 text-center">
            <XCircle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={fetchExecutions}
            >
              重试
            </Button>
          </div>
        ) : executions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              暂无执行记录
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              执行工作流后，记录将显示在这里
            </p>
            <p className="mt-2 text-xs text-muted-foreground/70">
              正在自动刷新...
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {executions.map((execution, index) => (
              <div
                key={execution.id}
                className={cn(
                  "rounded-lg border p-3 transition-all cursor-pointer",
                  getStatusColor(execution.status),
                  selectedExecution === execution.id && "ring-2 ring-primary",
                  execution.status === 'RUNNING' && "animate-pulse"
                )}
                onClick={() => setSelectedExecution(
                  selectedExecution === execution.id ? null : execution.id
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-1">
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
                    <ChevronRight className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      selectedExecution === execution.id && "rotate-90"
                    )} />
                  </div>
                </div>

                {/* 展开的详情 */}
                {selectedExecution === execution.id && (
                  <div className="mt-3 pt-3 border-t space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" />
                        <span>耗时: {formatDuration(execution.duration)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Coins className="h-3.5 w-3.5" />
                        <span>Tokens: {(execution.totalTokens ?? 0).toLocaleString()}</span>
                      </div>
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
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="border-t px-4 py-3 bg-muted/30">
        <Link href={`/executions?workflowId=${workflowId}`} className="block">
          <Button variant="outline" className="w-full" size="sm">
            <History className="mr-2 h-4 w-4" />
            查看全部历史
          </Button>
        </Link>
      </div>
    </div>
  )
}
