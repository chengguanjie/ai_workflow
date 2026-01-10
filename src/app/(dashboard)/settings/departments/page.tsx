'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Building2,
  Users,
  ChevronRight,
  ChevronDown,
  FolderTree,
  UserCircle,
} from 'lucide-react'

interface Member {
  id: string
  name: string | null
  email: string
}

interface Department {
  id: string
  name: string
  description: string | null
  parentId: string | null
  sortOrder: number
  managerId?: string | null
  manager?: { id: string; name: string | null; email: string } | null
  _count: {
    users: number
  }
  children?: Department[]
}

export default function DepartmentsPage() {
  return <DepartmentsSettingsView />
}

export function DepartmentsSettingsView({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: session } = useSession()
  const [departments, setDepartments] = useState<Department[]>([])
  const [tree, setTree] = useState<Department[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: '',
    managerId: '',
  })

  // 展开状态
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN'

  useEffect(() => {
    loadDepartments()
    loadMembers()
  }, [])

  const loadDepartments = async () => {
    try {
      const res = await fetch('/api/settings/departments')
      if (res.ok) {
        const result = await res.json()
        if (result.success && result.data) {
          setDepartments(result.data.departments || [])
          setTree(result.data.tree || [])
          // 默认展开所有
          const allIds = new Set<string>((result.data.departments || []).map((d: Department) => d.id))
          setExpandedIds(allIds)
        }
      }
    } catch (error) {
      console.error('Failed to load departments:', error)
      toast.error('加载部门列表失败')
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    try {
      const res = await fetch('/api/settings/members')
      if (res.ok) {
        const result = await res.json()
        if (result.success && result.data) {
          setMembers(result.data.members || [])
        }
      }
    } catch (error) {
      console.error('Failed to load members:', error)
    }
  }

  const handleOpenDialog = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept)
      setFormData({
        name: dept.name,
        description: dept.description || '',
        parentId: dept.parentId || '',
        managerId: dept.managerId || '',
      })
    } else {
      setEditingDept(null)
      setFormData({ name: '', description: '', parentId: '', managerId: '' })
    }
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingDept(null)
    setFormData({ name: '', description: '', parentId: '', managerId: '' })
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('部门名称不能为空')
      return
    }

    setSaving(true)
    try {
      const url = editingDept
        ? `/api/settings/departments/${editingDept.id}`
        : '/api/settings/departments'
      const method = editingDept ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          parentId: formData.parentId || null,
          managerId: formData.managerId || null,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error?.message || error.message || '操作失败')
      }

      toast.success(editingDept ? '部门已更新' : '部门已创建')
      handleCloseDialog()
      loadDepartments()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (dept: Department) => {
    if (!confirm(`确定要删除部门"${dept.name}"吗？`)) return

    try {
      const res = await fetch(`/api/settings/departments/${dept.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error?.message || error.message || '删除失败')
      }

      toast.success('部门已删除')
      loadDepartments()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const renderDepartmentNode = (dept: Department, level: number = 0) => {
    const hasChildren = dept.children && dept.children.length > 0
    const isExpanded = expandedIds.has(dept.id)

    return (
      <div key={dept.id}>
        <div
          className="flex items-center justify-between rounded-lg border p-3 mb-2 hover:bg-muted/50"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <div className="flex items-center gap-3">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(dept.id)}
                className="p-1 hover:bg-muted rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">{dept.name}</div>
              {dept.description && (
                <div className="text-sm text-muted-foreground">{dept.description}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {dept.manager && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <UserCircle className="h-4 w-4" />
                <span>{dept.manager.name || dept.manager.email}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{dept._count.users} 人</span>
            </div>

            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleOpenDialog(dept)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(dept)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {dept.children!.map((child) => renderDepartmentNode(child, level + 1))}
          </div>
        )}
      </div>
    )
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
        {!embedded ? (
          <div>
            <h1 className="text-2xl font-bold">部门管理</h1>
            <p className="text-muted-foreground">
              管理企业组织架构和部门
            </p>
          </div>
        ) : (
          <div />
        )}
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                新建部门
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDept ? '编辑部门' : '新建部门'}</DialogTitle>
                <DialogDescription>
                  {editingDept ? '修改部门信息' : '创建一个新的部门'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>部门名称 *</Label>
                  <Input
                    placeholder="如：研发部"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>部门描述</Label>
                  <Textarea
                    placeholder="部门职责描述（可选）"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>上级部门</Label>
                  <Select
                    value={formData.parentId || '_none'}
                    onValueChange={(value) => setFormData({ ...formData, parentId: value === '_none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="无（顶级部门）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">无（顶级部门）</SelectItem>
                      {departments
                        .filter((d) => d.id !== editingDept?.id)
                        .map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>部门负责人</Label>
                  <Select
                    value={formData.managerId || '_none'}
                    onValueChange={(value) => setFormData({ ...formData, managerId: value === '_none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择负责人（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">暂不指定</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    部门负责人可以管理本部门及子部门的成员和资源
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  取消
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingDept ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            组织架构
          </CardTitle>
          <CardDescription>
            共 {departments.length} 个部门
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无部门</p>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => handleOpenDialog()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个部门
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {tree.map((dept) => renderDepartmentNode(dept))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
