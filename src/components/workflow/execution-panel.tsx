'use client'

/**
 * 工作流执行面板
 * 用于执行工作流并展示结果
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Play,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Clock,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkflowStore } from '@/stores/workflow-store'

interface ExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'RUNNING'
  output?: Record<string, unknown>
  error?: string
  duration?: number
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
  outputFiles?: Array<{
    id: string
    fileName: string
    format: string
    url: string
    size: number
  }>
}

interface ExecutionPanelProps {
  workflowId: string
  isOpen: boolean
  onClose: () => void
}

export function ExecutionPanel({ workflowId, isOpen, onClose }: ExecutionPanelProps) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(true)
  const [showOutput, setShowOutput] = useState(true)
  const [asyncMode, setAsyncMode] = useState(true)
  const [taskId, setTaskId] = useState<string | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const { nodes } = useWorkflowStore()

  // 获取输入节点的字段
  const inputFields: Array<{
    nodeId: string
    nodeName: string
    fieldId: string
    fieldName: string
    defaultValue: string
  }> = nodes
    .filter((node) => node.data?.type === 'INPUT')
    .flatMap((node) => {
      const fields = (node.data?.config as { fields?: Array<{ id: string; name: string; value: string }> })?.fields || []
      return fields.map((field) => ({
        nodeId: node.id,
        nodeName: String(node.data?.name || '输入'),
        fieldId: field.id,
        fieldName: field.name,
        defaultValue: field.value || '',
      }))
    })

  // 初始化输入值
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {}
      inputFields.forEach((field) => {
        initial[field.fieldName] = field.defaultValue
      })
      setInputValues(initial)
      setResult(null)
      setTaskId(null)
      setExecutionError(null)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  // 轮询任务状态
  const pollTaskStatus = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}`)

      if (response.status === 404) {
        // 任务不存在或已过期，停止轮询
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        const errorMsg = '任务不存在或已过期，请重新执行'
        setResult({
          status: 'FAILED',
          error: errorMsg,
        })
        setExecutionError(errorMsg)
        setIsExecuting(false)
        toast.error('任务不存在或已过期')
        return
      }

      if (!response.ok) {
        throw new Error('获取任务状态失败')
      }

      const data = await response.json()

      if (data.status === 'completed' || data.status === 'failed') {
        // 任务完成，停止轮询
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }

        // 从 execution 对象获取错误信息（API 返回 execution 而非 result）
        const executionData = data.execution || data.result
        // 优先级：execution.error > data.error > 默认错误信息
        const errorMsg = executionData?.error || data.error || (data.status === 'failed' ? '执行失败，请查看执行历史获取详细信息' : undefined)

        // 使用执行结果的状态，而不是任务状态（因为 BullMQ 的 completed 可能包含 FAILED）
        const executionStatus = executionData?.status || (data.status === 'completed' ? 'COMPLETED' : 'FAILED')
        const isFailed = executionStatus === 'FAILED' || data.status === 'failed'

        setResult({
          status: isFailed ? 'FAILED' : 'COMPLETED',
          output: executionData?.output,
          error: errorMsg,
          duration: executionData?.duration,
          totalTokens: executionData?.totalTokens,
          promptTokens: executionData?.promptTokens,
          completionTokens: executionData?.completionTokens,
          outputFiles: executionData?.outputFiles,
        })

        if (isFailed && errorMsg) {
          setExecutionError(errorMsg)
        }
        setIsExecuting(false)

        if (!isFailed) {
          toast.success('工作流执行完成')
        } else {
          toast.error(errorMsg || '工作流执行失败')
        }
      }
    } catch (error) {
      console.error('Poll task status error:', error)
    }
  }, [])

  // 执行工作流
  const handleExecute = useCallback(async () => {
    setIsExecuting(true)
    setResult(null)
    setTaskId(null)
    setExecutionError(null)

    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputValues,
          async: asyncMode,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.error || data.message || '执行失败'
        setExecutionError(errorMsg)
        setIsExecuting(false)
        toast.error(errorMsg)
        return
      }

      if (asyncMode && data.taskId) {
        // 异步模式：开始轮询
        setTaskId(data.taskId)
        toast.info('任务已提交，正在执行中...')

        // 每 2 秒轮询一次
        pollingRef.current = setInterval(() => {
          pollTaskStatus(data.taskId)
        }, 2000)
      } else {
        // 同步模式：直接返回结果
        setResult(data)
        setIsExecuting(false)

        if (data.status === 'COMPLETED') {
          toast.success('工作流执行完成')
        } else {
          const errorMsg = data.error || '工作流执行失败'
          setExecutionError(errorMsg)
          toast.error(errorMsg)
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '执行失败'
      setExecutionError(errorMsg)
      setIsExecuting(false)
      toast.error(errorMsg)
    }
  }, [workflowId, inputValues, asyncMode, pollTaskStatus])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 格式化时间
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">执行工作流</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 输入参数 */}
          {inputFields.length > 0 && (
            <div className="mb-6">
              <button
                className="flex w-full items-center justify-between text-sm font-medium"
                onClick={() => setShowInputs(!showInputs)}
              >
                <span>输入参数</span>
                {showInputs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showInputs && (
                <div className="mt-3 space-y-3">
                  {inputFields.map((field) => (
                    <div key={`${field.nodeId}-${field.fieldId}`} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {field.nodeName} / {field.fieldName}
                      </Label>
                      <Input
                        value={inputValues[field.fieldName] || ''}
                        onChange={(e) =>
                          setInputValues((prev) => ({
                            ...prev,
                            [field.fieldName]: e.target.value,
                          }))
                        }
                        placeholder={`输入 ${field.fieldName}`}
                        disabled={isExecuting}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 执行选项 */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={asyncMode}
                onChange={(e) => setAsyncMode(e.target.checked)}
                disabled={isExecuting}
                className="rounded border-gray-300"
              />
              <span>异步执行（后台运行，适合长时间任务）</span>
            </label>
          </div>

          {/* 执行状态 */}
          {isExecuting && (
            <div className="mb-6 flex items-center gap-3 rounded-lg bg-blue-50 p-4 text-blue-700">
              <Loader2 className="h-5 w-5 animate-spin" />
              <div>
                <p className="font-medium">正在执行中...</p>
                {taskId && <p className="text-sm opacity-75">任务 ID: {taskId}</p>}
              </div>
            </div>
          )}

          {/* 执行错误（未获得结果时显示） */}
          {executionError && !result && !isExecuting && (
            <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-700">
              <XCircle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">执行失败</p>
                <p className="text-sm opacity-90 break-words">{executionError}</p>
              </div>
            </div>
          )}

          {/* 执行结果 */}
          {result && (
            <div className="space-y-4">
              {/* 状态 */}
              <div
                className={`flex items-center gap-3 rounded-lg p-4 ${
                  result.status === 'COMPLETED'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {result.status === 'COMPLETED' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {result.status === 'COMPLETED' ? '执行成功' : '执行失败'}
                  </p>
                  {result.status !== 'COMPLETED' && (
                    <p className="text-sm opacity-75">
                      {result.error || '未知错误，请查看执行历史获取详细信息'}
                    </p>
                  )}
                </div>
              </div>

              {/* 统计信息 */}
              {result.status === 'COMPLETED' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-lg font-semibold">{formatDuration(result.duration || 0)}</p>
                    <p className="text-xs text-muted-foreground">执行时间</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <Zap className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-lg font-semibold">{result.totalTokens || 0}</p>
                    <p className="text-xs text-muted-foreground">总 Tokens</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <FileText className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-lg font-semibold">{result.outputFiles?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">输出文件</p>
                  </div>
                </div>
              )}

              {/* 输出内容 */}
              {result.output && (
                <div>
                  <button
                    className="flex w-full items-center justify-between text-sm font-medium"
                    onClick={() => setShowOutput(!showOutput)}
                  >
                    <span>输出内容</span>
                    {showOutput ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showOutput && (
                    <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-muted p-4 text-sm">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* 输出文件 */}
              {result.outputFiles && result.outputFiles.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">输出文件</h4>
                  <div className="space-y-2">
                    {result.outputFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.format.toUpperCase()} · {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // 处理绝对和相对 URL，提取路径部分
                            let downloadUrl = file.url
                            try {
                              const url = new URL(file.url, window.location.origin)
                              downloadUrl = url.pathname + url.search
                            } catch {
                              // 已经是相对路径
                            }
                            window.open(downloadUrl, '_blank')
                          }}
                        >
                          <Download className="mr-1 h-4 w-4" />
                          下载
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isExecuting}>
            {result ? '关闭' : '取消'}
          </Button>
          <Button onClick={handleExecute} disabled={isExecuting}>
            {isExecuting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {result ? '重新执行' : '执行'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
