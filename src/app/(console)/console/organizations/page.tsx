'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  MoreHorizontal,
  Building2,
  Users,
  Workflow,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Organization {
  id: string
  name: string
  logo: string | null
  industry: string | null
  plan: string
  status: string
  apiQuota: number
  apiUsed: number
  owner: {
    id: string
    email: string
    name: string | null
  } | null
  userCount: number
  workflowCount: number
  createdAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const planLabels: Record<string, string> = {
  FREE: '免费版',
  STARTER: '入门版',
  PROFESSIONAL: '专业版',
  ENTERPRISE: '企业版',
}

const statusLabels: Record<string, string> = {
  PENDING: '待激活',
  ACTIVE: '正常',
  SUSPENDED: '已暂停',
  DISABLED: '已禁用',
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-orange-100 text-orange-700',
  DISABLED: 'bg-red-100 text-red-700',
}

export default function OrganizationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)

  // 筛选状态
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [status, setStatus] = useState(searchParams.get('status') || 'all')
  const [plan, setPlan] = useState(searchParams.get('plan') || 'all')

  const fetchOrganizations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const page = searchParams.get('page') || '1'
      params.set('page', page)

      if (search) params.set('search', search)
      if (status && status !== 'all') params.set('status', status)
      if (plan && plan !== 'all') params.set('plan', plan)

      const res = await fetch(`/api/console/organizations?${params}`)
      if (res.ok) {
        const data = await res.json()
        setOrganizations(data.data)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('获取企业列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [searchParams, search, status, plan])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status && status !== 'all') params.set('status', status)
    if (plan && plan !== 'all') params.set('plan', plan)
    router.push(`/console/organizations?${params}`)
  }

  const handleStatusChange = async (orgId: string, newStatus: string) => {
    const reason = newStatus === 'DISABLED' ? prompt('请输入禁用原因：') : undefined

    try {
      const res = await fetch(`/api/console/organizations/${orgId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      })

      if (res.ok) {
        fetchOrganizations()
      }
    } catch (error) {
      console.error('更改状态失败:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">企业管理</h1>
        <Button asChild>
          <Link href="/console/organizations/create">
            <Plus className="mr-2 h-4 w-4" />
            创建企业
          </Link>
        </Button>
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
            <SelectItem value="ACTIVE">正常</SelectItem>
            <SelectItem value="PENDING">待激活</SelectItem>
            <SelectItem value="SUSPENDED">已暂停</SelectItem>
            <SelectItem value="DISABLED">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="套餐" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部套餐</SelectItem>
            <SelectItem value="FREE">免费版</SelectItem>
            <SelectItem value="STARTER">入门版</SelectItem>
            <SelectItem value="PROFESSIONAL">专业版</SelectItem>
            <SelectItem value="ENTERPRISE">企业版</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSearch}>搜索</Button>
      </div>

      {/* 企业列表 */}
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>企业</TableHead>
              <TableHead>企业主</TableHead>
              <TableHead>套餐</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>统计</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <Link
                          href={`/console/organizations/${org.id}`}
                          className="font-medium hover:underline"
                        >
                          {org.name}
                        </Link>
                        {org.industry && (
                          <p className="text-sm text-muted-foreground">
                            {org.industry}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {org.owner ? (
                      <div>
                        <p className="font-medium">{org.owner.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {org.owner.email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{planLabels[org.plan]}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                        statusColors[org.status]
                      }`}
                    >
                      {statusLabels[org.status]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {org.userCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Workflow className="h-4 w-4" />
                        {org.workflowCount}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/console/organizations/${org.id}`}>
                            查看详情
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {org.status !== 'ACTIVE' && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(org.id, 'ACTIVE')}
                          >
                            启用
                          </DropdownMenuItem>
                        )}
                        {org.status !== 'SUSPENDED' && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(org.id, 'SUSPENDED')
                            }
                          >
                            暂停
                          </DropdownMenuItem>
                        )}
                        {org.status !== 'DISABLED' && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(org.id, 'DISABLED')
                            }
                            className="text-destructive"
                          >
                            禁用
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            共 {pagination.total} 条，第 {pagination.page} /{' '}
            {pagination.totalPages} 页
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('page', String(pagination.page - 1))
                router.push(`/console/organizations?${params}`)
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
                router.push(`/console/organizations?${params}`)
              }}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
