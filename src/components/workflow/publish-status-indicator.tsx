'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  Upload,
  Undo2,
  Play,
  Loader2,
  CircleDot,
  CheckCircle2,
  AlertCircle,
  GitCompare,
} from 'lucide-react'
import { toast } from 'sonner'
import { VersionComparisonViewer } from './version-comparison-viewer'

type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'DRAFT_MODIFIED'

interface PublishStatusIndicatorProps {
  workflowId: string
  onPublish?: () => void
  onTestExecute?: () => void
}

interface PublishInfo {
  hasUnpublishedChanges: boolean
  publishStatus: PublishStatus
  publishedAt: string | null
  publishedBy: string | null
}

export function PublishStatusIndicator({
  workflowId,
  onPublish,
  onTestExecute,
}: PublishStatusIndicatorProps) {
  const [publishInfo, setPublishInfo] = useState<PublishInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [showComparisonViewer, setShowComparisonViewer] = useState(false)

  // 加载发布状态
  const loadPublishInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/publish`)
      if (!response.ok) {
        throw new Error('加载发布状态失败')
      }
      const result = await response.json()
      setPublishInfo(result.data)
    } catch (error) {
      console.error('Failed to load publish info:', error)
    } finally {
      setIsLoading(false)
    }
  }, [workflowId])

  // 初始加载
  useEffect(() => {
    loadPublishInfo()
  }, [loadPublishInfo])

  // 监听保存事件，更新发布状态
  useEffect(() => {
    const handleSaveComplete = () => {
      // 延迟一下确保数据库已更新
      setTimeout(() => {
        loadPublishInfo()
      }, 500)
    }

    window.addEventListener('workflow-saved', handleSaveComplete)
    return () => {
      window.removeEventListener('workflow-saved', handleSaveComplete)
    }
  }, [loadPublishInfo])

  // 发布到生产环境
  const handlePublish = async () => {
    setIsPublishing(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commitMessage: '发布到生产环境',
          createVersion: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '发布失败')
      }

      toast.success('工作流已发布到生产环境')
      await loadPublishInfo()
      onPublish?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布失败')
    } finally {
      setIsPublishing(false)
    }
  }

  // 丢弃草稿更改
  const handleDiscardDraft = async () => {
    setIsDiscarding(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/publish`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '丢弃草稿失败')
      }

      toast.success('草稿已丢弃，已恢复到已发布版本')
      setShowDiscardDialog(false)
      await loadPublishInfo()
      // 刷新页面以加载恢复后的配置
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '丢弃草稿失败')
    } finally {
      setIsDiscarding(false)
    }
  }

  // 获取状态显示信息
  const getStatusInfo = () => {
    if (!publishInfo) {
      return {
        icon: CircleDot,
        label: '加载中...',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
        variant: 'outline' as const,
      }
    }

    switch (publishInfo.publishStatus) {
      case 'DRAFT':
        return {
          icon: AlertCircle,
          label: '草稿',
          color: 'text-orange-600',
          bgColor: 'bg-orange-100',
          variant: 'outline' as const,
          description: '从未发布',
        }
      case 'PUBLISHED':
        return {
          icon: CheckCircle2,
          label: '已发布',
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          variant: 'outline' as const,
          description: '与生产环境同步',
        }
      case 'DRAFT_MODIFIED':
        return {
          icon: AlertCircle,
          label: '有未发布的更改',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          variant: 'outline' as const,
          description: '草稿与已发布版本不同',
        }
      default:
        return {
          icon: CircleDot,
          label: '未知状态',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          variant: 'outline' as const,
        }
    }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>加载状态...</span>
      </div>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={statusInfo.variant}
            size="sm"
            className={`gap-2 ${publishInfo?.publishStatus === 'DRAFT_MODIFIED' ? 'border-yellow-400' : ''}`}
          >
            <StatusIcon className={`h-4 w-4 ${statusInfo.color}`} />
            <span className={statusInfo.color}>{statusInfo.label}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* 状态描述 */}
          {statusInfo.description && (
            <>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {statusInfo.description}
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* 发布到生产环境 */}
          <DropdownMenuItem
            onClick={handlePublish}
            disabled={isPublishing || publishInfo?.publishStatus === 'PUBLISHED'}
          >
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            发布到生产环境
            {publishInfo?.publishStatus === 'PUBLISHED' && (
              <Badge variant="secondary" className="ml-auto text-xs">
                已同步
              </Badge>
            )}
          </DropdownMenuItem>

          {/* 测试执行 - 使用草稿配置 */}
          <DropdownMenuItem onClick={onTestExecute}>
            <Play className="mr-2 h-4 w-4 text-blue-500" />
            测试执行 (草稿)
          </DropdownMenuItem>

          {/* 查看版本对比 - 仅当有已发布版本时显示 */}
          {publishInfo?.publishStatus !== 'DRAFT' && (
            <DropdownMenuItem onClick={() => setShowComparisonViewer(true)}>
              <GitCompare className="mr-2 h-4 w-4 text-purple-500" />
              查看版本对比
            </DropdownMenuItem>
          )}

          {/* 丢弃草稿更改 - 仅当有未发布更改时显示 */}
          {publishInfo?.publishStatus === 'DRAFT_MODIFIED' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDiscardDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Undo2 className="mr-2 h-4 w-4" />
                丢弃草稿更改
              </DropdownMenuItem>
            </>
          )}

          {/* 发布时间 */}
          {publishInfo?.publishedAt && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                上次发布: {new Date(publishInfo.publishedAt).toLocaleString('zh-CN')}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 丢弃草稿确认对话框 */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认丢弃草稿更改？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将丢弃所有未发布的更改，并恢复到上次发布的版本。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDiscarding}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardDraft}
              disabled={isDiscarding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDiscarding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认丢弃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 版本对比视图 */}
      <VersionComparisonViewer
        workflowId={workflowId}
        open={showComparisonViewer}
        onOpenChange={setShowComparisonViewer}
      />
    </>
  )
}
