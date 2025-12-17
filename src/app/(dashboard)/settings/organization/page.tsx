'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Loader2,
  Save,
  Building2,
  Shield,
  History,
  Download,
  Users,
  GitBranch,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface Organization {
  id: string
  name: string
  description: string | null
  logo: string | null
  industry: string | null
  website: string | null
  phone: string | null
  address: string | null
  plan: string
  apiQuota: number
  apiUsed: number
  securitySettings: SecuritySettings
  createdAt: string
  stats: {
    memberCount: number
    workflowCount: number
  }
}

interface SecuritySettings {
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireNumber: boolean
  passwordRequireSymbol: boolean
  sessionTimeout: number
  maxLoginAttempts: number
  ipWhitelist: string[]
  twoFactorRequired: boolean
}

interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  detail: Record<string, unknown>
  userId: string | null
  createdAt: string
  user: {
    id: string
    name: string | null
    email: string
  } | null
}

const ACTION_LABELS: Record<string, string> = {
  'member.role_changed': '修改成员角色',
  'member.removed': '移除成员',
  'invitation.created': '创建邀请',
  'invitation.revoked': '撤销邀请',
  'invitation.accepted': '接受邀请',
  'organization.info_updated': '更新企业信息',
  'organization.security_updated': '更新安全设置',
  'organization.data_exported': '导出数据',
}

const INDUSTRIES = [
  '互联网/IT',
  '金融/银行',
  '教育/培训',
  '医疗/健康',
  '制造/工业',
  '零售/电商',
  '房地产/建筑',
  '媒体/广告',
  '咨询/服务',
  '其他',
]

export default function OrganizationPage() {
  const { data: session } = useSession()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [currentTab, setCurrentTab] = useState('info')

  // 表单状态
  const [infoForm, setInfoForm] = useState({
    name: '',
    description: '',
    industry: '',
    website: '',
    phone: '',
    address: '',
  })

  const [securityForm, setSecurityForm] = useState<SecuritySettings>({
    passwordMinLength: 8,
    passwordRequireUppercase: false,
    passwordRequireNumber: false,
    passwordRequireSymbol: false,
    sessionTimeout: 10080,
    maxLoginAttempts: 5,
    ipWhitelist: [],
    twoFactorRequired: false,
  })

  const isOwner = session?.user?.role === 'OWNER'
  const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN'

  useEffect(() => {
    loadOrganization()
  }, [])

  useEffect(() => {
    if (currentTab === 'audit' && auditLogs.length === 0) {
      loadAuditLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab])

  const loadOrganization = async () => {
    try {
      const res = await fetch('/api/settings/organization')
      if (res.ok) {
        const data = await res.json()
        setOrganization(data.organization)
        setInfoForm({
          name: data.organization.name || '',
          description: data.organization.description || '',
          industry: data.organization.industry || '',
          website: data.organization.website || '',
          phone: data.organization.phone || '',
          address: data.organization.address || '',
        })
        setSecurityForm(data.organization.securitySettings)
      }
    } catch (error) {
      console.error('Failed to load organization:', error)
      toast.error('加载企业信息失败')
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    setLoadingLogs(true)
    try {
      const res = await fetch('/api/settings/audit-logs?limit=50')
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error)
      toast.error('加载审计日志失败')
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleSaveInfo = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'info',
          data: infoForm,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '保存失败')
      }

      toast.success('企业信息已保存')
      loadOrganization()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSecurity = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'security',
          data: securityForm,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '保存失败')
      }

      toast.success('安全设置已保存')
      loadOrganization()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async (type: string) => {
    setExporting(true)
    try {
      const res = await fetch(`/api/settings/export?type=${type}&format=json`)
      if (!res.ok) {
        throw new Error('导出失败')
      }

      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}-export-${format(new Date(), 'yyyy-MM-dd')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('数据已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败')
    } finally {
      setExporting(false)
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
      <div>
        <h1 className="text-2xl font-bold">企业设置</h1>
        <p className="text-muted-foreground">
          管理企业信息、安全设置和数据
        </p>
      </div>

      {/* 概览统计 */}
      {organization && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-full bg-blue-100 p-3">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organization.name}</p>
                <p className="text-sm text-muted-foreground">
                  <Badge variant="secondary">{organization.plan}</Badge>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-full bg-green-100 p-3">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organization.stats.memberCount}</p>
                <p className="text-sm text-muted-foreground">团队成员</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-full bg-purple-100 p-3">
                <GitBranch className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organization.stats.workflowCount}</p>
                <p className="text-sm text-muted-foreground">工作流</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-full bg-amber-100 p-3">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatDistanceToNow(new Date(organization.createdAt), { locale: zhCN })}
                </p>
                <p className="text-sm text-muted-foreground">创建时间</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 设置选项卡 */}
      <Tabs value={currentTab} onValueChange={setCurrentTab}>
        <TabsList>
          <TabsTrigger value="info">
            <Building2 className="mr-2 h-4 w-4" />
            基本信息
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="security">
              <Shield className="mr-2 h-4 w-4" />
              安全设置
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="audit">
              <History className="mr-2 h-4 w-4" />
              审计日志
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger value="export">
              <Download className="mr-2 h-4 w-4" />
              数据导出
            </TabsTrigger>
          )}
        </TabsList>

        {/* 基本信息 */}
        <TabsContent value="info" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>
                编辑企业的基本信息
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>企业名称</Label>
                  <Input
                    value={infoForm.name}
                    onChange={(e) => setInfoForm(f => ({ ...f, name: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>所属行业</Label>
                  <Select
                    value={infoForm.industry}
                    onValueChange={(v) => setInfoForm(f => ({ ...f, industry: v }))}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择行业" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>企业描述</Label>
                <Textarea
                  value={infoForm.description}
                  onChange={(e) => setInfoForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="简要描述您的企业..."
                  disabled={!isAdmin}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>网站地址</Label>
                  <Input
                    value={infoForm.website}
                    onChange={(e) => setInfoForm(f => ({ ...f, website: e.target.value }))}
                    placeholder="https://example.com"
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>联系电话</Label>
                  <Input
                    value={infoForm.phone}
                    onChange={(e) => setInfoForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="400-xxx-xxxx"
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>公司地址</Label>
                <Input
                  value={infoForm.address}
                  onChange={(e) => setInfoForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="详细地址..."
                  disabled={!isAdmin}
                />
              </div>

              {isAdmin && (
                <div className="pt-4">
                  <Button onClick={handleSaveInfo} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    保存更改
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 安全设置 */}
        {isOwner && (
          <TabsContent value="security" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>安全设置</CardTitle>
                <CardDescription>
                  配置企业的安全策略（只有所有者可修改）
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium">密码策略</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>最小密码长度</Label>
                      <Select
                        value={String(securityForm.passwordMinLength)}
                        onValueChange={(v) => setSecurityForm(f => ({ ...f, passwordMinLength: parseInt(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[6, 8, 10, 12, 14, 16].map((len) => (
                            <SelectItem key={len} value={String(len)}>
                              {len} 位
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>最大登录尝试次数</Label>
                      <Select
                        value={String(securityForm.maxLoginAttempts)}
                        onValueChange={(v) => setSecurityForm(f => ({ ...f, maxLoginAttempts: parseInt(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[3, 5, 7, 10].map((num) => (
                            <SelectItem key={num} value={String(num)}>
                              {num} 次
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>要求包含大写字母</Label>
                        <p className="text-sm text-muted-foreground">密码必须包含至少一个大写字母</p>
                      </div>
                      <Switch
                        checked={securityForm.passwordRequireUppercase}
                        onCheckedChange={(v) => setSecurityForm(f => ({ ...f, passwordRequireUppercase: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>要求包含数字</Label>
                        <p className="text-sm text-muted-foreground">密码必须包含至少一个数字</p>
                      </div>
                      <Switch
                        checked={securityForm.passwordRequireNumber}
                        onCheckedChange={(v) => setSecurityForm(f => ({ ...f, passwordRequireNumber: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>要求包含特殊符号</Label>
                        <p className="text-sm text-muted-foreground">密码必须包含至少一个特殊字符</p>
                      </div>
                      <Switch
                        checked={securityForm.passwordRequireSymbol}
                        onCheckedChange={(v) => setSecurityForm(f => ({ ...f, passwordRequireSymbol: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium">会话设置</h3>
                  <div className="space-y-2">
                    <Label>会话超时时间</Label>
                    <Select
                      value={String(securityForm.sessionTimeout)}
                      onValueChange={(v) => setSecurityForm(f => ({ ...f, sessionTimeout: parseInt(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">1 小时</SelectItem>
                        <SelectItem value="480">8 小时</SelectItem>
                        <SelectItem value="1440">1 天</SelectItem>
                        <SelectItem value="4320">3 天</SelectItem>
                        <SelectItem value="10080">7 天</SelectItem>
                        <SelectItem value="43200">30 天</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      用户在此时间内无活动将自动登出
                    </p>
                  </div>
                </div>

                <div className="pt-4">
                  <Button onClick={handleSaveSecurity} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    保存设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 审计日志 */}
        {isAdmin && (
          <TabsContent value="audit" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>审计日志</CardTitle>
                  <CardDescription>
                    查看企业内的所有操作记录
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadAuditLogs} disabled={loadingLogs}>
                  {loadingLogs ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  刷新
                </Button>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无审计日志
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>操作</TableHead>
                        <TableHead>操作人</TableHead>
                        <TableHead>详情</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {ACTION_LABELS[log.action] || log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.user ? (
                              <span>{log.user.name || log.user.email}</span>
                            ) : (
                              <span className="text-muted-foreground">系统</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate">
                            <code className="text-xs">
                              {JSON.stringify(log.detail)}
                            </code>
                          </TableCell>
                          <TableCell>
                            {formatDistanceToNow(new Date(log.createdAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 数据导出 */}
        {isOwner && (
          <TabsContent value="export" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>数据导出</CardTitle>
                <CardDescription>
                  导出企业数据（只有所有者可操作）
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-6">
                      <Download className="h-8 w-8 text-muted-foreground mb-2" />
                      <h3 className="font-medium">全部数据</h3>
                      <p className="text-sm text-muted-foreground text-center mb-4">
                        导出所有企业数据，包括成员、工作流、执行记录等
                      </p>
                      <Button onClick={() => handleExport('all')} disabled={exporting}>
                        {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        导出全部
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-6">
                      <Users className="h-8 w-8 text-muted-foreground mb-2" />
                      <h3 className="font-medium">成员数据</h3>
                      <p className="text-sm text-muted-foreground text-center mb-4">
                        仅导出成员列表和基本信息
                      </p>
                      <Button variant="outline" onClick={() => handleExport('members')} disabled={exporting}>
                        {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        导出成员
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-6">
                      <GitBranch className="h-8 w-8 text-muted-foreground mb-2" />
                      <h3 className="font-medium">工作流数据</h3>
                      <p className="text-sm text-muted-foreground text-center mb-4">
                        导出所有工作流配置
                      </p>
                      <Button variant="outline" onClick={() => handleExport('workflows')} disabled={exporting}>
                        {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        导出工作流
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-6">
                      <History className="h-8 w-8 text-muted-foreground mb-2" />
                      <h3 className="font-medium">审计日志</h3>
                      <p className="text-sm text-muted-foreground text-center mb-4">
                        导出最近 90 天的审计日志
                      </p>
                      <Button variant="outline" onClick={() => handleExport('audit-logs')} disabled={exporting}>
                        {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        导出日志
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
