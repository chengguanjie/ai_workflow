'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ChevronDown,
  Upload,
  Play,
  GitCompare,
  History,
  Plus,
  Undo2,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CircleDot,
  Star,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

// 类型定义
type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'DRAFT_MODIFIED'

interface PublishInfo {
  hasUnpublishedChanges: boolean
  publishStatus: PublishStatus
  publishedAt: string | null
  publishedBy: string | null
}

interface WorkflowVersion {
  id: string
  versionNumber: number
  versionTag: string | null
  commitMessage: string
  versionType: 'MANUAL' | 'AUTO_SAVE' | 'OPTIMIZATION' | 'ROLLBACK'
  isPublished: boolean
  isActive: boolean
  executionCount: number
  successRate: number | null
  avgRating: number | null
  createdAt: string
  createdById: string
}

interface UnifiedVersionControlProps {
  workflowId: string
  onVersionChange?: () => void
  onTestExecute?: () => void
}

export function UnifiedVersionControl({
  workflowId,
  onVersionChange,
  onTestExecute,
}: UnifiedVersionControlProps) {
  // 状态管理
  const [publishInfo, setPublishInfo] = useState<PublishInfo | null>(null)
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)

  // 对话框状态
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [showCompareDialog, setShowCompareDialog] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  // 提交版本表单
  const [versionTag, setVersionTag] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [publish, setPublish] = useState(false)

  // 加载发布状态
  const loadPublishInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/publish`)
      if (!response.ok) throw new Error('加载发布状态失败')
      const result = await response.json()
      setPublishInfo(result.data)
    } catch (error) {
      console.error('Failed to load publish info:', error)
    } finally {
      setIsLoading(false)
    }
  }, [workflowId])

  // 加载版本列表
  const loadVersions = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/versions`)
      if (!response.ok) throw new Error('加载版本历史失败')
      const result = await response.json()
      setVersions(result.data.versions || [])
    } catch (_error) {
      toast.error('加载版本历史失败')
    }
  }, [workflowId])

  // 初始加载
  useEffect(() => {
    loadPublishInfo()
  }, [loadPublishInfo])

  // 监听保存事件
  useEffect(() => {
    const handleSaveComplete = () => {
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
        const errorData = await response.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '发布失败'
        throw new Error(errorMessage)
      }

      toast.success('工作流已发布到生产环境')
      await loadPublishInfo()
      onVersionChange?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布失败')
    } finally {
      setIsPublishing(false)
    }
  }

  // 提交新版本
  const handleCommitVersion = async () => {
    if (!commitMessage.trim()) {
      toast.error('请输入提交说明')
      return
    }

    setIsPublishing(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionTag: versionTag || undefined,
          commitMessage,
          publish,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '提交失败'
        throw new Error(errorMessage)
      }

      toast.success('版本已提交')
      setVersionTag('')
      setCommitMessage('')
      setPublish(false)
      setShowCommitDialog(false)
      onVersionChange?.()
      loadPublishInfo()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败')
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
        const errorData = await response.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '丢弃草稿失败'
        throw new Error(errorMessage)
      }

      toast.success('草稿已丢弃，已恢复到已发布版本')
      setShowDiscardDialog(false)
      await loadPublishInfo()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '丢弃草稿失败')
    } finally {
      setIsDiscarding(false)
    }
  }

  // 回滚到指定版本
  const handleRollback = async (versionId: string) => {
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/versions/${versionId}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '回滚失败'
        throw new Error(errorMessage)
      }

      toast.success('已回滚到指定版本')
      setShowHistoryPanel(false)
      onVersionChange?.()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回滚失败')
    }
  }

  // 获取状态信息
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
        <DropdownMenuContent align="end" className="w-64">
          {/* 状态描述 */}
          {statusInfo.description && (
            <>
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                <div className="flex items-center gap-2 mb-1">
                  <StatusIcon className={`h-3.5 w-3.5 ${statusInfo.color}`} />
                  {statusInfo.description}
                </div>
                {publishInfo?.publishedAt && (
                  <div className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    上次发布: {formatDistanceToNow(new Date(publishInfo.publishedAt), {
                      addSuffix: true,
                      locale: zhCN,
                    })}
                  </div>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}

          {/* 草稿与测试 */}
          <DropdownMenuLabel className="text-xs">草稿与测试</DropdownMenuLabel>

          {/* 发布到生产环境 */}
          <DropdownMenuItem
            onClick={handlePublish}
            disabled={isPublishing || publishInfo?.publishStatus === 'PUBLISHED'}
          >
            <Upload className="mr-2 h-4 w-4" />
            发布到生产环境
            {publishInfo?.publishStatus === 'PUBLISHED' && (
              <Badge variant="secondary" className="ml-auto text-xs">已同步</Badge>
            )}
          </DropdownMenuItem>

          {/* 测试执行（草稿） */}
          <DropdownMenuItem onClick={onTestExecute}>
            <Play className="mr-2 h-4 w-4" />
            测试执行 (草稿)
          </DropdownMenuItem>


          {/* 丢弃草稿更改 */}
          {publishInfo?.publishStatus === 'DRAFT_MODIFIED' && (
            <DropdownMenuItem
              onClick={() => setShowDiscardDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Undo2 className="mr-2 h-4 w-4" />
              丢弃草稿更改
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* 版本历史管理 */}
          <DropdownMenuLabel className="text-xs">版本管理</DropdownMenuLabel>

          {/* 提交新版本 */}
          <DropdownMenuItem onClick={() => setShowCommitDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            提交新版本
          </DropdownMenuItem>

          {/* 版本历史 */}
          <DropdownMenuItem
            onClick={() => {
              loadVersions()
              setShowHistoryPanel(true)
            }}
          >
            <History className="mr-2 h-4 w-4" />
            版本历史
          </DropdownMenuItem>

          {/* 版本对比 */}
          <DropdownMenuItem
            onClick={() => {
              loadVersions()
              setShowCompareDialog(true)
            }}
          >
            <GitCompare className="mr-2 h-4 w-4" />
            对比历史版本
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 提交版本对话框 */}
      <Dialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>提交新版本</DialogTitle>
            <DialogDescription>
              保存当前工作流配置为新版本，便于后续回滚和追踪
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="versionTag">版本标签（可选）</Label>
              <Input
                id="versionTag"
                placeholder="如 v1.0.0"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commitMessage">提交说明 *</Label>
              <Textarea
                id="commitMessage"
                placeholder="请描述本次修改的内容..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="publish"
                checked={publish}
                onCheckedChange={(checked) => setPublish(checked as boolean)}
              />
              <Label htmlFor="publish" className="text-sm font-normal">
                发布此版本（使其成为活跃版本）
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommitDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCommitVersion} disabled={isPublishing}>
              {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 版本历史面板 */}
      <Sheet open={showHistoryPanel} onOpenChange={setShowHistoryPanel}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>版本历史</SheetTitle>
            <SheetDescription>
              查看和管理工作流的历史版本
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="mt-6 h-[calc(100vh-200px)]">
            <div className="space-y-4 pr-4">
              {versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">暂无版本记录</p>
                </div>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.id}
                    className={`rounded-lg border p-4 transition-colors ${version.isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {version.versionTag || `v${version.versionNumber}`}
                          </span>
                          {version.isActive && (
                            <Badge variant="default" className="text-xs">当前</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {version.commitMessage}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(version.createdAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })}
                          </span>
                          {version.executionCount > 0 && (
                            <span>执行 {version.executionCount} 次</span>
                          )}
                          {version.avgRating !== null && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {version.avgRating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      {!version.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRollback(version.id)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          回滚
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* 版本对比对话框 */}
      <VersionCompareDialog
        workflowId={workflowId}
        versions={versions}
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
      />

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

    </>
  )
}

// 版本对比对话框组件
interface VersionCompareDialogProps {
  workflowId: string
  versions: WorkflowVersion[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function VersionCompareDialog({
  workflowId,
  versions,
  open,
  onOpenChange,
}: VersionCompareDialogProps) {
  const [fromVersion, setFromVersion] = useState('')
  const [toVersion, setToVersion] = useState('')
  const [comparison, setComparison] = useState<{
    comparison: {
      nodesAdded: unknown[]
      nodesRemoved: unknown[]
      nodesModified: unknown[]
      edgesAdded: unknown[]
      edgesRemoved: unknown[]
    }
    summaryText: string
  } | null>(null)
  const [isComparing, setIsComparing] = useState(false)

  const handleCompare = async () => {
    if (!fromVersion || !toVersion) {
      toast.error('请选择要对比的两个版本')
      return
    }

    setIsComparing(true)
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/versions/compare?from=${fromVersion}&to=${toVersion}`
      )
      if (!response.ok) throw new Error('对比失败')
      const result = await response.json()
      setComparison(result.data)
    } catch (_error) {
      toast.error('版本对比失败')
    } finally {
      setIsComparing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>版本对比</DialogTitle>
          <DialogDescription>
            选择两个版本进行差异对比
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>基准版本</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={fromVersion}
                onChange={(e) => setFromVersion(e.target.value)}
              >
                <option value="">选择版本</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionTag || `v${v.versionNumber}`}
                    {v.isActive && ' (当前)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>对比版本</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={toVersion}
                onChange={(e) => setToVersion(e.target.value)}
              >
                <option value="">选择版本</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionTag || `v${v.versionNumber}`}
                    {v.isActive && ' (当前)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={handleCompare} disabled={isComparing}>
            {isComparing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <GitCompare className="mr-2 h-4 w-4" />
            开始对比
          </Button>

          {comparison && (
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-2">变更摘要</h4>
              <p className="text-sm text-muted-foreground">{comparison.summaryText}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {comparison.comparison.nodesAdded.length > 0 && (
                  <Badge variant="default">
                    +{comparison.comparison.nodesAdded.length} 个新节点
                  </Badge>
                )}
                {comparison.comparison.nodesRemoved.length > 0 && (
                  <Badge variant="destructive">
                    -{comparison.comparison.nodesRemoved.length} 个删除节点
                  </Badge>
                )}
                {comparison.comparison.nodesModified.length > 0 && (
                  <Badge variant="secondary">
                    ~{comparison.comparison.nodesModified.length} 个修改节点
                  </Badge>
                )}
                {comparison.comparison.edgesAdded.length > 0 && (
                  <Badge variant="outline">
                    +{comparison.comparison.edgesAdded.length} 条新连接
                  </Badge>
                )}
                {comparison.comparison.edgesRemoved.length > 0 && (
                  <Badge variant="outline">
                    -{comparison.comparison.edgesRemoved.length} 条删除连接
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}