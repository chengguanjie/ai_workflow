'use client'

/**
 * 执行详情页面
 */

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileText,
  Download,
  Zap,
  User,
  Calendar,
} from 'lucide-react'
import Link from 'next/link'

interface ExecutionLog {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  status: string
  promptTokens: number | null
  completionTokens: number | null
  startedAt: string
  completedAt: string | null
  duration: number | null
  error: string | null
}

interface OutputFile {
  id: string
  fileName: string
  format: string
  mimeType: string
  size: number
  url: string
  downloadCount: number
  nodeId: string
  createdAt: string
}

interface ExecutionDetail {
  id: string
  status: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  duration: number | null
  totalTokens: number
  promptTokens: number
  completionTokens: number
  error: string | null
  errorDetail: Record<string, unknown> | null
  createdAt: string
  workflow: {
    id: string
    name: string
    description: string | null
  }
  logs: ExecutionLog[]
  outputFiles: OutputFile[]
  user: {
    id: string
    name: string | null
    email: string
  }
}

export default function ExecutionDetailPage() {
  const params = useParams()
  const executionId = params.id as string

  const [execution, setExecution] = useState<ExecutionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'logs' | 'output' | 'files'>('logs')

  useEffect(() => {
    const loadExecution = async () => {
      try {
        const response = await fetch(`/api/executions/${executionId}`)
        if (response.ok) {
          const result = await response.json()
          // API 返回格式: { success: true, data: { execution: { ... } } }
          if (result.success && result.data?.execution) {
            setExecution(result.data.execution)
          }
        }
      } catch (error) {
        console.error('Load execution error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadExecution()
  }, [executionId])

  const formatDuration = (ms: number | null): string => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const formatDate = (date: string | null): string => {
    if (!date) return '-'
    return new Date(date).toLocaleString('zh-CN')
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getStatusIcon = (status: string, size = 'h-5 w-5') => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className={`${size} text-green-500`} />
      case 'FAILED':
        return <XCircle className={`${size} text-red-500`} />
      case 'RUNNING':
        return <Loader2 className={`${size} animate-spin text-blue-500`} />
      default:
        return <Clock className={`${size} text-yellow-500`} />
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!execution) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center text-muted-foreground">执行记录不存在</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      {/* 头部 */}
      <div className="mb-6">
        <Link href="/executions" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回执行历史
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              {getStatusIcon(execution.status, 'h-6 w-6')}
              <h1 className="text-2xl font-bold">
                {execution.status === 'COMPLETED' ? '执行成功' : '执行失败'}
              </h1>
            </div>
            <p className="mt-1 text-muted-foreground">
              工作流: <Link href={`/workflows/${execution.workflow.id}`} className="hover:underline">{execution.workflow.name}</Link>
            </p>
          </div>

          <div className="text-right text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {execution.user.name || execution.user.email}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(execution.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {/* 错误信息 */}
      {execution.error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
          <p className="font-medium">错误信息</p>
          <p className="text-sm">{execution.error}</p>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">执行耗时</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{formatDuration(execution.duration)}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4" />
            <span className="text-sm">总 Tokens</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{execution.totalTokens.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span className="text-sm">执行节点</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{execution.logs.length}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Download className="h-4 w-4" />
            <span className="text-sm">输出文件</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{execution.outputFiles.length}</p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="mb-4 flex border-b">
        {[
          { key: 'logs', label: '执行日志', count: execution.logs.length },
          { key: 'output', label: '输出结果' },
          { key: 'files', label: '输出文件', count: execution.outputFiles.length },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key as 'logs' | 'output' | 'files')}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 执行日志 */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {execution.logs.map((log, index) => (
            <div key={log.id} className="rounded-lg border bg-background">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {index + 1}
                  </span>
                  {getStatusIcon(log.status, 'h-4 w-4')}
                  <span className="font-medium">{log.nodeName}</span>
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                    {log.nodeType}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {log.duration && <span>{formatDuration(log.duration)}</span>}
                  {(log.promptTokens || log.completionTokens) && (
                    <span>
                      {(log.promptTokens || 0) + (log.completionTokens || 0)} tokens
                    </span>
                  )}
                </div>
              </div>

              {log.error && (
                <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-600">
                  {log.error}
                </div>
              )}

              {log.output && (
                <div className="p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">输出</p>
                  <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(log.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 输出结果 */}
      {activeTab === 'output' && (
        <div className="rounded-lg border bg-background p-4">
          {execution.output ? (
            <pre className="overflow-auto text-sm">
              {JSON.stringify(execution.output, null, 2)}
            </pre>
          ) : (
            <p className="text-muted-foreground">无输出结果</p>
          )}
        </div>
      )}

      {/* 输出文件 */}
      {activeTab === 'files' && (
        <div className="space-y-3">
          {execution.outputFiles.length === 0 ? (
            <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground">
              无输出文件
            </div>
          ) : (
            execution.outputFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-lg border bg-background p-4"
              >
                <div className="flex items-center gap-4">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{file.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {file.format.toUpperCase()} · {formatFileSize(file.size)} ·
                      下载 {file.downloadCount} 次
                    </p>
                  </div>
                </div>
                <Button onClick={() => window.open(file.url, '_blank')}>
                  <Download className="mr-2 h-4 w-4" />
                  下载
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
