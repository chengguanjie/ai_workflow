'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Search,
  MessageSquarePlus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Bug,
  Lightbulb,
  TrendingUp,
  Target,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// 反馈类型配置
const feedbackTypes = [
  { value: 'BUG', label: '问题报告', icon: Bug, color: 'text-red-500' },
  { value: 'FEATURE', label: '功能建议', icon: Lightbulb, color: 'text-yellow-500' },
  { value: 'IMPROVEMENT', label: '改进建议', icon: TrendingUp, color: 'text-blue-500' },
  { value: 'ACCURACY', label: '准确率问题', icon: Target, color: 'text-orange-500' },
  { value: 'OTHER', label: '其他', icon: MoreHorizontal, color: 'text-gray-500' },
]

// 反馈状态配置
const feedbackStatuses = {
  PENDING: { label: '待处理', color: 'bg-gray-100 text-gray-800', icon: Clock },
  PROCESSING: { label: '处理中', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  REPLIED: { label: '已回复', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  RESOLVED: { label: '已解决', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  CLOSED: { label: '已关闭', color: 'bg-gray-100 text-gray-600', icon: AlertCircle },
}

interface PlatformFeedback {
  id: string
  type: keyof typeof feedbackTypes extends number ? never : string
  title: string
  content: string
  source: string
  status: keyof typeof feedbackStatuses
  priority: string
  reply: string | null
  repliedAt: string | null
  createdAt: string
  updatedAt: string
  workflow?: {
    id: string
    name: string
  } | null
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<PlatformFeedback[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedFeedback, setSelectedFeedback] = useState<PlatformFeedback | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [newFeedback, setNewFeedback] = useState({
    type: 'BUG',
    title: '',
    content: '',
    workflowId: '',
  })

  const fetchFeedbacks = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      })
      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      const response = await fetch(`/api/platform-feedback?${params}`)
      const data = await response.json()

      if (data.success) {
        setFeedbacks(data.data.items)
        setPagination(data.data.pagination)
      } else {
        toast.error(data.error?.message || '获取反馈列表失败')
      }
    } catch {
      toast.error('获取反馈列表失败')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.pageSize, statusFilter])

  useEffect(() => {
    fetchFeedbacks()
  }, [fetchFeedbacks])

  const handleSubmitFeedback = async () => {
    if (!newFeedback.title.trim()) {
      toast.error('请输入反馈标题')
      return
    }
    if (!newFeedback.content.trim()) {
      toast.error('请输入反馈内容')
      return
    }

    try {
      setSubmitting(true)
      const response = await fetch('/api/platform-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newFeedback.type,
          title: newFeedback.title.trim(),
          content: newFeedback.content.trim(),
          workflowId: newFeedback.workflowId || undefined,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success('反馈提交成功，感谢您的反馈！')
        setCreateDialogOpen(false)
        setNewFeedback({ type: 'BUG', title: '', content: '', workflowId: '' })
        fetchFeedbacks()
      } else {
        toast.error(data.error?.message || '提交失败')
      }
    } catch {
      toast.error('提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const getTypeConfig = (type: string) => {
    return feedbackTypes.find((t) => t.value === type) || feedbackTypes[4]
  }

  const getStatusConfig = (status: string) => {
    return feedbackStatuses[status as keyof typeof feedbackStatuses] || feedbackStatuses.PENDING
  }

  const filteredFeedbacks = feedbacks.filter((feedback) =>
    feedback.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">平台反馈</h1>
          <p className="text-muted-foreground">向平台管理员提交问题报告、功能建议或改进意见</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          提交反馈
        </Button>
      </div>

      {/* 筛选和搜索 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索反馈..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="PENDING">待处理</TabsTrigger>
            <TabsTrigger value="PROCESSING">处理中</TabsTrigger>
            <TabsTrigger value="REPLIED">已回复</TabsTrigger>
            <TabsTrigger value="RESOLVED">已解决</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 反馈列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquarePlus className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无反馈</h3>
            <p className="text-muted-foreground text-center mb-4">
              您还没有提交过反馈，点击下方按钮提交您的第一条反馈
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              提交反馈
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFeedbacks.map((feedback) => {
            const typeConfig = getTypeConfig(feedback.type)
            const statusConfig = getStatusConfig(feedback.status)
            const TypeIcon = typeConfig.icon
            const StatusIcon = statusConfig.icon

            return (
              <Card
                key={feedback.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setSelectedFeedback(feedback)
                  setDetailDialogOpen(true)
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-muted ${typeConfig.color}`}>
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{feedback.title}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">{typeConfig.label}</Badge>
                          {feedback.workflow && (
                            <span className="text-xs">
                              关联工作流: {feedback.workflow.name}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusConfig.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{feedback.content}</p>
                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>提交时间: {new Date(feedback.createdAt).toLocaleString('zh-CN')}</span>
                    {feedback.repliedAt && (
                      <span>回复时间: {new Date(feedback.repliedAt).toLocaleString('zh-CN')}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {pagination.page} / {pagination.totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 提交反馈对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>提交反馈</DialogTitle>
            <DialogDescription>
              向平台管理员提交您的问题报告、功能建议或改进意见
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>反馈类型</Label>
              <Select
                value={newFeedback.type}
                onValueChange={(value) => setNewFeedback({ ...newFeedback, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {feedbackTypes.map((type) => {
                    const Icon = type.icon
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${type.color}`} />
                          {type.label}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>反馈标题</Label>
              <Input
                placeholder="请简要描述您的反馈"
                value={newFeedback.title}
                onChange={(e) => setNewFeedback({ ...newFeedback, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>详细描述</Label>
              <Textarea
                placeholder="请详细描述您遇到的问题或建议..."
                rows={5}
                value={newFeedback.content}
                onChange={(e) => setNewFeedback({ ...newFeedback, content: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitFeedback} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              提交反馈
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 反馈详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const typeConfig = getTypeConfig(selectedFeedback.type)
                    const TypeIcon = typeConfig.icon
                    return (
                      <div className={`p-2 rounded-lg bg-muted ${typeConfig.color}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                    )
                  })()}
                  <div>
                    <DialogTitle>{selectedFeedback.title}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{getTypeConfig(selectedFeedback.type).label}</Badge>
                      <Badge className={getStatusConfig(selectedFeedback.status).color}>
                        {getStatusConfig(selectedFeedback.status).label}
                      </Badge>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">反馈内容</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{selectedFeedback.content}</p>
                </div>

                {selectedFeedback.workflow && (
                  <div>
                    <Label className="text-muted-foreground">关联工作流</Label>
                    <p className="mt-1 text-sm">{selectedFeedback.workflow.name}</p>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  提交时间: {new Date(selectedFeedback.createdAt).toLocaleString('zh-CN')}
                </div>

                {selectedFeedback.reply && (
                  <div className="border-t pt-4">
                    <Label className="text-muted-foreground">平台回复</Label>
                    <div className="mt-2 p-3 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{selectedFeedback.reply}</p>
                      {selectedFeedback.repliedAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          回复时间: {new Date(selectedFeedback.repliedAt).toLocaleString('zh-CN')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
