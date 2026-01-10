'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  Trash2,
  Users,
  Building2,
  Globe,
  Eye,
  Play,
  Pencil,
} from 'lucide-react'

interface Department {
  id: string
  name: string
}

interface User {
  id: string
  name: string | null
  email: string
  avatar: string | null
}

interface Permission {
  id: string
  permission: 'VIEW' | 'USE' | 'EDIT'
  targetType: 'USER' | 'DEPARTMENT' | 'ALL'
  targetId: string | null
  department?: Department | null
  user?: User | null
}

interface WorkflowPermissionsDialogProps {
  workflowId: string
  workflowName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PERMISSION_LABELS = {
  VIEW: '可查看',
  USE: '可使用',
  EDIT: '可编辑',
}

const PERMISSION_ICONS = {
  VIEW: Eye,
  USE: Play,
  EDIT: Pencil,
}

const PERMISSION_COLORS = {
  VIEW: 'bg-gray-500',
  USE: 'bg-blue-500',
  EDIT: 'bg-green-500',
}

export function WorkflowPermissionsDialog({
  workflowId,
  workflowName,
  open,
  onOpenChange,
}: WorkflowPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 新权限表单
  const [addType, setAddType] = useState<'USER' | 'DEPARTMENT' | 'ALL'>('DEPARTMENT')
  const [addTargetId, setAddTargetId] = useState('')
  const [addPermission, setAddPermission] = useState<'VIEW' | 'USE' | 'EDIT'>('USE')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [perm, dept, member] = await Promise.all([
        fetchApi<{ permissions: Permission[] }>(`/api/workflows/${workflowId}/permissions`),
        fetchApi<{ departments: Department[] }>('/api/settings/departments'),
        fetchApi<{ members: User[] }>('/api/settings/members'),
      ])

      setPermissions(perm.permissions || [])
      setDepartments(dept.departments || [])
      setMembers(member.members || [])
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, loadData])

  const handleAddPermission = async () => {
    if (addType !== 'ALL' && !addTargetId) {
      toast.error(`请选择${addType === 'USER' ? '用户' : '部门'}`)
      return
}

    setSaving(true)
    try {
      const res = await fetch(`/api/workflows/${workflowId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: addType,
          targetId: addType === 'ALL' ? null : addTargetId,
          permission: addPermission,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => null)
        throw new Error(error?.error?.message || '添加失败')
      }

      toast.success('权限已添加')
      setAddTargetId('')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加权限失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePermission = async (permissionId: string) => {
    try {
      const res = await fetch(
        `/api/workflows/${workflowId}/permissions?permissionId=${permissionId}`,
        { method: 'DELETE' }
      )

      if (!res.ok) {
        const error = await res.json().catch(() => null)
        throw new Error(error?.error?.message || '删除失败')
      }

      toast.success('权限已删除')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除权限失败')
    }
  }

  const renderPermissionItem = (perm: Permission) => {
    const PermIcon = PERMISSION_ICONS[perm.permission]

    return (
      <div
        key={perm.id}
        className="flex items-center justify-between rounded-lg border p-3"
      >
        <div className="flex items-center gap-3">
          {perm.targetType === 'ALL' ? (
            <>
              <div className="p-2 rounded-full bg-purple-100">
                <Globe className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <span className="font-medium">所有人</span>
                <p className="text-xs text-muted-foreground">企业内所有成员</p>
              </div>
            </>
          ) : perm.targetType === 'DEPARTMENT' ? (
            <>
              <div className="p-2 rounded-full bg-blue-100">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <span className="font-medium">{perm.department?.name || '未知部门'}</span>
                <p className="text-xs text-muted-foreground">部门</p>
              </div>
            </>
          ) : (
            <>
              <Avatar className="h-8 w-8">
                <AvatarImage src={perm.user?.avatar || undefined} />
                <AvatarFallback>
                  {perm.user?.name?.charAt(0) || perm.user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <span className="font-medium">{perm.user?.name || perm.user?.email}</span>
                <p className="text-xs text-muted-foreground">{perm.user?.email}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge className={`${PERMISSION_COLORS[perm.permission]} text-white`}>
            <PermIcon className="h-3 w-3 mr-1" />
            {PERMISSION_LABELS[perm.permission]}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => handleDeletePermission(perm.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>权限设置</DialogTitle>
          <DialogDescription>
            设置谁可以查看、使用或编辑工作流「{workflowName}」
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 添加权限 */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/50">
              <div className="text-sm font-medium">添加权限</div>

              <Tabs value={addType} onValueChange={(v) => {
                setAddType(v as typeof addType)
                setAddTargetId('')
              }}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="DEPARTMENT">
                    <Building2 className="h-4 w-4 mr-1" />
                    部门
                  </TabsTrigger>
                  <TabsTrigger value="USER">
                    <Users className="h-4 w-4 mr-1" />
                    用户
                  </TabsTrigger>
                  <TabsTrigger value="ALL">
                    <Globe className="h-4 w-4 mr-1" />
                    所有人
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="DEPARTMENT" className="mt-3">
                  <Select value={addTargetId} onValueChange={setAddTargetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择部门" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="USER" className="mt-3">
                  <Select value={addTargetId} onValueChange={setAddTargetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择用户" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="ALL" className="mt-3">
                  <p className="text-sm text-muted-foreground">
                    授权给企业内所有成员
                  </p>
                </TabsContent>
              </Tabs>

              <div className="flex items-center gap-2">
                <Select
                  value={addPermission}
                  onValueChange={(v) => setAddPermission(v as typeof addPermission)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEW">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        可查看
                      </div>
                    </SelectItem>
                    <SelectItem value="USE">
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4" />
                        可使用
                      </div>
                    </SelectItem>
                    <SelectItem value="EDIT">
                      <div className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" />
                        可编辑
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button onClick={handleAddPermission} disabled={saving} className="flex-1">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-1" />
                      添加
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* 权限列表 */}
            <div className="space-y-2">
              <div className="text-sm font-medium">
                已授权 ({permissions.length})
              </div>

              {permissions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无权限设置</p>
                  <p className="text-xs">默认情况下，企业成员根据其角色拥有相应权限</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {permissions.map(renderPermissionItem)}
                </div>
              )}
            </div>

            {/* 说明 */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p>• <strong>可查看</strong>：只能查看工作流，不能执行或编辑</p>
              <p>• <strong>可使用</strong>：可以查看和执行工作流，不能编辑</p>
              <p>• <strong>可编辑</strong>：可以查看、执行和编辑工作流</p>
              <p>• 工作流创建者和管理员始终拥有全部权限</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
