"use client"

import { CheckCircle2, Circle, XCircle, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NodeResultData } from "@/stores/ai-assistant-store"

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
          {totalDuration !== undefined && (
            <span className="text-xs text-muted-foreground">
              {(totalDuration / 1000).toFixed(1)}s
            </span>
          )}
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
              <div className="flex items-center justify-between gap-2">
                <p className={cn(
                  "text-sm truncate",
                  node.status === 'running' && "font-medium"
                )}>
                  {node.nodeName}
                </p>
                {node.duration !== undefined && node.duration > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(node.duration / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              
              {node.error && (
                <p className="text-xs text-destructive mt-1 line-clamp-2">{node.error}</p>
              )}
              
              {node.status === 'success' && node.promptTokens !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">
                  Tokens: {node.promptTokens} + {node.completionTokens}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
