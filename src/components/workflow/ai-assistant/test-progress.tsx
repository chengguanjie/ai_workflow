"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Circle, XCircle, Loader2, Play, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NodeResultData } from "@/stores/ai-assistant-store"
import { toast } from "sonner"

interface TestProgressProps {
  nodeResults: NodeResultData[]
  isRunning: boolean
  totalDuration?: number
  className?: string
}

export function TestProgress({ 
  nodeResults, 
  isRunning, 
  totalDuration,
  className 
}: TestProgressProps) {
  const completedCount = nodeResults.filter(n => n.status === 'success' || n.status === 'error').length
  const progress = nodeResults.length > 0 ? (completedCount / nodeResults.length) * 100 : 0
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const hasAnyOutput = useMemo(
    () => nodeResults.some((node) => !!node.output || !!node.error),
    [nodeResults],
  )

  const handleCopyAll = async () => {
    try {
      const payload = nodeResults.reduce<Record<string, unknown>>((acc, node) => {
        if (node.output !== undefined) {
          acc[node.nodeId] = node.output
        } else if (node.error) {
          acc[node.nodeId] = { error: node.error }
        }
        return acc
      }, {})
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      toast.success("已复制全部节点输出")
    } catch {
      toast.error("复制失败")
    }
  }

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            ) : (
              <Play className="h-4 w-4 text-primary" />
            )}
            <span className="text-sm font-medium">
              {isRunning ? '正在执行测试...' : '测试执行'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyOutput && !isRunning && (
              <button
                type="button"
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <Copy className="h-3 w-3" />
                复制全部
              </button>
            )}
            {totalDuration !== undefined && (
              <span className="text-xs text-muted-foreground">
                {(totalDuration / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        
        {nodeResults.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>执行进度</span>
              <span>{completedCount} / {nodeResults.length}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-300",
                  nodeResults.some(n => n.status === 'error')
                    ? "bg-destructive"
                    : "bg-green-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
        {nodeResults.map((node, index) => (
          <div 
            key={node.nodeId}
            className={cn(
              "flex items-start gap-3 p-2 rounded-lg transition-colors",
              node.status === 'running' && "bg-primary/5 border border-primary/20",
              node.status === 'success' && "bg-green-500/5",
              node.status === 'error' && "bg-destructive/5"
            )}
          >
            <div className="mt-0.5">
              {node.status === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {node.status === 'error' && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              {node.status === 'running' && (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              )}
              {node.status === 'pending' && (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 text-left",
                  (node.output || node.error) && "hover:opacity-90",
                )}
                onClick={() => {
                  if (!node.output && !node.error) return
                  setExpanded((prev) => ({ ...prev, [node.nodeId]: !prev[node.nodeId] }))
                }}
              >
                <p
                  className={cn(
                    "text-sm truncate",
                    node.status === "running" && "font-medium",
                  )}
                >
                  {node.nodeName}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {node.duration !== undefined && node.duration > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {(node.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                  {(node.output || node.error) && (
                    expanded[node.nodeId] ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )
                  )}
                </div>
              </button>
              
              {node.error && (
                <p className="text-xs text-destructive mt-1 line-clamp-2">{node.error}</p>
              )}
              
              {node.status === 'success' && node.promptTokens !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">
                  Tokens: {node.promptTokens} + {node.completionTokens}
                </p>
              )}

              {expanded[node.nodeId] && (node.output || node.error) && (
                <div className="mt-2 rounded-md border bg-muted/30 p-2">
                  {node.output && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">输出</span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(JSON.stringify(node.output, null, 2))
                            toast.success("已复制节点输出")
                          } catch {
                            toast.error("复制失败")
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        复制
                      </button>
                    </div>
                  )}
                  {node.output && (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {JSON.stringify(node.output, null, 2)}
                    </pre>
                  )}
                  {!node.output && node.error && (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive">
                      {node.error}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
