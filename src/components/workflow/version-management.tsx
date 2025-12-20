'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  GitBranch,
  ChevronDown,
  Plus,
  History,
  RotateCcw,
  GitCompare,
  Loader2,
  Check,
  Star,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

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

interface VersionManagementProps {
  workflowId: string
  onVersionChange?: () => void
}

export function VersionManagement({ workflowId, onVersionChange }: VersionManagementProps) {
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [showCompareDialog, setShowCompareDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <GitBranch className="h-4 w-4" />
            版本管理
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setShowCommitDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            提交新版本
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowHistoryPanel(true)}>
            <History className="mr-2 h-4 w-4" />
            版本历史
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowCompareDialog(true)}>
            <GitCompare className="mr-2 h-4 w-4" />
            版本对比
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 提交版本对话框 */}
      <CommitVersionDialog
        workflowId={workflowId}
        open={showCommitDialog}
        onOpenChange={setShowCommitDialog}
        onSuccess={() => {
          setShowCommitDialog(false)
          onVersionChange?.()
        }}
      />

      {/* 版本历史面板 */}
      <VersionHistoryPanel
        workflowId={workflowId}
        open={showHistoryPanel}
        onOpenChange={setShowHistoryPanel}
        onRollback={() => {
          setShowHistoryPanel(false)
          onVersionChange?.()
        }}
      />

      {/* 版本对比对话框 */}
      <VersionCompareDialog
        workflowId={workflowId}
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
      />
    </>
  )
}

// ============================================
// 提交版本对话框
// ============================================

interface CommitVersionDialogProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function CommitVersionDialog({
  workflowId,
  open,
  onOpenChange,
  onSuccess,
}: CommitVersionDialogProps) {
  const [versionTag, setVersionTag] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [publish, setPublish] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!commitMessage.trim()) {
      toast.error('请输入提交说明')
      return
    }

    setIsSubmitting(true)
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
        const error = await response.json()
        throw new Error(error.error || '提交失败')
      }

      toast.success('版本已提交')
      setVersionTag('')
      setCommitMessage('')
      setPublish(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// 版本历史面板
// ============================================

interface VersionHistoryPanelProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRollback: () => void
}

function VersionHistoryPanel({
  workflowId,
  open,
  onOpenChange,
  onRollback,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [isRollingBack, setIsRollingBack] = useState(false)

  // 加载版本列表
  const loadVersions = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/versions`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setVersions(result.data.versions || [])
    } catch (error) {
      toast.error('加载版本历史失败')
    } finally {
      setIsLoading(false)
    }
  }, [workflowId])

  // 面板打开时加载
  useEffect(() => {
    if (open) {
      loadVersions()
    }
  }, [open, loadVersions])

  // 回滚到指定版本
  const handleRollback = async (versionId: string) => {
    setIsRollingBack(true)
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
        const error = await response.json()
        throw new Error(error.error || '回滚失败')
      }

      toast.success('已回滚到指定版本')
      onRollback()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回滚失败')
    } finally {
      setIsRollingBack(false)
    }
  }

  // 发布版本
  const handlePublish = async (versionId: string) => {
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/versions/${versionId}/publish`,
        { method: 'POST' }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '发布失败')
      }

      toast.success('版本已发布')
      loadVersions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布失败')
    }
  }

  const getVersionTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      MANUAL: { label: '手动', variant: 'default' },
      AUTO_SAVE: { label: '自动', variant: 'secondary' },
      OPTIMIZATION: { label: 'AI优化', variant: 'outline' },
      ROLLBACK: { label: '回滚', variant: 'secondary' },
    }
    return labels[type] || { label: type, variant: 'default' }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>版本历史</SheetTitle>
          <SheetDescription>
            查看和管理工作流的历史版本
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">暂无版本记录</p>
              <p className="text-xs text-muted-foreground mt-1">
                点击「提交新版本」创建第一个版本
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-4 pr-4">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      version.isActive
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {version.versionTag || `v${version.versionNumber}`}
                          </span>
                          {version.isActive && (
                            <Badge variant="default" className="text-xs">
                              当前
                            </Badge>
                          )}
                          <Badge variant={getVersionTypeLabel(version.versionType).variant} className="text-xs">
                            {getVersionTypeLabel(version.versionType).label}
                          </Badge>
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
                          {version.successRate !== null && (
                            <span>成功率 {(version.successRate * 100).toFixed(0)}%</span>
                          )}
                          {version.avgRating !== null && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {version.avgRating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!version.isActive && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePublish(version.id)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              发布
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRollback(version.id)}
                              disabled={isRollingBack}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              回滚
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ============================================
// 版本对比对话框
// ============================================

interface VersionCompareDialogProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function VersionCompareDialog({
  workflowId,
  open,
  onOpenChange,
}: VersionCompareDialogProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
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
  const [isLoading, setIsLoading] = useState(false)
  const [isComparing, setIsComparing] = useState(false)

  // 加载版本列表
  const loadVersions = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/versions?limit=50`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setVersions(result.data.versions || [])
    } catch (error) {
      toast.error('加载版本列表失败')
    } finally {
      setIsLoading(false)
    }
  }, [workflowId])

  // 对话框打开时加载版本列表
  useEffect(() => {
    if (open) {
      loadVersions()
    }
  }, [open, loadVersions])

  // 执行对比
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
    } catch (error) {
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

              {comparison.comparison.nodesAdded.length > 0 && (
                <div className="mt-3">
                  <Badge variant="default" className="mb-1">
                    +{comparison.comparison.nodesAdded.length} 个新节点
                  </Badge>
                </div>
              )}

              {comparison.comparison.nodesRemoved.length > 0 && (
                <div className="mt-2">
                  <Badge variant="destructive" className="mb-1">
                    -{comparison.comparison.nodesRemoved.length} 个删除节点
                  </Badge>
                </div>
              )}

              {comparison.comparison.nodesModified.length > 0 && (
                <div className="mt-2">
                  <Badge variant="secondary" className="mb-1">
                    ~{comparison.comparison.nodesModified.length} 个修改节点
                  </Badge>
                </div>
              )}
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
