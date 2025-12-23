'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  Pencil,
  Shield,
  AlertCircle,
} from 'lucide-react'

type ResourceType = 'WORKFLOW' | 'KNOWLEDGE_BASE' | 'TEMPLATE'
type ResourcePermission = 'VIEWER' | 'EDITOR' | 'MANAGER'
type PermissionTargetType = 'USER' | 'DEPARTMENT' | 'ALL'

interface Department {
  id: string
  name: string
  level?: number
}

interface User {
  id: string
  name: string | null
  email: string
  avatar: string | null
}

interface Permission {
  id: string
  permission: ResourcePermission
  targetType: PermissionTargetType
  targetId: string | null
  targetName: string
  createdAt: string
  createdBy: {
    id: string
    name: string | null
  }
}

interface PermissionDialogProps {
  resourceType: ResourceType
  resourceId: string
  resourceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  WORKFLOW: '工作流',
  KNOWLEDGE_BASE: '知识库',
  TEMPLATE: '模板',
}

const PERMISSION_LABELS: Record<ResourcePermission, string> = {
  VIEWER: '使用者',
  EDITOR: '编辑者',
  MANAGER: '管理者',
}

const _PERMISSION_DESCRIPTIONS: Record<ResourcePermission, string> = {
  VIEWER: '可查看和使用',
  EDITOR: '可编辑内容',
  MANAGER: '可管理权限',
}

const PERMISSION_ICONS: Record<ResourcePermission, typeof Eye> = {
  VIEWER: Eye,
  EDITOR: Pencil,
  MANAGER: Shield,
}

const PERMISSION_COLORS: Record<ResourcePermission, string> = {
  VIEWER: 'bg-gray-500',
  EDITOR: 'bg-blue-500',
  MANAGER: 'bg-purple-500',
}

function getApiPath(resourceType: ResourceType, resourceId: string): string {
  switch (resourceType) {
    case 'WORKFLOW':
      return `/api/workflows/${resourceId}/permissions`
    case 'KNOWLEDGE_BASE':
      return `/api/knowledge-bases/${resourceId}/permissions`
    case 'TEMPLATE':
      return `/api/templates/${resourceId}/permissions`
  }
}

export function PermissionDialog({
  resourceType,
  resourceId,
  resourceName,
  open,
  onOpenChange,
}: PermissionDialogProps) {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [currentUserPermission, setCurrentUserPermission] = useState<ResourcePermission | null>(null)

  // 新权限表单
  const [addType, setAddType] = useState<PermissionTargetType>('DEPARTMENT')
  const [addTargetId, setAddTargetId] = useState('')
  const [addPermission, setAddPermission] = useState<ResourcePermission>('VIEWER')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const apiPath = getApiPath(resourceType, resourceId)
      const [permRes, deptRes, memberRes] = await Promise.all([
        fetch(apiPath),
        fetch('/api/settings/departments'),
        fetch('/api/settings/members'),
      ])

      if (permRes.ok) {
        const data = await permRes.json()
        setPermissions(data.data || [])
        setCanManage(data.canManage || false)
        setCurrentUserPermission(data.currentUserPermission || null)
      }

      if (deptRes.ok) {
        const data = await deptRes.json()
        setDepartments(data.departments || [])
      }

      if (memberRes.ok) {
        const data = await memberRes.json()
        setMembers(data.members || [])
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }, [resourceType, resourceId])

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
      const apiPath = getApiPath(resourceType, resourceId)
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: addType,
          targetId: addType === 'ALL' ? null : addTargetId,
          permission: addPermission,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '添加失败')
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

  const handleDeletePermission = async (perm: Permission) => {
    try {
      const apiPath = getApiPath(resourceType, resourceId)
      const res = await fetch(apiPath, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: perm.targetType,
          targetId: perm.targetId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '删除失败')
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
                <span className="font-medium">全企业</span>
                <p className="text-xs text-muted-foreground">企业内所有成员</p>
              </div>
            </>
          ) : perm.targetType === 'DEPARTMENT' ? (
            <>
              <div className="p-2 rounded-full bg-blue-100">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <span className="font-medium">{perm.targetName}</span>
                <p className="text-xs text-muted-foreground">部门及子部门</p>
              </div>
            </>
          ) : (
            <>
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {perm.targetName?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <span className="font-medium">{perm.targetName}</span>
                <p className="text-xs text-muted-foreground">用户</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge className={`${PERMISSION_COLORS[perm.permission]} text-white`}>
            <PermIcon className="h-3 w-3 mr-1" />
            {PERMISSION_LABELS[perm.permission]}
          </Badge>
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleDeletePermission(perm)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  const resourceLabel = RESOURCE_TYPE_LABELS[resourceType]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>权限设置</DialogTitle>
          <DialogDescription>
            设置谁可以访问和管理{resourceLabel}「{resourceName}」
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 当前用户权限提示 */}
            {currentUserPermission && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  您的权限：<strong>{PERMISSION_LABELS[currentUserPermission]}</strong>
                  {!canManage && '（无法修改权限设置）'}
                </span>
              </div>
            )}

            {/* 添加权限 */}
            {canManage && (
              <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                <div className="text-sm font-medium">添加权限</div>

                <Tabs value={addType} onValueChange={(v) => {
                  setAddType(v as PermissionTargetType)
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
                      全企业
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
                            {'　'.repeat(dept.level || 0)}{dept.name}
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
                    onValueChange={(v) => setAddPermission(v as ResourcePermission)}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          使用者
                        </div>
                      </SelectItem>
                      <SelectItem value="EDITOR">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4" />
                          编辑者
                        </div>
                      </SelectItem>
                      <SelectItem value="MANAGER">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          管理者
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
            )}

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
              <p><strong>使用者</strong>：可以查看和使用{resourceLabel}</p>
              <p><strong>编辑者</strong>：可以编辑{resourceLabel}内容</p>
              <p><strong>管理者</strong>：可以编辑并设置权限</p>
              <p>创建者和企业管理员始终拥有管理者权限</p>
              <p>上级领导自动拥有下属资源的管理权限</p>
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
