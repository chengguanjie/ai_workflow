'use client'

/**
 * SSE 执行进度订阅 Hook
 *
 * 订阅工作流执行的实时进度事件
 * 
 * 注意：使用 useRef 存储回调函数以避免无限循环
 * 当回调函数变化时不会导致 connect/disconnect 函数重新创建
 */

import { useState, useEffect, useCallback, useRef } from 'react'

// 执行进度事件类型（与后端保持一致）
export interface ExecutionProgressEvent {
  executionId: string
  type: 'node_start' | 'node_complete' | 'node_error' | 'execution_complete' | 'execution_error'
  nodeId?: string
  nodeName?: string
  nodeType?: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  progress: number // 0-100
  completedNodes: string[]
  totalNodes: number
  currentNodeIndex: number
  error?: string
  output?: Record<string, unknown>
  timestamp: string
  /** 详细的错误信息（包含友好提示和建议） */
  errorDetail?: {
    friendlyMessage: string
    suggestions: string[]
    code?: string
    isRetryable?: boolean
  }
  /** 输入状态 */
  inputStatus?: 'pending' | 'valid' | 'invalid' | 'missing'
  /** 输出状态 - 扩展支持 'invalid' 和 'incomplete' */
  outputStatus?: 'pending' | 'valid' | 'error' | 'empty' | 'invalid' | 'incomplete'
  /** 输入错误信息 */
  inputError?: string
  /** 输出错误信息 */
  outputError?: string
}

export interface UseExecutionStreamOptions {
  onEvent?: (event: ExecutionProgressEvent) => void
  onComplete?: (event: ExecutionProgressEvent) => void
  onError?: (error: string) => void
  enabled?: boolean
}

export interface UseExecutionStreamReturn {
  isConnected: boolean
  lastEvent: ExecutionProgressEvent | null
  error: string | null
  connect: (executionId: string) => void
  disconnect: () => void
}

export function useExecutionStream(
  options: UseExecutionStreamOptions = {}
): UseExecutionStreamReturn {
  const { onEvent, onComplete, onError, enabled = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<ExecutionProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // 使用 ref 存储回调函数，避免回调变化导致 connect 函数重新创建
  // 这是解决 "Maximum update depth exceeded" 错误的关键
  const onEventRef = useRef(onEvent)
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  const enabledRef = useRef(enabled)
  
  // 同步更新 ref 值
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])
  
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])
  
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])
  
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  // 清理函数 - 不依赖任何外部变量
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  // 断开连接 - 稳定的函数引用
  const disconnect = useCallback(() => {
    cleanup()
    setLastEvent(null)
    setError(null)
  }, [cleanup])

  // 连接到 SSE 流 - 使用 ref 访问回调，避免依赖变化
  const connect = useCallback(
    (executionId: string) => {
      if (!enabledRef.current) return

      // 清理之前的连接
      cleanup()
      setError(null)

      try {
        const url = `/api/executions/${executionId}/stream`
        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          setIsConnected(true)
          setError(null)
        }

        eventSource.onmessage = (event) => {
          try {
            const data: ExecutionProgressEvent = JSON.parse(event.data)
            setLastEvent(data)

            // 通过 ref 调用外部回调，避免闭包捕获旧值
            onEventRef.current?.(data)

            // 检查执行是否完成
            if (data.type === 'execution_complete' || data.type === 'execution_error') {
              if (data.type === 'execution_complete') {
                onCompleteRef.current?.(data)
              } else {
                onErrorRef.current?.(data.error || '执行失败')
              }
              // 完成后自动关闭连接
              cleanup()
            }
          } catch (parseError) {
            console.error('Failed to parse SSE event:', parseError)
          }
        }

        eventSource.onerror = (err) => {
          console.error('SSE connection error:', err)
          setIsConnected(false)

          // 检查是否是正常关闭
          if (eventSource.readyState === EventSource.CLOSED) {
            cleanup()
            return
          }

          // 连接错误，设置错误状态
          const errorMessage = 'SSE 连接失败'
          setError(errorMessage)
          onErrorRef.current?.(errorMessage)
          cleanup()
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '无法连接到执行流'
        setError(errorMessage)
        onErrorRef.current?.(errorMessage)
      }
    },
    [cleanup] // 只依赖 cleanup，不依赖回调函数
  )

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    isConnected,
    lastEvent,
    error,
    connect,
    disconnect,
  }
}
