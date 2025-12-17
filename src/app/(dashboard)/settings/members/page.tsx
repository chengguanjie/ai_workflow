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
  Edit3,
  Eye,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface Member {
  id: string
  email: string
  name: string | null
  avatar: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
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

const ROLES = [
  { value: 'ADMIN', label: '管理员', icon: Shield, description: '可管理成员和设置' },
  { value: 'EDITOR', label: '编辑者', icon: Edit3, description: '可创建和编辑工作流' },
  { value: 'MEMBER', label: '成员', icon: Users, description: '可使用工作流' },
  { value: 'VIEWER', label: '观察者', icon: Eye, description: '只能查看' },
]

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-amber-500',
  ADMIN: 'bg-blue-500',
  EDITOR: 'bg-green-500',
  MEMBER: 'bg-gray-500',
  VIEWER: 'bg-gray-400',
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: '所有者',
  ADMIN: '管理员',
  EDITOR: '编辑者',
  MEMBER: '成员',
  VIEWER: '观察者',
}

export default function MembersPage() {
  const { data: session } = useSession()
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // 邀请表单状态
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteType, setInviteType] = useState<'EMAIL' | 'LINK'>('EMAIL')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviteExpireDays, setInviteExpireDays] = useState('7')
  const [inviteMaxUses, setInviteMaxUses] = useState('10')
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')

  const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN'

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    try {
      const [membersRes, invitationsRes] = await Promise.all([
        fetch('/api/settings/members'),
        isAdmin ? fetch('/api/settings/invitations') : Promise.resolve(null),
      ])

      if (membersRes.ok) {
        const data = await membersRes.json()
        setMembers(data.members || [])
      }

      if (invitationsRes?.ok) {
        const data = await invitationsRes.json()
        setInvitations(data.invitations || [])
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
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
        const error = await res.json()
        throw new Error(error.error || '修改失败')
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
        const error = await res.json()
        throw new Error(error.error || '移除失败')
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
          role: inviteRole,
          expiresInDays: parseInt(inviteExpireDays),
          maxUses: inviteType === 'LINK' ? parseInt(inviteMaxUses) : 1,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '创建邀请失败')
      }

      const data = await res.json()

      if (inviteType === 'LINK') {
        setCreatedInviteUrl(data.invitation.inviteUrl)
        toast.success('邀请链接已创建')
      } else {
        toast.success('邀请已发送')
        setInviteDialogOpen(false)
        resetInviteForm()
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
        throw new Error('撤销失败')
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
    setInviteRole('MEMBER')
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
      case 'EDITOR':
        return <Edit3 className="h-3 w-3" />
      case 'MEMBER':
        return <Users className="h-3 w-3" />
      case 'VIEWER':
        return <Eye className="h-3 w-3" />
      default:
        return null
    }
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
        {isAdmin && (
          <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
            setInviteDialogOpen(open)
            if (!open) resetInviteForm()
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                邀请成员
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>邀请新成员</DialogTitle>
                <DialogDescription>
                  选择邀请方式并设置成员角色
                </DialogDescription>
              </DialogHeader>

              <Tabs value={inviteType} onValueChange={(v) => {
                setInviteType(v as 'EMAIL' | 'LINK')
                setCreatedInviteUrl('')
              }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="EMAIL">
                    <Mail className="mr-2 h-4 w-4" />
                    邮件邀请
                  </TabsTrigger>
                  <TabsTrigger value="LINK">
                    <LinkIcon className="mr-2 h-4 w-4" />
                    链接邀请
                  </TabsTrigger>
                </TabsList>

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
                  )}
                </TabsContent>
              </Tabs>

              {!createdInviteUrl && (
                <>
                  <div className="space-y-2">
                    <Label>成员角色</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem
                            key={role.value}
                            value={role.value}
                            disabled={session?.user?.role === 'ADMIN' && role.value === 'ADMIN'}
                          >
                            <div className="flex items-center gap-2">
                              <role.icon className="h-4 w-4" />
                              <span>{role.label}</span>
                              <span className="text-xs text-muted-foreground">
                                - {role.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
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
                    {inviteType === 'EMAIL' ? '发送邀请' : '生成链接'}
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
                    {member.lastLoginAt && (
                      <p className="text-xs text-muted-foreground">
                        上次登录：{formatDistanceToNow(new Date(member.lastLoginAt), {
                          addSuffix: true,
                          locale: zhCN,
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {isAdmin && member.role !== 'OWNER' && member.id !== session?.user?.id && (
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
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 待处理邀请 */}
      {isAdmin && invitations.length > 0 && (
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
                    <div className={`rounded-full p-2 ${
                      invitation.type === 'EMAIL' ? 'bg-blue-100' : 'bg-green-100'
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
    </div>
  )
}
