'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Users,
  Workflow,
  Key,
  Play,
  MoreHorizontal,
  Edit,
  Trash2,
  RefreshCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface OrganizationDetail {
  id: string
  name: string
  logo: string | null
  description: string | null
  industry: string | null
  website: string | null
  phone: string | null
  address: string | null
  plan: string
  status: string
  statusReason: string | null
  apiQuota: number
  apiUsed: number
  billingEmail: string | null
  billingContact: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  users: {
    id: string
    email: string
    name: string | null
    role: string
    isActive: boolean
    lastLoginAt: string | null
    createdAt: string
  }[]
  stats: {
    workflowCount: number
    executionCount: number
    apiKeyCount: number
    apiTokenCount: number
    recentExecutions: Record<string, number>
  }
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

const roleLabels: Record<string, string> = {
  OWNER: '企业主',
  ADMIN: '管理员',
  EDITOR: '编辑者',
  MEMBER: '成员',
  VIEWER: '查看者',
}

export default function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [organization, setOrganization] = useState<OrganizationDetail | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false)
  const [resetResult, setResetResult] = useState<{
    email: string
    tempPassword: string
  } | null>(null)

  const fetchOrganization = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/console/organizations/${id}`)
      if (res.ok) {
        const result = await res.json()
        // ApiResponse.success() 返回 { success, data }
        setOrganization(result.data)
      } else if (res.status === 404) {
        router.push('/console/organizations')
      }
    } catch (error) {
      console.error('获取企业详情失败:', error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchOrganization()
  }, [fetchOrganization])

  const handleStatusChange = async (newStatus: string) => {
    const reason =
      newStatus === 'DISABLED' ? prompt('请输入禁用原因：') : undefined

    try {
      const res = await fetch(`/api/console/organizations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      })

      if (res.ok) {
        fetchOrganization()
      }
    } catch (error) {
      console.error('更改状态失败:', error)
    }
  }

  const handleResetPassword = async () => {
    try {
      const res = await fetch(`/api/console/organizations/${id}/owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password' }),
      })

      if (res.ok) {
        const result = await res.json()
        // ApiResponse.success() 返回 { success, data }
        setResetResult({
          email: result.data.email,
          tempPassword: result.data.tempPassword,
        })
      }
    } catch (error) {
      console.error('重置密码失败:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除该企业吗？此操作不可恢复！')) return

    try {
      const res = await fetch(`/api/console/organizations/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        router.push('/console/organizations')
      }
    } catch (error) {
      console.error('删除企业失败:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">企业不存在</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/console/organizations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{organization.name}</h1>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {planLabels[organization.plan]}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${statusColors[organization.status]
                    }`}
                >
                  {statusLabels[organization.status]}
                </span>
              </div>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              操作
              <MoreHorizontal className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              编辑信息
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setResetPasswordDialog(true)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              重置企业主密码
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {organization.status !== 'ACTIVE' && (
              <DropdownMenuItem onClick={() => handleStatusChange('ACTIVE')}>
                启用企业
              </DropdownMenuItem>
            )}
            {organization.status !== 'SUSPENDED' && (
              <DropdownMenuItem onClick={() => handleStatusChange('SUSPENDED')}>
                暂停企业
              </DropdownMenuItem>
            )}
            {organization.status !== 'DISABLED' && (
              <DropdownMenuItem
                onClick={() => handleStatusChange('DISABLED')}
                className="text-destructive"
              >
                禁用企业
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除企业
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">用户数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organization.users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">工作流</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {organization.stats.workflowCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">执行次数</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {organization.stats.executionCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">API 用量</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {organization.apiUsed} / {organization.apiQuota}
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(
                    (organization.apiUsed / organization.apiQuota) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 详细信息 */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">用户列表</TabsTrigger>
          <TabsTrigger value="info">基本信息</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>用户列表</CardTitle>
              <CardDescription>该企业下的所有用户</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最后登录</TableHead>
                    <TableHead>加入时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organization.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.name || '-'}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{roleLabels[user.role]}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${user.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                          {user.isActive ? '正常' : '已禁用'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString()
                          : '从未登录'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">企业名称</dt>
                  <dd className="font-medium">{organization.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">所属行业</dt>
                  <dd className="font-medium">
                    {organization.industry || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">联系电话</dt>
                  <dd className="font-medium">{organization.phone || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">网站</dt>
                  <dd className="font-medium">{organization.website || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">地址</dt>
                  <dd className="font-medium">{organization.address || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">创建时间</dt>
                  <dd className="font-medium">
                    {new Date(organization.createdAt).toLocaleString()}
                  </dd>
                </div>
                {organization.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-muted-foreground">平台备注</dt>
                    <dd className="font-medium">{organization.notes}</dd>
                  </div>
                )}
                {organization.statusReason && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-muted-foreground">状态原因</dt>
                    <dd className="font-medium text-destructive">
                      {organization.statusReason}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 重置密码对话框 */}
      <Dialog
        open={resetPasswordDialog}
        onOpenChange={setResetPasswordDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resetResult ? '密码重置成功' : '重置企业主密码'}
            </DialogTitle>
            <DialogDescription>
              {resetResult
                ? '新密码已生成，请将以下信息发送给企业主'
                : '将为企业主生成新的随机密码'}
            </DialogDescription>
          </DialogHeader>

          {resetResult ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">邮箱：</span>
                    <span>{resetResult.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">新密码：</span>
                    <span className="font-mono">{resetResult.tempPassword}</span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `邮箱: ${resetResult.email}\n新密码: ${resetResult.tempPassword}`
                    )
                  }}
                  variant="outline"
                >
                  复制信息
                </Button>
                <Button
                  onClick={() => {
                    setResetPasswordDialog(false)
                    setResetResult(null)
                  }}
                >
                  完成
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setResetPasswordDialog(false)}
              >
                取消
              </Button>
              <Button onClick={handleResetPassword}>确认重置</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
