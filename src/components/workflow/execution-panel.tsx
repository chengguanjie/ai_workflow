'use client'

/**
 * 工作流执行面板
 * 用于执行工作流并展示结果
 * 支持两种模式：普通执行 / 实时监控
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
  MessageSquare,
  Eye,
  Radio,
  StopCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkflowStore } from '@/stores/workflow-store'
import { ExecutionFeedbackDialog } from './execution-feedback-dialog'
import { useExecutionStream, type ExecutionProgressEvent } from '@/hooks/use-execution-stream'
import { cn } from '@/lib/utils'

// 执行模式类型
type ExecutionMode = 'quick' | 'monitor'

// 节点执行状态
type NodeExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

// 单个节点的执行信息
interface NodeExecutionInfo {
  nodeId: string
  nodeName: string
  nodeType: string
  status: NodeExecutionStatus
  startedAt?: string
  completedAt?: string
  duration?: number
  output?: Record<string, unknown>
  error?: string
  promptTokens?: number
  completionTokens?: number
}

interface ExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'RUNNING'
  output?: Record<string, unknown>
  error?: string
  duration?: number
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
  executionId?: string
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
  initialMode?: ExecutionMode
  onNodeStatusChange?: (nodeId: string, status: NodeExecutionStatus) => void
}

export function ExecutionPanel({
  workflowId,
  isOpen,
  onClose,
  initialMode = 'quick',
  onNodeStatusChange,
}: ExecutionPanelProps) {
  // 执行模式
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(initialMode)

  // 通用状态
  const [isExecuting, setIsExecuting] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(true)
  const [showOutput, setShowOutput] = useState(true)
  const [asyncMode, setAsyncMode] = useState(true)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // 实时监控模式状态
  const [monitorStatus, setMonitorStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [nodeStates, setNodeStates] = useState<Map<string, NodeExecutionInfo>>(new Map())
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [showNodeDetails, setShowNodeDetails] = useState<string | null>(null)
  const [sseConnected, setSseConnected] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const executionIdRef = useRef<string | null>(null)
  const pollTaskStatusMonitorRef = useRef<() => Promise<void>>(() => Promise.resolve())

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
      setExecutionMode(initialMode)

      // 监控模式：初始化节点状态
      const nodeMap = new Map<string, NodeExecutionInfo>()
      nodes.forEach((node) => {
        nodeMap.set(node.id, {
          nodeId: node.id,
          nodeName: String(node.data?.name || node.id),
          nodeType: String(node.data?.type || 'UNKNOWN'),
          status: 'pending',
        })
      })
      setNodeStates(nodeMap)
      setMonitorStatus('idle')
      setCurrentNodeId(null)
    }
  }, [isOpen, initialMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // 更新节点状态（监控模式）
  const updateNodeStatus = useCallback(
    (nodeId: string, update: Partial<NodeExecutionInfo>) => {
      setNodeStates((prev) => {
        const newMap = new Map(prev)
        const existing = newMap.get(nodeId)
        if (existing) {
          newMap.set(nodeId, { ...existing, ...update })
        }
        return newMap
      })
      if (update.status && onNodeStatusChange) {
        onNodeStatusChange(nodeId, update.status)
      }
    },
    [onNodeStatusChange]
  )

  // 处理 SSE 事件
  const handleSSEEvent = useCallback(
    (event: ExecutionProgressEvent) => {
      if (event.nodeId) {
        setCurrentNodeId(event.nodeId)
        if (event.type === 'node_start') {
          updateNodeStatus(event.nodeId, {
            status: 'running',
            startedAt: event.timestamp,
          })
        } else if (event.type === 'node_complete') {
          updateNodeStatus(event.nodeId, {
            status: 'completed',
            completedAt: event.timestamp,
            output: event.output,
          })
        } else if (event.type === 'node_error') {
          updateNodeStatus(event.nodeId, {
            status: 'failed',
            completedAt: event.timestamp,
            error: event.error,
          })
        }
      }
    },
    [updateNodeStatus]
  )

  // 处理 SSE 完成
  const handleSSEComplete = useCallback((_event: ExecutionProgressEvent) => {
    setIsExecuting(false)
    setMonitorStatus('completed')
    setCurrentNodeId(null)
    setSseConnected(false)
    toast.success('工作流执行完成')
  }, [])

  // 处理 SSE 错误（回退到轮询执行详情）
  const handleSSEError = useCallback(
    (error: string) => {
      console.warn('SSE error, falling back to polling execution details:', error)
      setSseConnected(false)
      // SSE 不可用时，通过轮询执行详情来获取节点进度
      // 轮询逻辑在 pollTaskStatusMonitor 中处理
    },
    []
  )

  // SSE Hook
  const { connect: connectSSE, disconnect: disconnectSSE, isConnected } = useExecutionStream({
    onEvent: handleSSEEvent,
    onComplete: handleSSEComplete,
    onError: handleSSEError,
    enabled: executionMode === 'monitor',
  })

  // 更新 SSE 连接状态
  useEffect(() => {
    setSseConnected(isConnected)
  }, [isConnected])

  // 轮询任务状态（监控模式专用）
  const pollTaskStatusMonitor = useCallback(async () => {
    const tid = taskIdRef.current
    if (!tid) return

    try {
      const response = await fetch(`/api/tasks/${tid}`)

      if (response.status === 404) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        setIsExecuting(false)
        setMonitorStatus('failed')
        toast.error('任务不存在或已过期')
        return
      }

      if (!response.ok) {
        throw new Error('获取任务状态失败')
      }

      const data = await response.json()

      // 如果获取到 executionId，尝试连接 SSE 或轮询执行详情
      if (data.execution?.id) {
        const execId = data.execution.id

        // 如果是新的 executionId，尝试连接 SSE
        if (!executionIdRef.current) {
          executionIdRef.current = execId
          // 尝试连接 SSE（如果失败会回退到轮询）
          connectSSE(execId)
        }

        // 如果 SSE 未连接，通过轮询执行详情获取节点进度
        if (!isConnected) {
          const execResponse = await fetch(`/api/executions/${execId}`)
          if (execResponse.ok) {
            const execData = await execResponse.json()
            const execution = execData.execution

            // 用执行日志更新节点状态
            if (execution?.logs && Array.isArray(execution.logs)) {
              execution.logs.forEach((log: {
                nodeId: string
                nodeName: string
                nodeType: string
                status: string
                output?: Record<string, unknown>
                error?: string
                duration?: number
                promptTokens?: number
                completionTokens?: number
                startedAt?: string
                completedAt?: string
              }) => {
                updateNodeStatus(log.nodeId, {
                  nodeName: log.nodeName,
                  nodeType: log.nodeType,
                  status: log.status === 'COMPLETED' ? 'completed' : log.status === 'FAILED' ? 'failed' : 'running',
                  output: log.output,
                  error: log.error || undefined,
                  duration: log.duration || undefined,
                  promptTokens: log.promptTokens || undefined,
                  completionTokens: log.completionTokens || undefined,
                  startedAt: log.startedAt,
                  completedAt: log.completedAt,
                })
              })
            }

            // 检查执行状态
            if (execution?.status === 'COMPLETED' || execution?.status === 'FAILED') {
              if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
              }
              disconnectSSE()
              setIsExecuting(false)
              setMonitorStatus(execution.status === 'COMPLETED' ? 'completed' : 'failed')
              setCurrentNodeId(null)

              if (execution.status === 'COMPLETED') {
                toast.success('工作流执行完成')
              } else {
                toast.error(execution.error || '工作流执行失败')
              }
              return
            }
          }
        }
      }

      // 更新节点状态（轮询模式下使用）
      if (data.result?.nodeResults) {
        data.result.nodeResults.forEach(
          (nodeResult: {
            nodeId: string
            status: string
            output?: Record<string, unknown>
            error?: string
            duration?: number
            tokenUsage?: { promptTokens: number; completionTokens: number }
            startedAt?: string
            completedAt?: string
          }) => {
            updateNodeStatus(nodeResult.nodeId, {
              status: nodeResult.status === 'success' ? 'completed' : 'failed',
              output: nodeResult.output,
              error: nodeResult.error,
              duration: nodeResult.duration,
              promptTokens: nodeResult.tokenUsage?.promptTokens,
              completionTokens: nodeResult.tokenUsage?.completionTokens,
              startedAt: nodeResult.startedAt,
              completedAt: nodeResult.completedAt,
            })
          }
        )
      }

      if (data.currentNodeId) {
        setCurrentNodeId(data.currentNodeId)
        updateNodeStatus(data.currentNodeId, { status: 'running' })
      }

      if (data.status === 'completed' || data.status === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        disconnectSSE()
        setIsExecuting(false)
        setMonitorStatus(data.status === 'completed' ? 'completed' : 'failed')
        setCurrentNodeId(null)

        if (data.status === 'completed') {
          toast.success('工作流执行完成')
        } else {
          toast.error(data.error || '工作流执行失败')
        }
      }
    } catch (error) {
      console.error('Poll task status error:', error)
    }
  }, [updateNodeStatus, connectSSE, disconnectSSE, isConnected])

  // 更新 pollTaskStatusMonitor ref
  useEffect(() => {
    pollTaskStatusMonitorRef.current = pollTaskStatusMonitor
  }, [pollTaskStatusMonitor])

  // 轮询任务状态（普通模式）
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
          executionId: executionData?.id || data.executionId,
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

    // 监控模式：重置节点状态
    if (executionMode === 'monitor') {
      const nodeMap = new Map<string, NodeExecutionInfo>()
      nodes.forEach((node) => {
        nodeMap.set(node.id, {
          nodeId: node.id,
          nodeName: String(node.data?.name || node.id),
          nodeType: String(node.data?.type || 'UNKNOWN'),
          status: 'pending',
        })
      })
      setNodeStates(nodeMap)
      setMonitorStatus('running')
      setCurrentNodeId(null)
      executionIdRef.current = null
      abortControllerRef.current = new AbortController()
      disconnectSSE()
    }

    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputValues,
          async: executionMode === 'monitor' ? true : asyncMode, // 监控模式强制异步
        }),
        signal: executionMode === 'monitor' ? abortControllerRef.current?.signal : undefined,
      })

      const responseData = await response.json()
      // API 响应格式: { success: true, data: {...} } 或 { success: false, error: {...} }
      const data = responseData.data || responseData

      if (!response.ok) {
        const errorMsg = responseData.error?.message || data.error || data.message || '执行失败'
        setExecutionError(errorMsg)
        setIsExecuting(false)
        if (executionMode === 'monitor') {
          setMonitorStatus('failed')
        }
        toast.error(errorMsg)
        return
      }

      if (executionMode === 'monitor' && data.taskId) {
        // 监控模式：开始轮询（SSE 会在获取到 executionId 后接管）
        taskIdRef.current = data.taskId
        setTaskId(data.taskId)
        toast.info('任务已提交，正在执行中...')
        pollingRef.current = setInterval(pollTaskStatusMonitor, 1000)
      } else if (asyncMode && data.taskId) {
        // 普通模式异步：开始轮询
        setTaskId(data.taskId)
        toast.info('任务已提交，正在执行中...')
        pollingRef.current = setInterval(() => {
          pollTaskStatus(data.taskId)
        }, 2000)
      } else {
        // 普通模式同步：直接返回结果
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
      if ((error as Error).name === 'AbortError') {
        return
      }
      const errorMsg = error instanceof Error ? error.message : '执行失败'
      setExecutionError(errorMsg)
      setIsExecuting(false)
      if (executionMode === 'monitor') {
        setMonitorStatus('failed')
      }
      toast.error(errorMsg)
    }
  }, [workflowId, inputValues, asyncMode, executionMode, pollTaskStatus, pollTaskStatusMonitor, disconnectSSE, nodes])

  // 停止执行（监控模式）
  const handleStop = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    disconnectSSE()
    setIsExecuting(false)
    setMonitorStatus('failed')
    setCurrentNodeId(null)
    toast.info('执行已取消')
  }, [disconnectSSE])

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

  // 获取状态图标（监控模式）
  const getStatusIcon = (status: NodeExecutionStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'skipped':
        return <Clock className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-300" />
    }
  }

  // 计算进度（监控模式）
  const getProgress = () => {
    const total = nodeStates.size
    if (total === 0) return 0
    const completed = Array.from(nodeStates.values()).filter(
      (n) => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped'
    ).length
    return Math.round((completed / total) * 100)
  }

  // 排序节点（监控模式）
  const sortedNodes = Array.from(nodeStates.values()).sort((a, b) => {
    const order = { running: 0, completed: 1, failed: 1, pending: 2, skipped: 3 }
    return order[a.status] - order[b.status]
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            {executionMode === 'monitor' ? (
              <Eye className="h-5 w-5 text-blue-500" />
            ) : (
              <Play className="h-5 w-5 text-primary" />
            )}
            <h2 className="text-lg font-semibold">执行工作流</h2>
            {/* 监控模式进度 */}
            {executionMode === 'monitor' && monitorStatus === 'running' && (
              <>
                <span className="ml-2 text-sm text-muted-foreground">
                  {getProgress()}% 完成
                </span>
                {sseConnected && (
                  <span className="flex items-center gap-1 ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <Radio className="h-3 w-3 animate-pulse" />
                    实时
                  </span>
                )}
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 监控模式进度条 */}
        {executionMode === 'monitor' && monitorStatus !== 'idle' && (
          <div className="h-1.5 bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-300',
                monitorStatus === 'completed'
                  ? 'bg-green-500'
                  : monitorStatus === 'failed'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              )}
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        )}

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 执行模式切换 */}
          <div className="mb-6 flex gap-2 p-1 bg-muted rounded-lg">
            <button
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                executionMode === 'quick'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setExecutionMode('quick')}
              disabled={isExecuting}
            >
              <Play className="h-4 w-4" />
              普通执行
            </button>
            <button
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                executionMode === 'monitor'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setExecutionMode('monitor')}
              disabled={isExecuting}
            >
              <Eye className="h-4 w-4" />
              实时监控
            </button>
          </div>

          {/* 输入参数 - 执行前显示 */}
          {inputFields.length > 0 && (executionMode === 'quick' || monitorStatus === 'idle') && (
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

          {/* 普通执行模式内容 */}
          {executionMode === 'quick' && (
            <>
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

              {/* 执行错误 */}
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
            </>
          )}

          {/* 实时监控模式内容 */}
          {executionMode === 'monitor' && monitorStatus !== 'idle' && (
            <>
              {/* 执行总览 */}
              <div className="mb-6">
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg p-4',
                    monitorStatus === 'completed'
                      ? 'bg-green-50 text-green-700'
                      : monitorStatus === 'failed'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-blue-50 text-blue-700'
                  )}
                >
                  {monitorStatus === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : monitorStatus === 'failed' ? (
                    <XCircle className="h-5 w-5" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {monitorStatus === 'completed'
                        ? '执行成功'
                        : monitorStatus === 'failed'
                          ? '执行失败'
                          : '正在执行...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 节点执行列表 */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">节点执行进度</h3>
                {sortedNodes.map((nodeInfo) => (
                  <div
                    key={nodeInfo.nodeId}
                    className={cn(
                      'rounded-lg border transition-colors',
                      nodeInfo.status === 'running' && 'border-blue-300 bg-blue-50',
                      nodeInfo.status === 'completed' && 'border-green-200 bg-green-50/50',
                      nodeInfo.status === 'failed' && 'border-red-200 bg-red-50/50',
                      currentNodeId === nodeInfo.nodeId && 'ring-2 ring-blue-500'
                    )}
                  >
                    <button
                      className="flex w-full items-center justify-between p-3 text-left"
                      onClick={() =>
                        setShowNodeDetails(
                          showNodeDetails === nodeInfo.nodeId ? null : nodeInfo.nodeId
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(nodeInfo.status)}
                        <div>
                          <span className="font-medium">{nodeInfo.nodeName}</span>
                          <span className="ml-2 text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                            {nodeInfo.nodeType}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {nodeInfo.duration && (
                          <span className="text-sm text-muted-foreground">
                            {formatDuration(nodeInfo.duration)}
                          </span>
                        )}
                        {(nodeInfo.promptTokens || nodeInfo.completionTokens) && (
                          <span className="text-sm text-muted-foreground">
                            {(nodeInfo.promptTokens || 0) + (nodeInfo.completionTokens || 0)} tokens
                          </span>
                        )}
                        {showNodeDetails === nodeInfo.nodeId ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </button>

                    {/* 节点详情 */}
                    {showNodeDetails === nodeInfo.nodeId && (
                      <div className="border-t px-3 py-2">
                        {nodeInfo.error && (
                          <div className="mb-2 text-sm text-red-600">
                            <span className="font-medium">错误: </span>
                            {nodeInfo.error}
                          </div>
                        )}
                        {nodeInfo.output && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">输出:</span>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                              {JSON.stringify(nodeInfo.output, null, 2)}
                            </pre>
                          </div>
                        )}
                        {!nodeInfo.error && !nodeInfo.output && nodeInfo.status === 'pending' && (
                          <span className="text-sm text-muted-foreground">等待执行...</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-between border-t px-6 py-4">
          <div>
            {/* 反馈按钮 - 普通模式或监控模式执行完成/失败后显示 */}
            {((executionMode === 'quick' && result && result.executionId) ||
              (executionMode === 'monitor' && (monitorStatus === 'completed' || monitorStatus === 'failed') && executionIdRef.current)) && (
              <Button
                variant="outline"
                onClick={() => setShowFeedbackDialog(true)}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                提交反馈
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isExecuting}>
              {(executionMode === 'quick' && result) || (executionMode === 'monitor' && monitorStatus !== 'idle' && monitorStatus !== 'running')
                ? '关闭'
                : '取消'}
            </Button>
            {executionMode === 'monitor' && isExecuting ? (
              <Button variant="destructive" onClick={handleStop}>
                <StopCircle className="mr-2 h-4 w-4" />
                停止执行
              </Button>
            ) : (
              <Button onClick={handleExecute} disabled={isExecuting}>
                {isExecuting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {(executionMode === 'quick' && result) || (executionMode === 'monitor' && monitorStatus !== 'idle')
                      ? '重新执行'
                      : '执行'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 执行反馈对话框 */}
      {(result?.executionId || executionIdRef.current) && (
        <ExecutionFeedbackDialog
          executionId={(result?.executionId || executionIdRef.current)!}
          actualOutput={result?.output ? JSON.stringify(result.output, null, 2) : undefined}
          open={showFeedbackDialog}
          onOpenChange={setShowFeedbackDialog}
          onSubmit={() => {
            // 反馈提交后的回调
          }}
        />
      )}
    </div>
  )
}
