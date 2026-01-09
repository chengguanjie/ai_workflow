'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Cloud,
  CloudOff,
  Loader2,
  AlertTriangle,
  WifiOff,
  Check,
  RefreshCw,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { syncManager, type SyncStatus, type ConflictInfo } from '@/lib/offline'

export type SaveStatusType = 'saved' | 'saving' | 'unsaved' | 'offline' | 'error' | 'conflict'

interface SaveStatusIndicatorProps {
  status: SaveStatusType
  lastSavedAt?: number | null
  errorMessage?: string | null
  onRetry?: () => void
  onResolveConflict?: (resolution: 'local' | 'server') => void
  className?: string
}

const STATUS_CONFIG: Record<
  SaveStatusType,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
    bgColor: string
    animate?: boolean
  }
> = {
  saved: {
    icon: Cloud,
    label: '已保存',
    color: 'text-green-500',
    bgColor: 'bg-green-50',
  },
  saving: {
    icon: Loader2,
    label: '保存中...',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    animate: true,
  },
  unsaved: {
    icon: CloudOff,
    label: '有未保存的更改',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
  },
  offline: {
    icon: WifiOff,
    label: '离线模式',
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
  },
  error: {
    icon: AlertTriangle,
    label: '保存失败',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  },
  conflict: {
    icon: AlertTriangle,
    label: '版本冲突',
    color: 'text-amber-500',
    bgColor: 'bg-amber-50',
  },
}

function formatLastSaved(timestamp: number | null | undefined): string {
  if (!timestamp) return ''

  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) {
    return '刚刚保存'
  }

  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return `${minutes} 分钟前保存`
  }

  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} 小时前保存`
  }

  const date = new Date(timestamp)
  return `${date.toLocaleDateString()} 保存`
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
  onResolveConflict,
  className,
}: SaveStatusIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true)
  const [_syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [formattedTime, setFormattedTime] = useState('')

  // 监听网络状态
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      window.addEventListener('online', updateOnlineStatus)
      window.addEventListener('offline', updateOnlineStatus)

      return () => {
        window.removeEventListener('online', updateOnlineStatus)
        window.removeEventListener('offline', updateOnlineStatus)
      }
    }
  }, [])

  // 监听同步管理器状态
  useEffect(() => {
    const unsubscribeStatus = syncManager.on('statusChange', (data) => {
      const eventData = data as { status?: SyncStatus; online?: boolean }
      if (eventData.status) {
        setSyncStatus(eventData.status)
      }
      if (typeof eventData.online === 'boolean') {
        setIsOnline(eventData.online)
      }
    })

    const unsubscribeConflict = syncManager.on('conflict', (data) => {
      setConflict(data as ConflictInfo)
    })

    return () => {
      unsubscribeStatus()
      unsubscribeConflict()
    }
  }, [])

  // 定期更新时间显示
  useEffect(() => {
    setFormattedTime(formatLastSaved(lastSavedAt))

    const interval = setInterval(() => {
      setFormattedTime(formatLastSaved(lastSavedAt))
    }, 60000)

    return () => clearInterval(interval)
  }, [lastSavedAt])

  // 计算实际显示状态
  const displayStatus: SaveStatusType = !isOnline ? 'offline' : conflict ? 'conflict' : status

  const config = STATUS_CONFIG[displayStatus]
  const Icon = config.icon

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry()
    } else if (!isOnline) {
      // 尝试重新连接
      syncManager.syncPendingChanges()
    }
  }, [onRetry, isOnline])

  const handleResolveLocal = useCallback(() => {
    if (onResolveConflict) {
      onResolveConflict('local')
    }
    setConflict(null)
  }, [onResolveConflict])

  const handleResolveServer = useCallback(() => {
    if (onResolveConflict) {
      onResolveConflict('server')
    }
    setConflict(null)
  }, [onResolveConflict])

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('flex items-center gap-2', className)}>
        {/* 主状态指示器 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                config.bgColor,
                config.color
              )}
            >
              <Icon
                className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')}
              />
              <span>{config.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">{config.label}</p>
              {formattedTime && displayStatus === 'saved' && (
                <p className="text-xs text-muted-foreground">{formattedTime}</p>
              )}
              {displayStatus === 'offline' && (
                <p className="text-xs text-muted-foreground">
                  更改将在恢复网络后自动同步
                </p>
              )}
              {displayStatus === 'error' && errorMessage && (
                <p className="text-xs text-muted-foreground break-words">
                  {errorMessage}
                </p>
              )}
              {displayStatus === 'conflict' && (
                <p className="text-xs text-muted-foreground">
                  检测到版本冲突，请选择保留哪个版本
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* 重试按钮 */}
        {(displayStatus === 'error' || displayStatus === 'offline') && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRetry}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重试同步</TooltipContent>
          </Tooltip>
        )}

        {/* 冲突解决按钮 */}
        {displayStatus === 'conflict' && onResolveConflict && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={handleResolveLocal}
                >
                  <Check className="h-3 w-3" />
                  保留本地
                </Button>
              </TooltipTrigger>
              <TooltipContent>使用本地版本覆盖服务器</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={handleResolveServer}
                >
                  <Cloud className="h-3 w-3" />
                  使用服务器
                </Button>
              </TooltipTrigger>
              <TooltipContent>放弃本地更改，使用服务器版本</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
