'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSafeSearchParams } from '@/hooks/use-safe-search-params'
import {
  Search,
  Clock,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Application {
  id: string
  orgName: string
  industry: string | null
  website: string | null
  phone: string | null
  description: string | null
  contactName: string
  contactEmail: string
  contactPhone: string | null
  status: string
  rejectReason: string | null
  reviewedAt: string | null
  createdAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const statusLabels: Record<string, string> = {
  PENDING: '待审批',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
}

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4 text-yellow-500" />,
  APPROVED: <CheckCircle className="h-4 w-4 text-green-500" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-500" />,
}

export default function ApplicationsPage() {
  const router = useRouter()
  const searchParams = useSafeSearchParams()

  const [applications, setApplications] = useState<Application[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)

  // 筛选状态
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [status, setStatus] = useState(searchParams.get('status') || 'PENDING')

  // 审批对话框
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [approveDialog, setApproveDialog] = useState(false)
  const [rejectDialog, setRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [approveResult, setApproveResult] = useState<{
    email: string
    tempPassword: string
  } | null>(null)
  const [processing, setProcessing] = useState(false)

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const page = searchParams.get('page') || '1'
      params.set('page', page)

      if (search) params.set('search', search)
      if (status && status !== 'all') params.set('status', status)

      const res = await fetch(`/api/console/applications?${params}`)
      if (res.ok) {
        const response = await res.json()
        // ApiResponse.success() 返回 { success, data: { data, pagination } }
        setApplications(response.data.data)
        setPagination(response.data.pagination)
      }
    } catch (error) {
      console.error('获取申请列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [searchParams, search, status])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status && status !== 'all') params.set('status', status)
    router.push(`/console/applications?${params}`)
  }

  const handleApprove = async () => {
    if (!selectedApp) return
    setProcessing(true)

    try {
      const res = await fetch(`/api/console/applications/${selectedApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      if (res.ok) {
        const response = await res.json()
        // ApiResponse.success() 返回 { success, data }
        setApproveResult({
          email: response.data.owner.email,
          tempPassword: response.data.owner.tempPassword,
        })
        fetchApplications()
      }
    } catch (error) {
      console.error('审批失败:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selectedApp || !rejectReason) return
    setProcessing(true)

    try {
      const res = await fetch(`/api/console/applications/${selectedApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejectReason }),
      })

      if (res.ok) {
        setRejectDialog(false)
        setSelectedApp(null)
        setRejectReason('')
        fetchApplications()
      }
    } catch (error) {
      console.error('拒绝失败:', error)
    } finally {
      setProcessing(false)
    }
  }

  const closeApproveDialog = () => {
    setApproveDialog(false)
    setSelectedApp(null)
    setApproveResult(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">入驻申请</h1>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索企业名称或邮箱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="PENDING">待审批</SelectItem>
            <SelectItem value="APPROVED">已通过</SelectItem>
            <SelectItem value="REJECTED">已拒绝</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSearch}>搜索</Button>
      </div>

      {/* 申请列表 */}
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>企业</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  暂无申请
                </TableCell>
              </TableRow>
            ) : (
              applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{app.orgName}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.industry || '-'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{app.contactName}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.contactEmail}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusIcons[app.status]}
                      <span>{statusLabels[app.status]}</span>
                    </div>
                    {app.rejectReason && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {app.rejectReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(app.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {app.status === 'PENDING' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedApp(app)
                              setApproveDialog(true)
                            }}
                          >
                            <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                            通过
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedApp(app)
                              setRejectDialog(true)
                            }}
                          >
                            <XCircle className="mr-2 h-4 w-4 text-red-500" />
                            拒绝
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {pagination.total} 条
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('page', String(pagination.page - 1))
                router.push(`/console/applications?${params}`)
              }}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('page', String(pagination.page + 1))
                router.push(`/console/applications?${params}`)
              }}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 通过审批对话框 */}
      <Dialog open={approveDialog} onOpenChange={closeApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approveResult ? '审批通过' : '确认通过申请'}
            </DialogTitle>
            <DialogDescription>
              {approveResult
                ? '企业账号已创建，请将以下信息发送给申请人'
                : `确定要通过「${selectedApp?.orgName}」的入驻申请吗？`}
            </DialogDescription>
          </DialogHeader>

          {approveResult ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">邮箱：</span>
                    <span>{approveResult.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">密码：</span>
                    <span className="font-mono">{approveResult.tempPassword}</span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `邮箱: ${approveResult.email}\n密码: ${approveResult.tempPassword}`
                    )
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  复制信息
                </Button>
                <Button onClick={closeApproveDialog}>完成</Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={closeApproveDialog}>
                取消
              </Button>
              <Button onClick={handleApprove} disabled={processing}>
                确认通过
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* 拒绝对话框 */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝申请</DialogTitle>
            <DialogDescription>
              请填写拒绝「{selectedApp?.orgName}」入驻申请的原因
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">拒绝原因</Label>
              <Textarea
                id="reason"
                placeholder="请填写拒绝原因..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(false)
                setSelectedApp(null)
                setRejectReason('')
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason || processing}
            >
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
