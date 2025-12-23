'use client'

/**
 * 审批待办页面
 *
 * 显示用户需要处理的审批请求列表，支持：
 * - 筛选待办/已处理的审批
 * - 查看审批详情和输入数据
 * - 批准或拒绝审批请求
 * - 添加审批意见
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  ClipboardCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Eye,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  AlertCircle,
  User,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface ApprovalDecision {
  id: string
  userId: string
  userName: string
  decision: 'APPROVE' | 'REJECT'
  comment: string | null
  decidedAt: string
}

interface Approval {
  id: string
  title: string
  description: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TIMEOUT' | 'CANCELLED'
  requestedAt: string
  expiresAt: string | null
  decidedAt: string | null
  requiredApprovals: number
  finalDecision: 'APPROVE' | 'REJECT' | null
  timeoutAction: 'APPROVE' | 'REJECT' | 'ESCALATE'
  customFields: Record<string, unknown> | null
  inputSnapshot: Record<string, unknown> | null
  workflowId: string
  workflowName: string
  executionId: string
  executionStatus: string
  nodeId: string
  decisions: ApprovalDecision[]
  decisionCount: number
}

interface Workflow {
  id: string
  name: string
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 筛选状态
  const [selectedStatus, setSelectedStatus] = useState<string>('PENDING')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')

  // 审批详情对话框状态
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // 审批操作状态
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [comment, setComment] = useState('')

  // 加载工作流列表
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const response = await fetch('/api/workflows')
        if (response.ok) {
          const data = await response.json()
          setWorkflows(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error('Load workflows error:', error)
      }
    }
    loadWorkflows()
  }, [])

  const loadApprovals = useCallback(async () => {
    setIsLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      })
      if (selectedStatus && selectedStatus !== 'all') {
        params.append('status', selectedStatus)
      }
      if (selectedWorkflowId) {
        params.append('workflowId', selectedWorkflowId)
      }
      const response = await fetch(`/api/approvals?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        // API response is wrapped in { success: true, data: { approvals, total, ... } }
        if (result.success && result.data) {
          setApprovals(result.data.approvals || [])
          setTotal(result.data.total || 0)
        } else {
          setApprovals([])
          setTotal(0)
        }
      }
    } catch (error) {
      console.error('Load approvals error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [page, selectedStatus, selectedWorkflowId])

  useEffect(() => {
    loadApprovals()
  }, [loadApprovals])

  // 重置筛选
  const resetFilters = () => {
    setSelectedStatus('PENDING')
    setSelectedWorkflowId('')
    setPage(1)
  }

  // 检查是否有筛选条件
  const hasFilters = selectedWorkflowId || (selectedStatus && selectedStatus !== 'PENDING')

  const formatDate = (date: string | null): string => {
    if (!date) return '-'
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getRelativeTime = (date: string): string => {
    const now = new Date()
    const target = new Date(date)
    const diff = target.getTime() - now.getTime()

    if (diff < 0) return '已过期'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}天后到期`
    if (hours > 0) return `${hours}小时后到期`
    return '即将到期'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="mr-1 h-3 w-3" />
            待审批
          </Badge>
        )
      case 'APPROVED':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            已批准
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="mr-1 h-3 w-3" />
            已拒绝
          </Badge>
        )
      case 'TIMEOUT':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <AlertCircle className="mr-1 h-3 w-3" />
            已超时
          </Badge>
        )
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
            <X className="mr-1 h-3 w-3" />
            已取消
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const handleViewDetail = (approval: Approval) => {
    setSelectedApproval(approval)
    setComment('')
    setIsDetailOpen(true)
  }

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedApproval) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/approvals/${selectedApproval.id}/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          comment: comment || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '操作失败')
      }

      toast.success(decision === 'APPROVE' ? '审批已通过' : '审批已拒绝')
      setIsDetailOpen(false)
      loadApprovals()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="container mx-auto py-6">
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">审批待办</h1>
          <span className="text-sm text-muted-foreground">共 {total} 条记录</span>
        </div>
        <Button variant="outline" size="sm" onClick={loadApprovals} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">筛选:</span>
        </div>

        {/* 状态筛选 */}
        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px]" size="sm">
            <SelectValue placeholder="审批状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="PENDING">待审批</SelectItem>
            <SelectItem value="APPROVED">已批准</SelectItem>
            <SelectItem value="REJECTED">已拒绝</SelectItem>
            <SelectItem value="TIMEOUT">已超时</SelectItem>
          </SelectContent>
        </Select>

        {/* 工作流筛选 */}
        <Select
          value={selectedWorkflowId}
          onValueChange={(value) => {
            setSelectedWorkflowId(value === 'all' ? '' : value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[200px]" size="sm">
            <SelectValue placeholder="选择工作流" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工作流</SelectItem>
            {workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 重置筛选 */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="mr-1 h-4 w-4" />
            重置
          </Button>
        )}
      </div>

      {/* 表格 */}
      <div className="rounded-lg border bg-background">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium">审批标题</th>
              <th className="px-4 py-3 text-left text-sm font-medium">工作流</th>
              <th className="px-4 py-3 text-left text-sm font-medium">申请时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium">到期时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium">审批进度</th>
              <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            ) : approvals.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  暂无审批记录
                </td>
              </tr>
            ) : (
              approvals.map((approval) => (
                <tr key={approval.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{getStatusBadge(approval.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{approval.title}</span>
                      {approval.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {approval.description}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/workflows/${approval.workflowId}`}
                      className="text-sm font-medium hover:text-primary hover:underline"
                    >
                      {approval.workflowName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(approval.requestedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {approval.expiresAt && approval.status === 'PENDING' ? (
                      <span
                        className={`text-sm ${
                          new Date(approval.expiresAt) < new Date()
                            ? 'text-red-500'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {getRelativeTime(approval.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">
                        {approval.decisionCount} / {approval.requiredApprovals}
                      </span>
                      <span className="text-xs text-muted-foreground">人已审批</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetail(approval)}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        详情
                      </Button>
                      <Link href={`/executions/${approval.executionId}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="mr-1 h-4 w-4" />
                          执行记录
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            显示 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 审批详情对话框 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedApproval && getStatusBadge(selectedApproval.status)}
              {selectedApproval?.title}
            </DialogTitle>
            {selectedApproval?.description && (
              <DialogDescription>{selectedApproval.description}</DialogDescription>
            )}
          </DialogHeader>

          {selectedApproval && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">基本信息</TabsTrigger>
                <TabsTrigger value="data">输入数据</TabsTrigger>
                <TabsTrigger value="decisions">审批记录</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">工作流：</span>
                    <Link
                      href={`/workflows/${selectedApproval.workflowId}`}
                      className="ml-2 text-primary hover:underline"
                    >
                      {selectedApproval.workflowName}
                    </Link>
                  </div>
                  <div>
                    <span className="text-muted-foreground">申请时间：</span>
                    <span className="ml-2">{formatDate(selectedApproval.requestedAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">到期时间：</span>
                    <span className="ml-2">{formatDate(selectedApproval.expiresAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">超时处理：</span>
                    <span className="ml-2">
                      {selectedApproval.timeoutAction === 'APPROVE'
                        ? '自动批准'
                        : selectedApproval.timeoutAction === 'REJECT'
                          ? '自动拒绝'
                          : '升级处理'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">需要审批数：</span>
                    <span className="ml-2">{selectedApproval.requiredApprovals} 人</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">已审批数：</span>
                    <span className="ml-2">{selectedApproval.decisionCount} 人</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="data" className="space-y-4">
                {selectedApproval.inputSnapshot ? (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-60">
                      {JSON.stringify(selectedApproval.inputSnapshot, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无输入数据</p>
                )}
              </TabsContent>

              <TabsContent value="decisions" className="space-y-4">
                {!selectedApproval.decisions || selectedApproval.decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无审批记录</p>
                ) : (
                  <div className="space-y-3">
                    {selectedApproval.decisions.map((decision) => (
                      <div
                        key={decision.id}
                        className="flex items-start gap-3 rounded-lg border p-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{decision.userName}</span>
                            {decision.decision === 'APPROVE' ? (
                              <Badge className="bg-green-100 text-green-700">
                                <ThumbsUp className="mr-1 h-3 w-3" />
                                批准
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700">
                                <ThumbsDown className="mr-1 h-3 w-3" />
                                拒绝
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(decision.decidedAt)}
                            </span>
                          </div>
                          {decision.comment && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              <MessageSquare className="mr-1 inline h-3 w-3" />
                              {decision.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* 审批操作区域 */}
          {selectedApproval?.status === 'PENDING' && (
            <>
              <div className="border-t pt-4">
                <label className="text-sm font-medium">审批意见（可选）</label>
                <Textarea
                  placeholder="请输入审批意见..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="mt-2"
                  rows={3}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => handleDecision('REJECT')}
                  disabled={isSubmitting}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsDown className="mr-2 h-4 w-4" />
                  )}
                  拒绝
                </Button>
                <Button
                  onClick={() => handleDecision('APPROVE')}
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsUp className="mr-2 h-4 w-4" />
                  )}
                  批准
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
