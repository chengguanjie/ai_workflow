'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  MoreHorizontal,
  UserMinus,
  Shield,
  Copy,
  Link as LinkIcon,
  Mail,
  Trash2,
  Clock,
  Users,
  Crown,
  UserCog,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface Department {
  id: string
  name: string
  level: number
  parentId: string | null
}

interface Member {
  id: string
  email: string
  name: string | null
  avatar: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  departmentId: string | null
  department: Department | null
}

interface Invitation {
  id: string
  email: string | null
  role: string
  type: 'EMAIL' | 'LINK'
  token: string
  expiresAt: string
  maxUses: number
  usedCount: number
  createdAt: string
  isExpired: boolean
  isUsedUp: boolean
  inviteUrl: string
}

// 仅用于修改角色时使用（OWNER/ADMIN可以修改其他成员的角色）
const ROLES = [
  { value: 'ADMIN', label: '管理员', icon: Shield, description: '可管理成员和设置' },
  { value: 'EDITOR', label: '编辑者', icon: UserCog, description: '可编辑工作流和知识库' },
  { value: 'MEMBER', label: '成员', icon: Users, description: '可使用工作流和知识库' },
  { value: 'VIEWER', label: '查看者', icon: Users, description: '只能查看，无法编辑' },
]

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-amber-500',
  ADMIN: 'bg-blue-500',
  EDITOR: 'bg-green-500',
  MEMBER: 'bg-gray-500',
  VIEWER: 'bg-slate-400',
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: '所有者',
  ADMIN: '管理员',
  EDITOR: '编辑者',
  MEMBER: '成员',
  VIEWER: '查看者',
}

export default function MembersPage() {
  const { data: session } = useSession()
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // 权限相关状态
  const [canManageMembers, setCanManageMembers] = useState(false)
  const [managedDepartmentIds, setManagedDepartmentIds] = useState<string[]>([])
  const [isAdminUser, setIsAdminUser] = useState(false)

  // 邀请/创建表单状态
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteType, setInviteType] = useState<'CREATE' | 'EMAIL' | 'LINK'>('CREATE')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteDepartmentId, setInviteDepartmentId] = useState('')
  const [inviteExpireDays, setInviteExpireDays] = useState('7')
  const [inviteMaxUses, setInviteMaxUses] = useState('10')
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')

  // 新创建成员的临时密码
  const [createdMemberInfo, setCreatedMemberInfo] = useState<{ name: string; email: string; password: string } | null>(null)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)

  const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN'

  useEffect(() => {
    loadData()
    loadDepartments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    try {
      const [membersRes, invitationsRes] = await Promise.all([
        fetch('/api/settings/members'),
        isAdmin ? fetch('/api/settings/invitations') : Promise.resolve(null),
      ])

      if (membersRes.ok) {
        const result = await membersRes.json()
        if (result.success && result.data) {
          setMembers(result.data.members || [])
          setCanManageMembers(result.data.canManageMembers ?? false)
          setManagedDepartmentIds(result.data.managedDepartmentIds || [])
          setIsAdminUser(result.data.isAdmin ?? false)
        }
      }

      if (invitationsRes?.ok) {
        const result = await invitationsRes.json()
        if (result.success && result.data) {
          setInvitations(result.data.invitations || [])
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const loadDepartments = async () => {
    try {
      const res = await fetch('/api/settings/departments')
      if (res.ok) {
        const result = await res.json()
        if (result.success && result.data) {
          setDepartments(result.data.departments || [])
        }
      }
    } catch (error) {
      console.error('Failed to load departments:', error)
    }
  }

  const handleChangeDepartment = async (memberId: string, departmentId: string | null) => {
    setSaving(memberId)
    try {
      const res = await fetch(`/api/settings/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '修改失败'
        throw new Error(errorMessage)
      }

      toast.success('部门已更新')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修改部门失败')
    } finally {
      setSaving(null)
    }
  }

  const handleChangeRole = async (memberId: string, newRole: string) => {
    setSaving(memberId)
    try {
      const res = await fetch(`/api/settings/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '修改失败'
        throw new Error(errorMessage)
      }

      toast.success('角色已更新')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修改角色失败')
    } finally {
      setSaving(null)
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string | null) => {
    if (!confirm(`确定要移除成员 ${memberName || '该用户'} 吗？`)) return

    setSaving(memberId)
    try {
      const res = await fetch(`/api/settings/members/${memberId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '移除失败'
        throw new Error(errorMessage)
      }

      toast.success('成员已移除')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移除成员失败')
    } finally {
      setSaving(null)
    }
  }

  const handleCreateInvitation = async () => {
    // 直接创建成员
    if (inviteType === 'CREATE') {
      if (!inviteEmail.trim()) {
        toast.error('请输入邮箱或手机号')
        return
      }
      if (!inviteName.trim()) {
        toast.error('请输入姓名')
        return
      }

      setSaving('invite')
      try {
        const res = await fetch('/api/settings/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: inviteEmail,
            name: inviteName,
            departmentId: inviteDepartmentId || undefined,
          }),
        })

        if (!res.ok) {
          const errorData = await res.json()
          const errorMessage = typeof errorData.error === 'string'
            ? errorData.error
            : errorData.error?.message || '创建成员失败'
          throw new Error(errorMessage)
        }

        const result = await res.json()

        // 保存成员信息和临时密码，显示密码对话框
        if (result.success && result.data) {
          setCreatedMemberInfo({
            name: inviteName,
            email: inviteEmail,
            password: result.data.tempPassword,
          })
          setInviteDialogOpen(false)
          setShowPasswordDialog(true)
          resetInviteForm()
          loadData()
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '创建成员失败')
      } finally {
        setSaving(null)
      }
      return
    }

    // 邮件邀请
    if (inviteType === 'EMAIL' && !inviteEmail.trim()) {
      toast.error('请输入邮箱地址')
      return
    }

    setSaving('invite')
    try {
      const res = await fetch('/api/settings/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: inviteType,
          email: inviteType === 'EMAIL' ? inviteEmail : undefined,
          role: 'MEMBER', // 新成员默认为MEMBER
          departmentId: inviteDepartmentId || undefined,
          expiresInDays: parseInt(inviteExpireDays),
          maxUses: inviteType === 'LINK' ? parseInt(inviteMaxUses) : 1,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '创建邀请失败'
        throw new Error(errorMessage)
      }

      const result = await res.json()

      if (result.success && result.data) {
        if (inviteType === 'LINK') {
          setCreatedInviteUrl(result.data.invitation.inviteUrl)
          toast.success('邀请链接已创建')
        } else {
          toast.success('邀请已发送')
          setInviteDialogOpen(false)
          resetInviteForm()
        }
      }

      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建邀请失败')
    } finally {
      setSaving(null)
    }
  }

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('确定要撤销这个邀请吗？')) return

    setSaving(invitationId)
    try {
      const res = await fetch(`/api/settings/invitations/${invitationId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '撤销失败'
        throw new Error(errorMessage)
      }

      toast.success('邀请已撤销')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '撤销邀请失败')
    } finally {
      setSaving(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  const resetInviteForm = () => {
    setInviteEmail('')
    setInviteName('')
    setInviteDepartmentId('')
    setInviteExpireDays('7')
    setInviteMaxUses('10')
    setCreatedInviteUrl('')
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER':
        return <Crown className="h-3 w-3" />
      case 'ADMIN':
        return <Shield className="h-3 w-3" />
      case 'MEMBER':
        return <Users className="h-3 w-3" />
      default:
        return <Users className="h-3 w-3" />
    }
  }

  // 渲染带层级缩进的部门选项（forInvite: 用于添加成员时只显示可管理的部门）
  const renderDepartmentOptions = (forInvite: boolean = false) => {
    // 筛选出可选的部门
    let availableDepts = [...departments]

    // 部门负责人在添加成员时只能选择自己管理的部门
    if (forInvite && !isAdminUser && managedDepartmentIds.length > 0) {
      availableDepts = availableDepts.filter(d => managedDepartmentIds.includes(d.id))
    }

    // 按层级排序后的部门列表
    const sortedDepts = availableDepts.sort((a, b) => {
      // 先按层级排序
      if (a.level !== b.level) return a.level - b.level
      // 同级按名称排序
      return a.name.localeCompare(b.name)
    })

    // 构建树形结构并扁平化
    const buildFlatTree = (parentId: string | null, level: number): Department[] => {
      const children = sortedDepts.filter(d => d.parentId === parentId)
      const result: Department[] = []
      for (const child of children) {
        result.push({ ...child, level })
        result.push(...buildFlatTree(child.id, level + 1))
      }
      return result
    }

    const flatTree = buildFlatTree(null, 0)

    // 如果筛选后只有子部门（没有顶级部门），直接返回扁平列表
    if (flatTree.length === 0 && sortedDepts.length > 0) {
      return sortedDepts.map((dept) => (
        <SelectItem key={dept.id} value={dept.id}>
          {dept.name}
        </SelectItem>
      ))
    }

    return flatTree.map((dept) => (
      <SelectItem key={dept.id} value={dept.id}>
        <span style={{ paddingLeft: `${dept.level * 16}px` }}>
          {dept.level > 0 && <span className="text-muted-foreground mr-1">└</span>}
          {dept.name}
        </span>
      </SelectItem>
    ))
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
        <div>
          <h1 className="text-2xl font-bold">成员管理</h1>
          <p className="text-muted-foreground">
            管理团队成员和邀请
          </p>
        </div>
        {canManageMembers && (
          <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
            setInviteDialogOpen(open)
            if (!open) resetInviteForm()
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                添加成员
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>添加新成员</DialogTitle>
                <DialogDescription>
                  {isAdminUser ? '直接创建账号或通过邀请方式添加成员' : '添加成员到您管理的部门'}
                </DialogDescription>
              </DialogHeader>

              {/* 管理员可以使用所有方式，部门负责人只能直接创建 */}
              {isAdminUser ? (
                <Tabs value={inviteType} onValueChange={(v) => {
                  setInviteType(v as 'CREATE' | 'EMAIL' | 'LINK')
                  setCreatedInviteUrl('')
                }}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="CREATE">
                      <Plus className="mr-2 h-4 w-4" />
                      直接创建
                    </TabsTrigger>
                    <TabsTrigger value="EMAIL">
                      <Mail className="mr-2 h-4 w-4" />
                      邮件邀请
                    </TabsTrigger>
                    <TabsTrigger value="LINK">
                      <LinkIcon className="mr-2 h-4 w-4" />
                      链接邀请
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="CREATE" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>邮箱/手机号</Label>
                      <Input
                        type="text"
                        placeholder="邮箱或手机号"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>姓名</Label>
                      <Input
                        placeholder="请输入姓名"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>所属部门</Label>
                      <Select
                        value={inviteDepartmentId || '_none'}
                        onValueChange={(value) => setInviteDepartmentId(value === '_none' ? '' : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择部门（可选）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">暂不分配</SelectItem>
                          {renderDepartmentOptions(true)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      初始密码为 123456，成员首次登录后需要修改密码
                    </p>
                  </TabsContent>

                  <TabsContent value="EMAIL" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>邮箱地址</Label>
                      <Input
                        type="email"
                        placeholder="member@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>所属部门</Label>
                      <Select
                        value={inviteDepartmentId || '_none'}
                        onValueChange={(value) => setInviteDepartmentId(value === '_none' ? '' : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择部门（可选）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">暂不分配</SelectItem>
                          {renderDepartmentOptions(true)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>有效期</Label>
                      <Select value={inviteExpireDays} onValueChange={setInviteExpireDays}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 天</SelectItem>
                          <SelectItem value="3">3 天</SelectItem>
                          <SelectItem value="7">7 天</SelectItem>
                          <SelectItem value="14">14 天</SelectItem>
                          <SelectItem value="30">30 天</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="LINK" className="space-y-4 mt-4">
                    {createdInviteUrl ? (
                      <div className="space-y-2">
                        <Label>邀请链接</Label>
                        <div className="flex gap-2">
                          <Input
                            value={createdInviteUrl}
                            readOnly
                            className="font-mono text-xs"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(createdInviteUrl)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          分享此链接给需要加入的成员
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>最大使用次数</Label>
                          <Select value={inviteMaxUses} onValueChange={setInviteMaxUses}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 次</SelectItem>
                              <SelectItem value="5">5 次</SelectItem>
                              <SelectItem value="10">10 次</SelectItem>
                              <SelectItem value="25">25 次</SelectItem>
                              <SelectItem value="50">50 次</SelectItem>
                              <SelectItem value="100">100 次</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>所属部门</Label>
                          <Select
                            value={inviteDepartmentId || '_none'}
                            onValueChange={(value) => setInviteDepartmentId(value === '_none' ? '' : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择部门（可选）" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">暂不分配</SelectItem>
                              {renderDepartmentOptions(true)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>有效期</Label>
                          <Select value={inviteExpireDays} onValueChange={setInviteExpireDays}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 天</SelectItem>
                              <SelectItem value="3">3 天</SelectItem>
                              <SelectItem value="7">7 天</SelectItem>
                              <SelectItem value="14">14 天</SelectItem>
                              <SelectItem value="30">30 天</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                /* 部门负责人只能直接创建成员 */
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>邮箱/手机号</Label>
                    <Input
                      type="text"
                      placeholder="邮箱或手机号"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>姓名</Label>
                    <Input
                      placeholder="请输入姓名"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>所属部门 <span className="text-destructive">*</span></Label>
                    <Select
                      value={inviteDepartmentId || ''}
                      onValueChange={(value) => setInviteDepartmentId(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择部门" />
                      </SelectTrigger>
                      <SelectContent>
                        {renderDepartmentOptions(true)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      您只能添加成员到您管理的部门
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    初始密码为 123456，成员首次登录后需要修改密码
                  </p>
                </div>
              )}

              <DialogFooter>
                {createdInviteUrl ? (
                  <Button onClick={() => {
                    setInviteDialogOpen(false)
                    resetInviteForm()
                  }}>
                    完成
                  </Button>
                ) : (
                  <Button onClick={handleCreateInvitation} disabled={saving === 'invite'}>
                    {saving === 'invite' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isAdminUser ? (inviteType === 'CREATE' ? '创建成员' : inviteType === 'EMAIL' ? '发送邀请' : '生成链接') : '创建成员'}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* 成员列表 */}
      <Card>
        <CardHeader>
          <CardTitle>团队成员</CardTitle>
          <CardDescription>
            共 {members.length} 名成员
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={member.avatar || undefined} />
                    <AvatarFallback>
                      {member.name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {member.name || member.email}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`${ROLE_COLORS[member.role]} text-white`}
                      >
                        {getRoleIcon(member.role)}
                        <span className="ml-1">{ROLE_LABELS[member.role]}</span>
                      </Badge>
                      {member.id === session?.user?.id && (
                        <Badge variant="outline">你</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {member.department ? (
                        <Badge variant="outline" className="text-xs">
                          {member.department.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">未分配部门</span>
                      )}
                      {member.lastLoginAt && (
                        <span className="text-xs text-muted-foreground">
                          · 上次登录：{formatDistanceToNow(new Date(member.lastLoginAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* 部门选择 - 管理员可改所有人，部门负责人只能改自己管理的部门内的人 */}
                  {isAdminUser && member.role !== 'OWNER' && (
                    <Select
                      value={member.departmentId || '_none'}
                      onValueChange={(value) => handleChangeDepartment(member.id, value === '_none' ? null : value)}
                      disabled={saving === member.id}
                    >
                      <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue placeholder="选择部门" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">无部门</SelectItem>
                        {renderDepartmentOptions()}
                      </SelectContent>
                    </Select>
                  )}

                  {/* 只有管理员可以修改角色和移除成员 */}
                  {isAdminUser && member.role !== 'OWNER' && member.id !== session?.user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={saving === member.id}>
                          {saving === member.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          disabled={session?.user?.role === 'ADMIN' && member.role === 'ADMIN'}
                        >
                          <UserCog className="mr-2 h-4 w-4" />
                          修改角色
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {ROLES.map((role) => (
                          <DropdownMenuItem
                            key={role.value}
                            className="cursor-pointer"
                            disabled={
                              member.role === role.value ||
                              (session?.user?.role === 'ADMIN' && role.value === 'ADMIN')
                            }
                            onClick={() => handleChangeRole(member.id, role.value)}
                          >
                            <role.icon className="mr-2 h-4 w-4" />
                            设为{role.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive"
                          onClick={() => handleRemoveMember(member.id, member.name)}
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          移除成员
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 待处理邀请 - 仅管理员可见 */}
      {isAdminUser && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>待处理邀请</CardTitle>
            <CardDescription>
              {invitations.length} 个邀请待接受
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className={`rounded-full p-2 ${invitation.type === 'EMAIL' ? 'bg-blue-100' : 'bg-green-100'
                      }`}>
                      {invitation.type === 'EMAIL' ? (
                        <Mail className="h-4 w-4 text-blue-600" />
                      ) : (
                        <LinkIcon className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {invitation.type === 'EMAIL' ? (
                          <span className="font-medium">{invitation.email}</span>
                        ) : (
                          <span className="font-medium">邀请链接</span>
                        )}
                        <Badge variant="secondary">
                          {ROLE_LABELS[invitation.role]}
                        </Badge>
                        {(invitation.isExpired || invitation.isUsedUp) && (
                          <Badge variant="destructive">
                            {invitation.isExpired ? '已过期' : '已用完'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(invitation.expiresAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}过期
                        </span>
                        {invitation.type === 'LINK' && (
                          <span>
                            已使用 {invitation.usedCount}/{invitation.maxUses} 次
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {invitation.type === 'LINK' && !invitation.isExpired && !invitation.isUsedUp && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(invitation.inviteUrl)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        复制
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevokeInvitation(invitation.id)}
                      disabled={saving === invitation.id}
                    >
                      {saving === invitation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 新成员临时密码显示对话框 */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>成员创建成功</DialogTitle>
            <DialogDescription>
              请将以下登录信息发送给新成员，密码仅显示一次
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">姓名</Label>
              <div className="font-medium">{createdMemberInfo?.name}</div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">账号</Label>
              <div className="font-medium">{createdMemberInfo?.email}</div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">临时密码</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm">
                  {createdMemberInfo?.password}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (createdMemberInfo?.password) {
                      copyToClipboard(createdMemberInfo.password)
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">安全提示</p>
              <ul className="mt-1 list-disc list-inside space-y-1 text-xs">
                <li>请通过安全渠道发送密码给成员</li>
                <li>成员首次登录后需修改密码</li>
                <li>此密码不会再次显示</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setShowPasswordDialog(false)
              setCreatedMemberInfo(null)
            }}>
              我已记录，关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
