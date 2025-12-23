'use client'

/**
 * 正在执行区域组件
 * 
 * 显示运行中（RUNNING/PENDING）的执行记录
 * - 卡片式展示
 * - 运行数量指示器
 * - 实时更新已用时间
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Loader2,
  Clock,
  ExternalLink,
  Play,
  Zap,
} from 'lucide-react'
import type { Execution } from '@/lib/execution/categorize'
import { calculateElapsedTime, formatElapsedTime } from '@/lib/execution/categorize'

interface RunningSectionProps {
  /** 运行中的执行记录列表 */
  executions: Execution[]
  /** 是否正在加载 */
  isLoading?: boolean
  /** 点击执行记录时的回调 */
  onExecutionClick?: (execution: Execution) => void
}

/**
 * 单个运行中执行记录卡片
 */
function RunningExecutionCard({ 
  execution,
  onExecutionClick,
}: { 
  execution: Execution
  onExecutionClick?: (execution: Execution) => void
}) {
  const [elapsedTime, setElapsedTime] = useState(() => calculateElapsedTime(execution))

  // 每秒更新已用时间
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(calculateElapsedTime(execution))
    }, 1000)

    return () => clearInterval(interval)
  }, [execution])

  const getStatusIcon = () => {
    if (execution.status === 'RUNNING') {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    }
    return <Clock className="h-4 w-4 text-yellow-500" />
  }

  const getStatusText = () => {
    return execution.status === 'RUNNING' ? '执行中' : '等待中'
  }

  const getStatusBadgeVariant = () => {
    return execution.status === 'RUNNING' ? 'default' : 'secondary'
  }

  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/workflows/${execution.workflowId}`}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {execution.workflowName}
                </Link>
                <Badge variant={getStatusBadgeVariant()} className="text-xs">
                  {getStatusText()}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  已用时间: {formatElapsedTime(elapsedTime)}
                </span>
                {execution.totalTokens > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {execution.totalTokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link href={`/executions/${execution.id}`}>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onExecutionClick?.(execution)}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * 正在执行区域组件
 */
export function RunningSection({
  executions,
  isLoading = false,
  onExecutionClick,
}: RunningSectionProps) {
  // 如果没有运行中的执行且不在加载中，不显示此区域
  if (!isLoading && executions.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <Card className="border-2 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">正在执行</CardTitle>
              {executions.length > 0 && (
                <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
                  {executions.length}
                </Badge>
              )}
            </div>
            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading && executions.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {executions.map((execution) => (
                <RunningExecutionCard
                  key={execution.id}
                  execution={execution}
                  onExecutionClick={onExecutionClick}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * 获取运行中执行记录的数量
 * 用于外部组件显示运行数量指示器
 */
export function getRunningCount(executions: Execution[]): number {
  return executions.length
}

export default RunningSection
