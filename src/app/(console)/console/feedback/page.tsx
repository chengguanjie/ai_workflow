'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bug,
  Lightbulb,
  TrendingUp,
  Target,
  MoreHorizontal,
  Building2,
  User,
  Reply,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// 反馈类型配置
const feedbackTypes = {
  BUG: { label: '问题报告', icon: Bug, color: 'text-red-500 bg-red-50' },
  FEATURE: { label: '功能建议', icon: Lightbulb, color: 'text-yellow-600 bg-yellow-50' },
  IMPROVEMENT: { label: '改进建议', icon: TrendingUp, color: 'text-blue-500 bg-blue-50' },
  ACCURACY: { label: '准确率问题', icon: Target, color: 'text-orange-500 bg-orange-50' },
  OTHER: { label: '其他', icon: MoreHorizontal, color: 'text-gray-500 bg-gray-50' },
}

// 反馈状态配置
const feedbackStatuses = {
  PENDING: { label: '待处理', color: 'bg-gray-100 text-gray-800', icon: Clock },
  PROCESSING: { label: '处理中', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  REPLIED: { label: '已回复', color: 'bg-green-100 text-green-800', icon: Reply },
  RESOLVED: { label: '已解决', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  CLOSED: { label: '已关闭', color: 'bg-gray-100 text-gray-600', icon: AlertCircle },
}

// 优先级配置
const priorities = {
  LOW: { label: '低', color: 'bg-gray-100 text-gray-600' },
  NORMAL: { label: '普通', color: 'bg-blue-100 text-blue-600' },
  HIGH: { label: '高', color: 'bg-orange-100 text-orange-600' },
  URGENT: { label: '紧急', color: 'bg-red-100 text-red-600' },
}

// 来源配置
const sources = {
  ENTERPRISE: { label: '企业端', icon: Building2 },
  EMPLOYEE: { label: '员工端', icon: User },
}

interface PlatformFeedback {
  id: string
  type: keyof typeof feedbackTypes
  title: string
  content: string
  source: keyof typeof sources
  status: keyof typeof feedbackStatuses
  priority: keyof typeof priorities
  reply: string | null
  repliedAt: string | null
  resolvedAt: string | null
  createdAt: string
  user: {
    id: string
    name: string | null
    email: string
  }
  organization: {
    id: string
    name: string
  }
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface Stats {
  PENDING: number
  PROCESSING: number
  REPLIED: number
  RESOLVED: number
  CLOSED: number
}

export default function ConsoleFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<PlatformFeedback[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [stats, setStats] = useState<Stats>({
    PENDING: 0,
    PROCESSING: 0,
    REPLIED: 0,
    RESOLVED: 0,
    CLOSED: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')

  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedFeedback, setSelectedFeedback] = useState<PlatformFeedback | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [newStatus, setNewStatus] = useState<string>('')
  const [newPriority, setNewPriority] = useState<string>('')
  const [updating, setUpdating] = useState(false)

  const fetchFeedbacks = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      })

      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/console/platform-feedback?${params}`)
      const data = await response.json()

      if (response.ok) {
        setFeedbacks(data.feedbacks)
        setPagination(data.pagination)
        setStats(data.stats)
      } else {
        toast.error(data.error || '获取反馈列表失败')
      }
    } catch {
      toast.error('获取反馈列表失败')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.pageSize, statusFilter, typeFilter, sourceFilter, priorityFilter, searchQuery])

  useEffect(() => {
    fetchFeedbacks()
  }, [fetchFeedbacks])

  const handleOpenDetail = (feedback: PlatformFeedback) => {
    setSelectedFeedback(feedback)
    setReplyContent(feedback.reply || '')
    setNewStatus(feedback.status)
    setNewPriority(feedback.priority)
    setDetailDialogOpen(true)
  }

  const handleUpdateFeedback = async () => {
    if (!selectedFeedback) return

    try {
      setUpdating(true)
      const updateData: Record<string, string> = {}

      if (replyContent !== (selectedFeedback.reply || '')) {
        updateData.reply = replyContent
      }
      if (newStatus !== selectedFeedback.status) {
        updateData.status = newStatus
      }
      if (newPriority !== selectedFeedback.priority) {
        updateData.priority = newPriority
      }

      if (Object.keys(updateData).length === 0) {
        toast.info('没有需要更新的内容')
        return
      }

      const response = await fetch(`/api/console/platform-feedback/${selectedFeedback.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('更新成功')
        setDetailDialogOpen(false)
        fetchFeedbacks()
      } else {
        toast.error(data.error || '更新失败')
      }
    } catch {
      toast.error('更新失败')
    } finally {
      setUpdating(false)
    }
  }

  const getTypeConfig = (type: string) => {
    return feedbackTypes[type as keyof typeof feedbackTypes] || feedbackTypes.OTHER
  }

  const getStatusConfig = (status: string) => {
    return feedbackStatuses[status as keyof typeof feedbackStatuses] || feedbackStatuses.PENDING
  }

  const getPriorityConfig = (priority: string) => {
    return priorities[priority as keyof typeof priorities] || priorities.NORMAL
  }

  const getSourceConfig = (source: string) => {
    return sources[source as keyof typeof sources] || sources.EMPLOYEE
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">反馈管理</h1>
        <p className="text-muted-foreground">查看和处理企业用户提交的反馈</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">待处理</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-2xl font-bold">{stats.PENDING}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">处理中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{stats.PROCESSING}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已回复</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Reply className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{stats.REPLIED}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已解决</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-2xl font-bold">{stats.RESOLVED}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已关闭</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-gray-400" />
              <span className="text-2xl font-bold">{stats.CLOSED}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索反馈标题、内容、用户、企业..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(feedbackStatuses).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(feedbackTypes).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                {Object.entries(sources).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="优先级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部优先级</SelectItem>
                {Object.entries(priorities).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 反馈列表 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无反馈</h3>
              <p className="text-muted-foreground">还没有收到任何反馈</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">类型</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>企业</TableHead>
                  <TableHead>提交人</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>提交时间</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedbacks.map((feedback) => {
                  const typeConfig = getTypeConfig(feedback.type)
                  const statusConfig = getStatusConfig(feedback.status)
                  const priorityConfig = getPriorityConfig(feedback.priority)
                  const sourceConfig = getSourceConfig(feedback.source)
                  const TypeIcon = typeConfig.icon
                  const SourceIcon = sourceConfig.icon

                  return (
                    <TableRow
                      key={feedback.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenDetail(feedback)}
                    >
                      <TableCell>
                        <div className={`p-2 rounded-lg w-fit ${typeConfig.color}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="font-medium truncate">{feedback.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {feedback.content}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <SourceIcon className="h-3 w-3" />
                          {sourceConfig.label}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{feedback.organization.name}</span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{feedback.user.name || '未设置'}</p>
                          <p className="text-xs text-muted-foreground">{feedback.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityConfig.color}>{priorityConfig.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(feedback.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDetail(feedback)
                          }}
                        >
                          处理
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="text-sm text-muted-foreground">
              共 {pagination.total} 条反馈
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              >
                <ChevronLeft className="h-4 w-4" />
                上一页
              </Button>
              <span className="text-sm">
                第 {pagination.page} / {pagination.totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              >
                下一页
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 反馈详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const typeConfig = getTypeConfig(selectedFeedback.type)
                    const TypeIcon = typeConfig.icon
                    return (
                      <div className={`p-2 rounded-lg ${typeConfig.color}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                    )
                  })()}
                  <div>
                    <DialogTitle>{selectedFeedback.title}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{getTypeConfig(selectedFeedback.type).label}</Badge>
                      <Badge variant="outline">{getSourceConfig(selectedFeedback.source).label}</Badge>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* 反馈信息 */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-muted-foreground text-xs">提交企业</Label>
                    <p className="text-sm font-medium">{selectedFeedback.organization.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">提交人</Label>
                    <p className="text-sm font-medium">
                      {selectedFeedback.user.name || selectedFeedback.user.email}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">提交时间</Label>
                    <p className="text-sm">
                      {new Date(selectedFeedback.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">当前状态</Label>
                    <Badge className={getStatusConfig(selectedFeedback.status).color}>
                      {getStatusConfig(selectedFeedback.status).label}
                    </Badge>
                  </div>
                </div>

                {/* 反馈内容 */}
                <div>
                  <Label className="text-muted-foreground">反馈内容</Label>
                  <div className="mt-2 p-3 bg-muted rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{selectedFeedback.content}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">处理反馈</h4>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label>状态</Label>
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(feedbackStatuses).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>优先级</Label>
                      <Select value={newPriority} onValueChange={setNewPriority}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(priorities).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>回复内容</Label>
                    <Textarea
                      placeholder="输入回复内容..."
                      rows={4}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                    />
                    {selectedFeedback.repliedAt && (
                      <p className="text-xs text-muted-foreground">
                        上次回复时间: {new Date(selectedFeedback.repliedAt).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleUpdateFeedback} disabled={updating}>
                  {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  保存
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
