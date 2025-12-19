'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  Loader2,
  Copy,
  Check,
  Clock,
  Webhook,
  Calendar,
  MoreVertical,
  Activity,
  AlertTriangle,
  Eye,
  Zap,
  Search,
  Key,
  Play,
  ExternalLink,
  PlayCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface Trigger {
  id: string
  name: string
  type: 'WEBHOOK' | 'SCHEDULE' | 'MANUAL'
  enabled: boolean
  webhookUrl: string | null
  hasSecret: boolean
  cronExpression: string | null
  timezone: string | null
  inputTemplate: Record<string, unknown> | null
  retryOnFail: boolean
  maxRetries: number
  triggerCount: number
  lastTriggeredAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  logsCount: number
  createdAt: string
  updatedAt: string
  workflowId: string
  workflow: { id: string; name: string }
}

interface TriggerDetail extends Trigger {
  recentLogs: TriggerLog[]
  stats: {
    total: number
    success: number
    failed: number
    skipped: number
  }
}

interface TriggerLog {
  id: string
  status: string
  requestMethod: string | null
  requestIp: string | null
  executionId: string | null
  responseCode: number | null
  errorMessage: string | null
  triggeredAt: string
  completedAt: string | null
  duration: number | null
}

export default function TriggersPage() {
  const router = useRouter()
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Detail dialog state
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [selectedTrigger, setSelectedTrigger] = useState<TriggerDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Secret dialog state
  const [showSecretDialog, setShowSecretDialog] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  // Clipboard state
  const [copied, setCopied] = useState<string | null>(null)

  // Manual trigger state
  const [triggering, setTriggering] = useState<string | null>(null)

  // Load all triggers
  const loadTriggers = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/triggers')
      if (res.ok) {
        const data = await res.json()
        setTriggers(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load triggers:', error)
      toast.error('加载触发器列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTriggers()
  }, [loadTriggers])

  // View trigger detail
  const viewTriggerDetail = async (trigger: Trigger) => {
    setLoadingDetail(true)
    setShowDetailDialog(true)

    try {
      const res = await fetch(
        `/api/workflows/${trigger.workflowId}/triggers/${trigger.id}`
      )
      if (res.ok) {
        const data = await res.json()
        setSelectedTrigger(data.data)
      }
    } catch (error) {
      console.error('Failed to load trigger detail:', error)
      toast.error('加载触发器详情失败')
    } finally {
      setLoadingDetail(false)
    }
  }

  // Regenerate webhook secret
  const regenerateSecret = async (trigger: Trigger) => {
    setRegenerating(true)
    try {
      const res = await fetch(
        `/api/workflows/${trigger.workflowId}/triggers/${trigger.id}/regenerate-secret`,
        { method: 'POST' }
      )

      if (!res.ok) {
        throw new Error('重新生成失败')
      }

      const data = await res.json()
      setNewSecret(data.data?.webhookSecret)
      setShowSecretDialog(true)
      toast.success('密钥已重新生成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重新生成失败')
    } finally {
      setRegenerating(false)
    }
  }

  // Toggle trigger enabled
  const toggleEnabled = async (trigger: Trigger) => {
    try {
      const res = await fetch(
        `/api/workflows/${trigger.workflowId}/triggers/${trigger.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !trigger.enabled }),
        }
      )

      if (!res.ok) {
        throw new Error('更新失败')
      }

      toast.success(trigger.enabled ? '触发器已禁用' : '触发器已启用')
      loadTriggers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败')
    }
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    toast.success(`已复制 ${label}`)
    setTimeout(() => setCopied(null), 2000)
  }

  // Manual trigger for schedule triggers
  const triggerNow = async (trigger: Trigger) => {
    if (trigger.type !== 'SCHEDULE') return

    setTriggering(trigger.id)
    try {
      const res = await fetch(
        `/api/workflows/${trigger.workflowId}/triggers/${trigger.id}/trigger-now`,
        { method: 'POST' }
      )

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '触发失败')
      }

      toast.success('任务已加入执行队列')
      loadTriggers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '触发失败')
    } finally {
      setTriggering(null)
    }
  }

  // Navigate to workflow editor
  const goToWorkflow = (workflowId: string) => {
    router.push(`/workflows/${workflowId}`)
  }

  // Filter triggers
  const filteredTriggers = triggers.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.workflow.name.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || t.type === typeFilter
    return matchSearch && matchType
  })

  // Get trigger type icon
  const getTriggerIcon = (type: string) => {
    switch (type) {
      case 'WEBHOOK':
        return <Webhook className="h-4 w-4" />
      case 'SCHEDULE':
        return <Calendar className="h-4 w-4" />
      case 'MANUAL':
        return <PlayCircle className="h-4 w-4" />
      default:
        return <Zap className="h-4 w-4" />
    }
  }

  // Get trigger type label
  const getTriggerTypeLabel = (type: string) => {
    switch (type) {
      case 'WEBHOOK':
        return 'Webhook'
      case 'SCHEDULE':
        return '定时任务'
      case 'MANUAL':
        return '手动触发'
      default:
        return type
    }
  }

  // Get status badge
  const getStatusBadge = (trigger: Trigger) => {
    if (!trigger.enabled) {
      return <Badge variant="secondary">已禁用</Badge>
    }
    if (trigger.lastFailureAt && !trigger.lastSuccessAt) {
      return <Badge variant="destructive">执行失败</Badge>
    }
    if (
      trigger.lastFailureAt &&
      trigger.lastSuccessAt &&
      new Date(trigger.lastFailureAt) > new Date(trigger.lastSuccessAt)
    ) {
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-600">
          <AlertTriangle className="mr-1 h-3 w-3" />
          最近失败
        </Badge>
      )
    }
    return <Badge variant="default">正常</Badge>
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">触发器监控</h1>
          <p className="text-muted-foreground">
            查看和管理所有工作流的触发器状态
          </p>
        </div>
      </div>

      {/* Search and filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索触发器或工作流名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="触发类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="MANUAL">手动触发</SelectItem>
            <SelectItem value="WEBHOOK">Webhook</SelectItem>
            <SelectItem value="SCHEDULE">定时任务</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Triggers list */}
      {filteredTriggers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-muted-foreground">
              {search || typeFilter !== 'all'
                ? '没有找到匹配的触发器'
                : '还没有配置任何触发器'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              在工作流画布中添加触发器节点来配置触发器
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTriggers.map((trigger) => (
            <Card key={trigger.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      {getTriggerIcon(trigger.type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{trigger.name}</span>
                        <Badge variant="outline">
                          {getTriggerTypeLabel(trigger.type)}
                        </Badge>
                        {getStatusBadge(trigger)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {/* Workflow name */}
                        <button
                          onClick={() => goToWorkflow(trigger.workflowId)}
                          className="flex items-center gap-1 hover:text-foreground hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {trigger.workflow.name}
                        </button>
                        {trigger.type === 'WEBHOOK' && trigger.webhookUrl && (
                          <span
                            className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                            onClick={() =>
                              copyToClipboard(trigger.webhookUrl!, 'Webhook URL')
                            }
                          >
                            <Webhook className="h-3 w-3" />
                            <code className="text-xs">
                              {trigger.webhookUrl.split('/').pop()}
                            </code>
                            {copied === 'Webhook URL' ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </span>
                        )}
                        {trigger.type === 'SCHEDULE' && trigger.cronExpression && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <code className="text-xs">{trigger.cronExpression}</code>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {trigger.triggerCount} 次触发
                        </span>
                        {trigger.lastTriggeredAt && (
                          <span>
                            最近:{' '}
                            {formatDistanceToNow(new Date(trigger.lastTriggeredAt), {
                              locale: zhCN,
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={trigger.enabled}
                      onCheckedChange={() => toggleEnabled(trigger)}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => viewTriggerDetail(trigger)}>
                          <Eye className="mr-2 h-4 w-4" />
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => goToWorkflow(trigger.workflowId)}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          编辑工作流
                        </DropdownMenuItem>
                        {trigger.type === 'SCHEDULE' && trigger.enabled && (
                          <DropdownMenuItem
                            onClick={() => triggerNow(trigger)}
                            disabled={triggering === trigger.id}
                          >
                            {triggering === trigger.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            立即执行
                          </DropdownMenuItem>
                        )}
                        {trigger.type === 'WEBHOOK' && (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                trigger.webhookUrl &&
                                copyToClipboard(trigger.webhookUrl, 'Webhook URL')
                              }
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              复制 URL
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => regenerateSecret(trigger)}
                              disabled={regenerating}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              重新生成密钥
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Trigger detail dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>触发器详情</DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedTrigger ? (
            <div className="space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">名称</Label>
                  <p className="font-medium">{selectedTrigger.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">类型</Label>
                  <p className="font-medium flex items-center gap-2">
                    {getTriggerIcon(selectedTrigger.type)}
                    {getTriggerTypeLabel(selectedTrigger.type)}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">所属工作流</Label>
                  <button
                    onClick={() => goToWorkflow(selectedTrigger.workflowId)}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {selectedTrigger.workflow.name}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div>
                  <Label className="text-muted-foreground">状态</Label>
                  <p>{getStatusBadge(selectedTrigger)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">触发次数</Label>
                  <p className="font-medium">{selectedTrigger.triggerCount} 次</p>
                </div>
              </div>

              {/* Webhook specific */}
              {selectedTrigger.type === 'WEBHOOK' && selectedTrigger.webhookUrl && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Webhook URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all">
                      {selectedTrigger.webhookUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(selectedTrigger.webhookUrl!, 'URL')
                      }
                    >
                      {copied === 'URL' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {selectedTrigger.hasSecret && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Key className="h-3 w-3" />
                      已配置签名密钥
                    </p>
                  )}
                </div>
              )}

              {/* Schedule specific */}
              {selectedTrigger.type === 'SCHEDULE' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Cron 表达式</Label>
                    <code className="block bg-muted px-3 py-2 rounded text-sm">
                      {selectedTrigger.cronExpression}
                    </code>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">时区</Label>
                    <p className="font-medium">{selectedTrigger.timezone}</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              {selectedTrigger.stats && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">执行统计</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">
                          {selectedTrigger.stats.total}
                        </p>
                        <p className="text-sm text-muted-foreground">总计</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {selectedTrigger.stats.success}
                        </p>
                        <p className="text-sm text-muted-foreground">成功</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-600">
                          {selectedTrigger.stats.failed}
                        </p>
                        <p className="text-sm text-muted-foreground">失败</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-500">
                          {selectedTrigger.stats.skipped}
                        </p>
                        <p className="text-sm text-muted-foreground">跳过</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent logs */}
              {selectedTrigger.recentLogs && selectedTrigger.recentLogs.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">最近触发记录</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedTrigger.recentLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={
                                log.status === 'SUCCESS'
                                  ? 'default'
                                  : log.status === 'FAILED'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {log.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(log.triggeredAt), {
                                locale: zhCN,
                                addSuffix: true,
                              })}
                            </span>
                            {log.duration && (
                              <span className="text-sm text-muted-foreground">
                                {log.duration}ms
                              </span>
                            )}
                          </div>
                          {log.errorMessage && (
                            <span className="text-sm text-destructive truncate max-w-[200px]">
                              {log.errorMessage}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Edit workflow button */}
              <div className="flex justify-end">
                <Button onClick={() => goToWorkflow(selectedTrigger.workflowId)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  编辑工作流
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Webhook secret dialog */}
      <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook 签名密钥</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-destructive font-medium">
              请立即复制此密钥，它只会显示一次！
            </p>
            <div className="space-y-2">
              <Label>密钥</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                  {newSecret}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newSecret && copyToClipboard(newSecret, '密钥')}
                >
                  {copied === '密钥' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg text-sm">
              <p className="font-medium">签名验证说明</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>
                  请求头中添加 <code>X-Webhook-Signature</code>
                </li>
                <li>使用 HMAC-SHA256 对请求体签名</li>
                <li>
                  签名格式: <code>sha256=&lt;hex_digest&gt;</code>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowSecretDialog(false)}>我已保存密钥</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
