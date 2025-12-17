'use client'

/**
 * 工作流执行历史面板
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
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Link from 'next/link'

interface Execution {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  duration: number | null
  totalTokens: number
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

  const fetchExecutions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/executions?workflowId=${workflowId}&limit=20`)
      if (!response.ok) {
        throw new Error('获取执行历史失败')
      }
      const data = await response.json()
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
        return <Clock className="h-4 w-4 text-yellow-500" />
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">执行历史</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchExecutions}
              disabled={isLoading}
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && executions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-center text-red-600">
              {error}
            </div>
          ) : executions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              暂无执行记录
            </div>
          ) : (
            <div className="space-y-3">
              {executions.map((execution) => (
                <div
                  key={execution.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(execution.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getStatusText(execution.status)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(execution.createdAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>耗时: {formatDuration(execution.duration)}</span>
                        <span>Tokens: {execution.totalTokens}</span>
                      </div>
                      {execution.error && (
                        <div className="mt-1 text-xs text-red-500 line-clamp-1">
                          {execution.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <Link href={`/executions/${execution.id}`}>
                    <Button variant="ghost" size="sm" title="查看详情">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-between border-t px-6 py-4">
          <Link href={`/executions?workflowId=${workflowId}`}>
            <Button variant="outline" size="sm">
              查看全部历史
            </Button>
          </Link>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  )
}
