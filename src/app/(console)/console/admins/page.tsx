'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  UserCog,
  Plus,
  Search,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Headphones,
  Unlock,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { toast } from 'sonner'

interface Admin {
  id: string
  email: string
  name: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  loginAttempts: number
  lockedUntil: string | null
  createdAt: string
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  OPERATOR: '运营',
  SUPPORT: '客服',
}

const roleIcons: Record<string, React.ElementType> = {
  SUPER_ADMIN: ShieldCheck,
  ADMIN: Shield,
  OPERATOR: ShieldAlert,
  SUPPORT: Headphones,
}

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  OPERATOR: 'bg-green-100 text-green-700',
  SUPPORT: 'bg-gray-100 text-gray-700',
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    role: 'OPERATOR',
  })

  const fetchAdmins = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (roleFilter) params.set('role', roleFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/console/admins?${params}`)
      if (res.ok) {
        const result = await res.json()
        // ApiResponse.paginated() 返回 { success, data: [...], pagination }
        setAdmins(result.data)
      }
    } catch (error) {
      console.error('获取管理员列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [roleFilter, search])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const handleSearch = () => {
    fetchAdmins()
  }

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/console/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        toast.success('管理员创建成功')
        setShowCreateDialog(false)
        setFormData({ email: '', name: '', password: '', role: 'OPERATOR' })
        fetchAdmins()
      } else {
        const data = await res.json()
        toast.error(data.error || '创建失败')
      }
    } catch {
      toast.error('创建失败')
    }
  }

  const handleUpdate = async () => {
    if (!selectedAdmin) return

    try {
      const updateData: Record<string, unknown> = {
        name: formData.name,
        role: formData.role,
      }
      if (formData.password) {
        updateData.password = formData.password
      }

      const res = await fetch(`/api/console/admins/${selectedAdmin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        toast.success('更新成功')
        setShowEditDialog(false)
        setSelectedAdmin(null)
        fetchAdmins()
      } else {
        const data = await res.json()
        toast.error(data.error || '更新失败')
      }
    } catch {
      toast.error('更新失败')
    }
  }

  const handleDelete = async () => {
    if (!selectedAdmin) return

    try {
      const res = await fetch(`/api/console/admins/${selectedAdmin.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('删除成功')
        setShowDeleteDialog(false)
        setSelectedAdmin(null)
        fetchAdmins()
      } else {
        const data = await res.json()
        toast.error(data.error || '删除失败')
      }
    } catch {
      toast.error('删除失败')
    }
  }

  const handleToggleActive = async (admin: Admin) => {
    try {
      const res = await fetch(`/api/console/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !admin.isActive }),
      })

      if (res.ok) {
        toast.success(admin.isActive ? '已禁用' : '已启用')
        fetchAdmins()
      } else {
        const data = await res.json()
        toast.error(data.error || '操作失败')
      }
    } catch {
      toast.error('操作失败')
    }
  }

  const handleUnlock = async (admin: Admin) => {
    try {
      const res = await fetch(`/api/console/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlockAccount: true }),
      })

      if (res.ok) {
        toast.success('账户已解锁')
        fetchAdmins()
      } else {
        const data = await res.json()
        toast.error(data.error || '解锁失败')
      }
    } catch {
      toast.error('解锁失败')
    }
  }

  const openEditDialog = (admin: Admin) => {
    setSelectedAdmin(admin)
    setFormData({
      email: admin.email,
      name: admin.name || '',
      password: '',
      role: admin.role,
    })
    setShowEditDialog(true)
  }

  const isLocked = (admin: Admin) => {
    return admin.lockedUntil && new Date(admin.lockedUntil) > new Date()
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">管理员管理</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加管理员
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="搜索邮箱或姓名..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button variant="outline" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <Select value={roleFilter || 'all'} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="全部角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                <SelectItem value="SUPER_ADMIN">超级管理员</SelectItem>
                <SelectItem value="ADMIN">管理员</SelectItem>
                <SelectItem value="OPERATOR">运营</SelectItem>
                <SelectItem value="SUPPORT">客服</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 管理员列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            管理员列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {admins.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                暂无管理员
              </div>
            ) : (
              admins.map((admin) => {
                const RoleIcon = roleIcons[admin.role] || Shield
                return (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {admin.name || admin.email}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${roleColors[admin.role]
                              }`}
                          >
                            {roleLabels[admin.role]}
                          </span>
                          {!admin.isActive && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                              已禁用
                            </span>
                          )}
                          {isLocked(admin) && (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                              已锁定
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {admin.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">
                          最后登录:{' '}
                          {admin.lastLoginAt
                            ? new Date(admin.lastLoginAt).toLocaleString()
                            : '从未'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          创建于 {new Date(admin.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(admin)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            编辑
                          </DropdownMenuItem>
                          {isLocked(admin) && (
                            <DropdownMenuItem onClick={() => handleUnlock(admin)}>
                              <Unlock className="mr-2 h-4 w-4" />
                              解锁账户
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(admin)}
                          >
                            {admin.isActive ? '禁用账户' : '启用账户'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setSelectedAdmin(admin)
                              setShowDeleteDialog(true)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* 创建管理员对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加管理员</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱 *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码 *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">角色</Label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData({ ...formData, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">超级管理员</SelectItem>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                  <SelectItem value="OPERATOR">运营</SelectItem>
                  <SelectItem value="SUPPORT">客服</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑管理员对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑管理员</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input value={formData.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">姓名</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">新密码（留空则不修改）</Label>
              <Input
                id="edit-password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">角色</Label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData({ ...formData, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">超级管理员</SelectItem>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                  <SelectItem value="OPERATOR">运营</SelectItem>
                  <SelectItem value="SUPPORT">客服</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              取消
            </Button>
            <Button onClick={handleUpdate}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除管理员 {selectedAdmin?.name || selectedAdmin?.email}{' '}
              吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
