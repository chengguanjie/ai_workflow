'use client'

/**
 * 调试日志查看器组件
 *
 * 实时显示节点调试过程中的日志，支持：
 * - 日志级别颜色区分
 * - 时间戳显示
 * - JSON 数据格式化
 * - 自动滚动到最新日志
 *
 * Requirements: 1.3, 4.1, 4.2, 4.3
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DebugLogData, DebugStatus } from '@/lib/workflow/debug-events'
import { LOG_LEVEL_STYLES, formatJsonData } from '@/lib/workflow/debug-events'

export interface DebugLogViewerProps {
  /** 日志列表 */
  logs: DebugLogData[]
  /** 是否正在执行 */
  isRunning: boolean
  /** 当前状态 */
  status: DebugStatus
  /** 是否自动滚动（默认 true） */
  autoScroll?: boolean
  /** 复制回调 */
  onCopy?: () => void
  /** 自定义类名 */
  className?: string
}

/**
 * 格式化时间戳为本地时间字符串
 */
function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * 单条日志项组件
 */
function LogItem({ log }: { log: DebugLogData }) {
  const style = LOG_LEVEL_STYLES[log.level]
  const [isDataExpanded, setIsDataExpanded] = useState(false)
  const hasData = log.data !== undefined && log.data !== null

  return (
    <div className={cn('flex gap-2 py-1 px-2 rounded', style.bgColor)}>
      <span className="text-zinc-500 select-none shrink-0 font-mono text-[10px]">
        {formatTimestamp(log.timestamp)}
      </span>
      <span className="select-none shrink-0" title={log.level}>
        {style.icon}
      </span>
      <div className="flex-1 min-w-0">
        {log.step && (
          <span className="text-zinc-400 mr-1">[{log.step}]</span>
        )}
        <span className={cn('break-all whitespace-pre-wrap', style.color)}>
          {log.message}
        </span>
        {hasData && (
          <div className="mt-1">
            <button
              onClick={() => setIsDataExpanded(!isDataExpanded)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {isDataExpanded ? '▼ 收起数据' : '▶ 展开数据'}
            </button>
            {isDataExpanded && (
              <pre className="mt-1 p-2 bg-zinc-900/50 rounded text-[10px] overflow-x-auto text-zinc-400">
                {formatJsonData(log.data)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 调试日志查看器
 */
export function DebugLogViewer({
  logs,
  isRunning,
  status,
  autoScroll = true,
  onCopy,
  className,
}: DebugLogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isUserScrolled, setIsUserScrolled] = useState(false)
  const [copied, setCopied] = useState(false)

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && !isUserScrolled && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll, isUserScrolled])

  // 检测用户是否手动滚动
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    // 如果用户滚动到距离底部 50px 以内，认为是在底部
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setIsUserScrolled(!isAtBottom)
  }, [])

  // 复制日志内容
  const handleCopy = useCallback(() => {
    const logText = logs
      .map((log) => {
        const time = formatTimestamp(log.timestamp)
        const step = log.step ? `[${log.step}] ` : ''
        const data = log.data ? `\n${formatJsonData(log.data)}` : ''
        return `[${time}] ${step}${log.message}${data}`
      })
      .join('\n')

    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onCopy?.()
    })
  }, [logs, onCopy])

  // 渲染状态指示器
  const renderStatusIndicator = () => {
    if (isRunning) {
      return (
        <div className="flex items-center gap-2 text-yellow-400 mt-2 py-1 px-2 bg-yellow-950/30 rounded">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>正在执行...</span>
        </div>
      )
    }

    if (status === 'completed') {
      return (
        <div className="flex items-center gap-2 text-green-400 mt-2 py-1 px-2 bg-green-950/30 rounded">
          <CheckCircle2 className="h-3 w-3" />
          <span>执行完成</span>
        </div>
      )
    }

    if (status === 'failed') {
      return (
        <div className="flex items-center gap-2 text-red-400 mt-2 py-1 px-2 bg-red-950/30 rounded">
          <XCircle className="h-3 w-3" />
          <span>执行失败</span>
        </div>
      )
    }

    return null
  }

  // 空状态
  if (logs.length === 0 && status === 'idle') {
    return (
      <div
        className={cn(
          'rounded-lg border bg-zinc-950 p-4 font-mono text-xs text-zinc-300 min-h-[120px] max-h-[300px] overflow-y-auto shadow-inner',
          className
        )}
      >
        <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic gap-2 min-h-[80px]">
          <Terminal className="h-8 w-8 opacity-20" />
          <span>等待执行...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* 复制按钮 */}
      {logs.length > 0 && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
          title="复制日志"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <Copy className="h-3 w-3 text-zinc-400" />
          )}
        </button>
      )}

      {/* 日志容器 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="rounded-lg border bg-zinc-950 p-3 font-mono text-xs text-zinc-300 min-h-[120px] max-h-[300px] overflow-y-auto shadow-inner scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        <div className="space-y-1">
          {logs.map((log, index) => (
            <LogItem key={`${log.timestamp}-${index}`} log={log} />
          ))}
          {renderStatusIndicator()}
        </div>
      </div>

      {/* 滚动到底部提示 */}
      {isUserScrolled && logs.length > 0 && (
        <button
          onClick={() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight
              setIsUserScrolled(false)
            }
          }}
          className="absolute bottom-4 right-4 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition-colors"
        >
          ↓ 滚动到底部
        </button>
      )}
    </div>
  )
}
