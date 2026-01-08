'use client'

/**
 * 执行可视化组件
 * 显示工作流节点逐个执行的实时进度
 * 支持 SSE 实时推送
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Play,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  StopCircle,
  RotateCcw,
  Radio,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkflowStore } from '@/stores/workflow-store'
import { cn } from '@/lib/utils'
import { useExecutionStream, type ExecutionProgressEvent } from '@/hooks/use-execution-stream'

// 节点执行状态
export type NodeExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

// 单个节点的执行信息
export interface NodeExecutionInfo {
  nodeId: string
  nodeName: string
  nodeType: string
  status: NodeExecutionStatus
  startedAt?: string
  completedAt?: string
  duration?: number
  output?: Record<string, unknown>
  error?: string
  errorDetail?: {
    friendlyMessage: string
    suggestions: string[]
    code?: string
    isRetryable?: boolean
  }
  promptTokens?: number
  completionTokens?: number
}

// 执行可视化状态
export interface ExecutionVisualizerState {
  isExecuting: boolean
  status: 'idle' | 'running' | 'completed' | 'failed'
  nodes: Map<string, NodeExecutionInfo>
  currentNodeId: string | null
  totalDuration?: number
  totalTokens?: number
  error?: string
  errorDetail?: {
    friendlyMessage: string
    suggestions: string[]
    code?: string
    isRetryable?: boolean
  }
}

interface ExecutionVisualizerProps {
  workflowId: string
  isOpen: boolean
  onClose: () => void
  onNodeStatusChange?: (nodeId: string, status: NodeExecutionStatus) => void
}

export function ExecutionVisualizer({
  workflowId,
  isOpen,
  onClose,
  onNodeStatusChange,
}: ExecutionVisualizerProps) {
  const {
    nodes,
    updateNodeExecutionStatus,
    updateNodeExecutionStatusSafe,
    updateNodeExecutionDetails,
    initNodeExecutionDetails,
    clearNodeExecutionStatus,
    setExecutionManagerActive,
    finalizeExecution,
    updateNodeExecutionResult,
  } = useWorkflowStore()
  const [state, setState] = useState<ExecutionVisualizerState>({
    isExecuting: false,
    status: 'idle',
    nodes: new Map(),
    currentNodeId: null,
  })
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [showInputs, setShowInputs] = useState(true)
  const [showNodeDetails, setShowNodeDetails] = useState<string | null>(null)
  const [useSSE] = useState(true) // 是否使用 SSE 模式
  const [sseConnected, setSseConnected] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const pollInFlightRef = useRef(false)
  const taskIdRef = useRef<string | null>(null)
  const executionIdRef = useRef<string | null>(null)
  const pollTaskStatusRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // 获取输入节点字段
  const inputFields = nodes
    .filter((node) => node.data?.type === 'INPUT')
    .flatMap((node) => {
      const fields =
        (node.data?.config as { fields?: Array<{ id: string; name: string; value: string }> })
          ?.fields || []
      return fields.map((field) => ({
        nodeId: node.id,
        nodeName: String(node.data?.name || '输入'),
        fieldId: field.id,
        fieldName: field.name,
        defaultValue: field.value || '',
      }))
    })

  // 初始化
  useEffect(() => {
    if (isOpen) {
      // 组件挂载时激活执行管理器，禁用其他事件源
      setExecutionManagerActive(true)
      
      const initial: Record<string, string> = {}
      inputFields.forEach((field) => {
        initial[field.fieldName] = field.defaultValue
      })
      setInputValues(initial)

      // 初始化所有节点为 pending 状态
      const nodeMap = new Map<string, NodeExecutionInfo>()
      nodes.forEach((node) => {
        nodeMap.set(node.id, {
          nodeId: node.id,
          nodeName: String(node.data?.name || node.id),
          nodeType: String(node.data?.type || 'UNKNOWN'),
          status: 'pending',
        })
      })
      setState({
        isExecuting: false,
        status: 'idle',
        nodes: nodeMap,
        currentNodeId: null,
      })
    }
    
    // 组件卸载时停用执行管理器
    return () => {
      if (isOpen) {
        setExecutionManagerActive(false)
      }
    }
  }, [isOpen, setExecutionManagerActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // 清理
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

  // 更新节点状态
  const updateNodeStatus = useCallback(
    (nodeId: string, update: Partial<NodeExecutionInfo>) => {
      setState((prev) => {
        const newNodes = new Map(prev.nodes)
        const existing = newNodes.get(nodeId)
        if (existing) {
          newNodes.set(nodeId, { ...existing, ...update })
        }
        return { ...prev, nodes: newNodes }
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
      // 更新当前节点
      if (event.nodeId) {
        setState((prev) => ({ ...prev, currentNodeId: event.nodeId || null }))

        // 根据事件类型更新节点状态
        if (event.type === 'node_start') {
          updateNodeStatus(event.nodeId, {
            status: 'running',
            startedAt: event.timestamp,
          })
          // 使用安全的状态更新方法，确保单一 running 节点
          updateNodeExecutionStatusSafe(event.nodeId, 'running')
          updateNodeExecutionDetails(event.nodeId, {
            triggered: true,
            inputStatus: event.inputStatus || 'valid',
            inputError: event.inputError,
            outputStatus: 'pending',  // 重置输出状态为等待中
            outputError: undefined,   // 清除之前的错误信息
          })
        } else if (event.type === 'node_complete') {
          updateNodeStatus(event.nodeId, {
            status: 'completed',
            completedAt: event.timestamp,
            output: event.output,
          })
          // 使用安全的状态更新方法
          updateNodeExecutionStatusSafe(event.nodeId, 'completed')
          updateNodeExecutionDetails(event.nodeId, {
            outputStatus: event.outputStatus || 'valid',
          })
          // 同步执行结果到全局 Store，使节点调试面板能够显示输出
          updateNodeExecutionResult(event.nodeId, {
            status: 'success',
            output: event.output || {},
            duration: 0, // 后端事件暂不包含 duration
          })
        } else if (event.type === 'node_error') {
          updateNodeStatus(event.nodeId, {
            status: 'failed',
            completedAt: event.timestamp,
            error: event.error,
            errorDetail: event.errorDetail,
          })
          // 使用安全的状态更新方法
          updateNodeExecutionStatusSafe(event.nodeId, 'failed')
          updateNodeExecutionDetails(event.nodeId, {
            inputStatus: event.inputStatus,
            outputStatus: event.outputStatus,
            inputError: event.inputError,
            outputError: event.outputError,
          })
          // 同步执行错误到全局 Store，使节点调试面板能够显示错误
          updateNodeExecutionResult(event.nodeId, {
            status: 'error',
            output: {},
            error: event.error,
            duration: 0,
          })
        }
      }

      if (event.type === 'execution_error') {
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: event.error,
          errorDetail: event.errorDetail,
        }))
      }
    },
    [updateNodeStatus, updateNodeExecutionStatusSafe, updateNodeExecutionDetails, updateNodeExecutionResult]
  )

  // 处理 SSE 完成
  const handleSSEComplete = useCallback(
    (_event: ExecutionProgressEvent) => {
      setState((prev) => ({
        ...prev,
        isExecuting: false,
        status: 'completed',
        currentNodeId: null,
      }))
      setSseConnected(false)
      // 执行完成时调用 finalizeExecution，确保没有节点仍处于 running 状态
      finalizeExecution(true)
      toast.success('工作流执行完成')
    },
    [finalizeExecution]
  )

  // 处理 SSE 错误
  const handleSSEError = useCallback(
    (error: string) => {
      // SSE 错误时回退到轮询
      console.warn('SSE error, falling back to polling:', error)
      if (taskIdRef.current && state.isExecuting) {
        // 启动轮询作为备用
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = setInterval(() => pollTaskStatusRef.current(), 2000)
      } else {
        // 如果不是执行中状态，调用 finalizeExecution 清理状态
        finalizeExecution(false)
      }
      setSseConnected(false)
    },
    [state.isExecuting, finalizeExecution]
  )

  // SSE Hook
  const { connect: connectSSE, disconnect: disconnectSSE, isConnected } = useExecutionStream({
    onEvent: handleSSEEvent,
    onComplete: handleSSEComplete,
    onError: handleSSEError,
    enabled: useSSE,
  })

  // 更新 SSE 连接状态
  useEffect(() => {
    setSseConnected(isConnected)
  }, [isConnected])

  // 轮询任务状态
  const pollTaskStatus = useCallback(async () => {
    const taskId = taskIdRef.current
    if (!taskId) return
    if (pollInFlightRef.current) return
    pollInFlightRef.current = true

    try {
      const response = await fetch(`/api/tasks/${taskId}`)

      if (response.status === 404) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        setState((prev) => ({
          ...prev,
          isExecuting: false,
          status: 'failed',
          error: '任务不存在或已过期',
        }))
        toast.error('任务不存在或已过期')
        return
      }

      if (!response.ok) {
        // 429 等非致命错误不刷屏，保持轮询即可
        return
      }

      const data = await response.json()

      // 如果启用 SSE 且获取到 executionId，切换到 SSE 模式
      if (useSSE && data.execution?.id && !executionIdRef.current) {
        executionIdRef.current = data.execution.id
        // 停止轮询，切换到 SSE
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        // 连接 SSE
        connectSSE(data.execution.id)
        return
      }

      // 更新节点状态（轮询模式下使用）
      if (data.result?.nodeResults) {
        data.result.nodeResults.forEach(
          (nodeResult: {
            nodeId: string
            nodeName?: string
            status: string
            output?: Record<string, unknown>
            error?: string
            duration?: number
            tokenUsage?: { promptTokens: number; completionTokens: number }
            startedAt?: string
            completedAt?: string
          }) => {
            const mappedStatus = nodeResult.status === 'success' ? 'completed' : 'failed'
            updateNodeStatus(nodeResult.nodeId, {
              status: mappedStatus,
              output: nodeResult.output,
              error: nodeResult.error,
              duration: nodeResult.duration,
              promptTokens: nodeResult.tokenUsage?.promptTokens,
              completionTokens: nodeResult.tokenUsage?.completionTokens,
              startedAt: nodeResult.startedAt,
              completedAt: nodeResult.completedAt,
            })
            // 使用安全的状态更新方法
            updateNodeExecutionStatusSafe(nodeResult.nodeId, mappedStatus)
          }
        )
      }

      // 更新当前执行节点
      if (data.currentNodeId) {
        setState((prev) => ({ ...prev, currentNodeId: data.currentNodeId }))
        updateNodeStatus(data.currentNodeId, { status: 'running' })
        // 使用安全的状态更新方法，确保单一 running 节点
        updateNodeExecutionStatusSafe(data.currentNodeId, 'running')
      }

      // 检查是否完成
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }

        setState((prev) => ({
          ...prev,
          isExecuting: false,
          status: data.status === 'completed' ? 'completed' : 'failed',
          totalDuration: data.result?.duration,
          totalTokens: data.result?.totalTokens,
          currentNodeId: null,
          error: data.error || data.result?.error,
        }))

        // 执行完成时调用 finalizeExecution，确保没有节点仍处于 running 状态
        finalizeExecution(data.status === 'completed')

        if (data.status === 'completed') {
          toast.success('工作流执行完成')
        } else {
          toast.error(data.error || '工作流执行失败')
        }
      }
    } catch (error) {
      console.error('Poll task status error:', error)
    } finally {
      pollInFlightRef.current = false
    }
  }, [updateNodeStatus, useSSE, connectSSE, finalizeExecution, updateNodeExecutionStatusSafe])

  // 更新 pollTaskStatus ref（用于 SSE 错误回退）
  useEffect(() => {
    pollTaskStatusRef.current = pollTaskStatus
  }, [pollTaskStatus])

  // 开始执行
  const handleExecute = useCallback(async () => {
    // 重置状态
    const nodeMap = new Map<string, NodeExecutionInfo>()
    const nodeIds: string[] = []
    nodes.forEach((node) => {
      nodeMap.set(node.id, {
        nodeId: node.id,
        nodeName: String(node.data?.name || node.id),
        nodeType: String(node.data?.type || 'UNKNOWN'),
        status: 'pending',
      })
      nodeIds.push(node.id)
    })

    setState({
      isExecuting: true,
      status: 'running',
      nodes: nodeMap,
      currentNodeId: null,
    })

    // 初始化 store 中的节点执行状态和详情
    clearNodeExecutionStatus()
    initNodeExecutionDetails(nodeIds)
    nodeIds.forEach((nodeId) => {
      updateNodeExecutionStatus(nodeId, 'pending')
    })

    // 重置引用
    executionIdRef.current = null
    abortControllerRef.current = new AbortController()

    // 断开之前的 SSE 连接
    disconnectSSE()

    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputValues,
          async: true,
          // 编辑器内执行优先使用草稿配置，避免跑到已发布(旧)版本
          mode: 'draft',
        }),
        signal: abortControllerRef.current.signal,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '执行失败')
      }

      if (data.taskId) {
        taskIdRef.current = data.taskId
        toast.info('任务已提交，正在执行中...')

        // 轮询频率控制，避免触发默认限流
        pollingRef.current = setInterval(pollTaskStatus, 2000)
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return
      }

      setState((prev) => ({
        ...prev,
        isExecuting: false,
        status: 'failed',
        error: error instanceof Error ? error.message : '执行失败',
      }))
      toast.error(error instanceof Error ? error.message : '执行失败')
    }
  }, [workflowId, inputValues, nodes, pollTaskStatus, disconnectSSE, clearNodeExecutionStatus, initNodeExecutionDetails, updateNodeExecutionStatus])

  // 停止执行
  const handleStop = useCallback(() => {
    // 停止轮询
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    // 取消请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    // 断开 SSE
    disconnectSSE()

    setState((prev) => ({
      ...prev,
      isExecuting: false,
      status: 'failed',
      error: '执行已取消',
      currentNodeId: null,
    }))

    toast.info('执行已取消')
  }, [disconnectSSE])

  // 格式化时间
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  // 获取状态图标
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

  // 计算进度
  const getProgress = () => {
    const total = state.nodes.size
    if (total === 0) return 0
    const completed = Array.from(state.nodes.values()).filter(
      (n) => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped'
    ).length
    return Math.round((completed / total) * 100)
  }

  if (!isOpen) return null

  const sortedNodes = Array.from(state.nodes.values()).sort((a, b) => {
    const order = { running: 0, completed: 1, failed: 1, pending: 2, skipped: 3 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-background shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">执行可视化</h2>
            {state.isExecuting && (
              <>
                <span className="ml-2 text-sm text-muted-foreground">
                  {getProgress()}% 完成
                </span>
                {/* SSE 连接状态指示器 */}
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

        {/* 进度条 */}
        {state.status !== 'idle' && (
          <div className="h-1.5 bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-300',
                state.status === 'completed'
                  ? 'bg-green-500'
                  : state.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              )}
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        )}

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 输入参数 */}
          {inputFields.length > 0 && state.status === 'idle' && (
            <div className="mb-6">
              <button
                className="flex w-full items-center justify-between text-sm font-medium"
                onClick={() => setShowInputs(!showInputs)}
              >
                <span>输入参数</span>
                {showInputs ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showInputs && (
                <div className="mt-3 space-y-3">
                  {inputFields.map((field) => (
                    <div key={`${field.nodeId}-${field.fieldId}`} className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        {field.nodeName} / {field.fieldName}
                      </label>
                      <input
                        type="text"
                        value={inputValues[field.fieldName] || ''}
                        onChange={(e) =>
                          setInputValues((prev) => ({
                            ...prev,
                            [field.fieldName]: e.target.value,
                          }))
                        }
                        placeholder={`输入 ${field.fieldName}`}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        disabled={state.isExecuting}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 执行总览 */}
          {state.status !== 'idle' && (
            <div className="mb-6">
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg p-4',
                  state.status === 'completed'
                    ? 'bg-green-50 text-green-700'
                    : state.status === 'failed'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-blue-50 text-blue-700'
                )}
              >
                {state.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : state.status === 'failed' ? (
                  <XCircle className="h-5 w-5" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {state.status === 'completed'
                      ? '执行成功'
                      : state.status === 'failed'
                        ? state.errorDetail?.friendlyMessage || '执行失败'
                        : '正在执行...'}
                  </p>
                  {state.error && (
                    <p className="text-sm opacity-75 mt-0.5">
                      {state.errorDetail?.code ? `[${state.errorDetail.code}] ` : ''}
                      {state.error}
                    </p>
                  )}
                  {state.status === 'failed' &&
                    state.errorDetail?.suggestions &&
                    state.errorDetail.suggestions.length > 0 && (
                      <div className="mt-2 rounded bg-red-100/50 p-2 text-xs text-red-800">
                        <span className="font-semibold">建议: </span>
                        {state.errorDetail.suggestions.join('; ')}
                      </div>
                    )}
                </div>
                {(state.totalDuration || state.totalTokens) && (
                  <div className="flex items-center gap-4 text-sm">
                    {state.totalDuration && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatDuration(state.totalDuration)}
                      </span>
                    )}
                    {state.totalTokens && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-4 w-4" />
                        {state.totalTokens} tokens
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 节点执行列表 */}
          {state.status !== 'idle' && (
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
                    state.currentNodeId === nodeInfo.nodeId && 'ring-2 ring-blue-500'
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
                        <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">
                          <div className="flex items-center gap-2 font-medium">
                            <XCircle className="h-4 w-4" />
                            {nodeInfo.errorDetail?.friendlyMessage || '执行出错'}
                          </div>
                          <div className="mt-1 pl-6 text-xs opacity-90">
                            {nodeInfo.errorDetail?.code && (
                              <span className="mr-1 font-mono bg-red-100 px-1 rounded">
                                {nodeInfo.errorDetail.code}
                              </span>
                            )}
                            {nodeInfo.error}
                          </div>

                          {nodeInfo.errorDetail?.suggestions &&
                            nodeInfo.errorDetail.suggestions.length > 0 && (
                              <div className="mt-2 pl-6">
                                <div className="text-xs font-semibold mb-1 text-red-700">优化建议:</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-xs text-red-700">
                                  {nodeInfo.errorDetail.suggestions.map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
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
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={state.isExecuting}>
            {state.status !== 'idle' && state.status !== 'running' ? '关闭' : '取消'}
          </Button>
          {state.isExecuting ? (
            <Button variant="destructive" onClick={handleStop}>
              <StopCircle className="mr-2 h-4 w-4" />
              停止执行
            </Button>
          ) : (
            <Button onClick={handleExecute}>
              {state.status !== 'idle' ? (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  重新执行
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  开始执行
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
