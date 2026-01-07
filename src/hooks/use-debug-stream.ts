'use client'

/**
 * SSE 调试日志流订阅 Hook
 *
 * 订阅节点调试的实时日志事件
 * Requirements: 1.1, 1.2, 2.3
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  DebugLogData,
  DebugStatusData,
  DebugCompleteData,
  DebugLogEvent,
  DebugStatus,
} from '@/lib/workflow/debug-events'
import {
  isDebugLogData,
  isDebugStatusData,
  isDebugCompleteData,
  isDebugErrorData,
} from '@/lib/workflow/debug-events'

/**
 * 调试参数
 */
export interface DebugParams {
  workflowId: string
  nodeId: string
  mockInputs?: Record<string, Record<string, unknown>>
  timeout?: number
  nodeConfig?: Record<string, unknown>
}

/**
 * Hook 配置选项
 */
export interface UseDebugStreamOptions {
  /** 日志事件回调 */
  onLog?: (log: DebugLogData) => void
  /** 状态变更回调 */
  onStatus?: (status: DebugStatusData) => void
  /** 完成回调 */
  onComplete?: (result: DebugCompleteData) => void
  /** 错误回调 */
  onError?: (error: string) => void
}

/**
 * Hook 返回值
 */
export interface UseDebugStreamReturn {
  /** 是否已连接 */
  isConnected: boolean
  /** 是否正在执行 */
  isRunning: boolean
  /** 日志列表 */
  logs: DebugLogData[]
  /** 当前状态 */
  status: DebugStatus
  /** 执行结果 */
  result: DebugCompleteData | null
  /** 错误信息 */
  error: string | null
  /** 开始调试 */
  startDebug: (params: DebugParams) => void
  /** 停止调试 */
  stopDebug: () => void
  /** 清除日志 */
  clearLogs: () => void
}

/**
 * 重连配置
 */
const RECONNECT_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // ms
  backoffMultiplier: 2,
}

/**
 * 调试日志流 Hook
 *
 * 使用 SSE 实时接收节点调试日志
 */
export function useDebugStream(
  options: UseDebugStreamOptions = {}
): UseDebugStreamReturn {
  const { onLog, onStatus, onComplete, onError } = options

  // 状态
  const [isConnected, setIsConnected] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<DebugLogData[]>([])
  const [status, setStatus] = useState<DebugStatus>('idle')
  const [result, setResult] = useState<DebugCompleteData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)
  const currentParamsRef = useRef<DebugParams | null>(null)
  const receivedTerminalEventRef = useRef(false)

  /**
   * 追加一条本地日志（用于连接/错误等客户端侧事件）
   */
  const appendLocalLog = useCallback(
    (log: Omit<DebugLogData, 'timestamp'> & { timestamp?: string }) => {
      const normalized: DebugLogData = {
        ...log,
        timestamp: log.timestamp || new Date().toISOString(),
      }
      setLogs((prev) => [...prev, normalized])
      onLog?.(normalized)
    },
    [onLog],
  )

  /**
   * 清理函数
   */
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      // 传递 abort 原因，避免 "aborted without reason" 错误
      abortControllerRef.current.abort('cleanup')
      abortControllerRef.current = null
    }
    setIsConnected(false)
    setIsRunning(false)
  }, [])

  /**
   * 处理 SSE 事件
   */
  const handleEvent = useCallback((event: DebugLogEvent) => {
    if (event.type === 'log' && isDebugLogData(event.data)) {
      const logData = event.data
      setLogs((prev) => [...prev, logData])
      onLog?.(logData)
    } else if (event.type === 'status' && isDebugStatusData(event.data)) {
      const statusData = event.data
      if (statusData.status === 'running') {
        setStatus('running')
        setIsRunning(true)
      } else if (statusData.status === 'completed') {
        setStatus('completed')
        setIsRunning(false)
        receivedTerminalEventRef.current = true
      } else if (statusData.status === 'failed') {
        setStatus('failed')
        setIsRunning(false)
        receivedTerminalEventRef.current = true
      }
      onStatus?.(statusData)
    } else if (event.type === 'complete' && isDebugCompleteData(event.data)) {
      const completeData = event.data
      receivedTerminalEventRef.current = true
      setResult(completeData)
      setIsRunning(false)
      if (completeData.status === 'success') {
        setStatus('completed')
      } else {
        setStatus('failed')
        if (completeData.error) {
          setError(completeData.error)
        }
      }
      onComplete?.(completeData)
    } else if (event.type === 'error' && isDebugErrorData(event.data)) {
      const errorData = event.data
      receivedTerminalEventRef.current = true
      setError(errorData.message)
      setStatus('failed')
      setIsRunning(false)
      onError?.(errorData.message)
    }
  }, [onLog, onStatus, onComplete, onError])

  /**
   * 连接到调试流
   */
  const connectToStream = useCallback(async (params: DebugParams) => {
    const { workflowId, nodeId, mockInputs, timeout, nodeConfig } = params

    // 创建 AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      appendLocalLog({
        level: 'info',
        step: 'CONNECT',
        message: '正在连接调试流…',
        data: { workflowId, nodeId },
      })

      const response = await fetch(
        `/api/workflows/${workflowId}/nodes/${nodeId}/debug/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mockInputs,
            timeout,
            nodeConfig,
          }),
          signal: abortController.signal,
        }
      )

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || ''
        const errorPayload =
          contentType.includes('application/json')
            ? await response.json().catch(() => ({}))
            : await response.text().catch(() => '')
        const message =
          typeof errorPayload === 'object' && errorPayload
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((errorPayload as any).error as string | undefined) ||
              `HTTP ${response.status}`
            : `HTTP ${response.status}`
        throw new Error(message)
      }

      if (!response.body) {
        throw new Error('响应体为空')
      }

      // 如果不是 SSE 流，说明服务端没有返回预期响应（通常是 404/重定向/HTML 错误页）
      const responseContentType = response.headers.get('content-type') || ''
      if (!responseContentType.includes('text/event-stream')) {
        throw new Error(`非 SSE 响应: ${responseContentType || 'unknown'}`)
      }

      setIsConnected(true)
      retryCountRef.current = 0

      // 读取 SSE 流
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEventDataLines: string[] = []

      const flushEvent = () => {
        if (currentEventDataLines.length === 0) return
        const payload = currentEventDataLines.join('\n')
        currentEventDataLines = []
        try {
          const event: DebugLogEvent = JSON.parse(payload)
          handleEvent(event)
        } catch {
          appendLocalLog({
            level: 'warning',
            step: 'PARSE',
            message: '收到无法解析的 SSE 事件（已忽略）',
          })
        }
      }

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // 处理最后一段缓冲内容（可能没有以换行结束）
          const remainder = buffer.trimEnd()
          if (remainder.length > 0) {
            for (const rawLine of remainder.split('\n')) {
              const line = rawLine.replace(/\r$/, '')
              if (line === '') {
                flushEvent()
                continue
              }
              if (line.startsWith(':')) continue
              if (line.startsWith('data:')) {
                currentEventDataLines.push(line.replace(/^data:\s*/, ''))
              }
            }
          }
          flushEvent()
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // SSE: 事件以空行分隔；data 可多行
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '')
          if (line === '') {
            flushEvent()
            continue
          }
          if (line.startsWith(':')) continue
          if (line.startsWith('data:')) {
            currentEventDataLines.push(line.replace(/^data:\s*/, ''))
            continue
          }
        }
      }

      // 流正常结束
      setIsConnected(false)
      setIsRunning(false)
      if (!receivedTerminalEventRef.current) {
        setStatus((prev) => (prev === 'running' ? 'failed' : prev))
        appendLocalLog({
          level: 'warning',
          step: 'STREAM',
          message: '调试流已结束（未收到完成事件）',
        })
      }
    } catch (err) {
      // 检查是否是主动中断（包括 cleanup 触发的 abort）
      if (err instanceof Error && err.name === 'AbortError') {
        // 静默处理 abort，不设置错误状态
        setIsConnected(false)
        setIsRunning(false)
        return
      }

      // 检查是否已经被清理（避免在组件卸载后更新状态）
      if (!currentParamsRef.current) {
        return
      }

      const errorMessage = err instanceof Error ? err.message : '连接失败'
      
      // 尝试重连
      if (retryCountRef.current < RECONNECT_CONFIG.maxRetries && currentParamsRef.current) {
        retryCountRef.current++
        const delay = RECONNECT_CONFIG.retryDelay * Math.pow(
          RECONNECT_CONFIG.backoffMultiplier,
          retryCountRef.current - 1
        )
        
        appendLocalLog({
          level: 'warning',
          step: 'RETRY',
          message: `连接失败，${Math.round(delay / 1000)}s 后重试（${retryCountRef.current}/${RECONNECT_CONFIG.maxRetries}）`,
          data: { error: errorMessage },
        })

        setTimeout(() => {
          if (currentParamsRef.current) {
            connectToStream(currentParamsRef.current)
          }
        }, delay)
        return
      }

      // 重连失败
      appendLocalLog({
        level: 'error',
        step: 'CONNECT',
        message: '连接调试流失败',
        data: { error: errorMessage },
      })
      setError(errorMessage)
      setStatus('failed')
      setIsRunning(false)
      setIsConnected(false)
      onError?.(errorMessage)
    }
  }, [appendLocalLog, handleEvent, onError])

  /**
   * 开始调试
   */
  const startDebug = useCallback((params: DebugParams) => {
    // 清理之前的状态
    cleanup()
    setLogs([])
    setResult(null)
    setError(null)
    setStatus('running')
    setIsRunning(true)
    retryCountRef.current = 0
    currentParamsRef.current = params
    receivedTerminalEventRef.current = false

    // 连接到流
    connectToStream(params)
  }, [cleanup, connectToStream])

  /**
   * 停止调试
   */
  const stopDebug = useCallback(() => {
    cleanup()
    currentParamsRef.current = null
    retryCountRef.current = 0
    
    if (status === 'running') {
      setStatus('idle')
    }
  }, [cleanup, status])

  /**
   * 清除日志
   */
  const clearLogs = useCallback(() => {
    setLogs([])
    setResult(null)
    setError(null)
    setStatus('idle')
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    isConnected,
    isRunning,
    logs,
    status,
    result,
    error,
    startDebug,
    stopDebug,
    clearLogs,
  }
}
