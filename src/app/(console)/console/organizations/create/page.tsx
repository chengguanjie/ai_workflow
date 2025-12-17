'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CreateResult {
  organization: {
    id: string
    name: string
    plan: string
  }
  owner: {
    id: string
    email: string
    name: string
    tempPassword?: string
  }
}

export default function CreateOrganizationPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreateResult | null>(null)
  const [copied, setCopied] = useState(false)

  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    phone: '',
    plan: 'FREE',
    apiQuota: 10000,
    ownerEmail: '',
    ownerName: '',
    ownerPassword: '',
    notes: '',
  })

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/console/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          industry: formData.industry || undefined,
          phone: formData.phone || undefined,
          plan: formData.plan,
          apiQuota: formData.apiQuota,
          owner: {
            email: formData.ownerEmail,
            name: formData.ownerName,
            password: formData.ownerPassword || undefined,
          },
          notes: formData.notes || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '创建失败')
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (result?.owner.tempPassword) {
      navigator.clipboard.writeText(
        `邮箱: ${result.owner.email}\n密码: ${result.owner.tempPassword}`
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/console/organizations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">创建企业</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription>填写企业的基本信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                企业名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="输入企业名称"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="industry">所属行业</Label>
                <Input
                  id="industry"
                  placeholder="如：科技、教育、金融"
                  value={formData.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">联系电话</Label>
                <Input
                  id="phone"
                  placeholder="输入联系电话"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 套餐配置 */}
        <Card>
          <CardHeader>
            <CardTitle>套餐配置</CardTitle>
            <CardDescription>选择企业套餐和配额</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="plan">选择套餐</Label>
                <Select
                  value={formData.plan}
                  onValueChange={(v) => handleChange('plan', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">免费版</SelectItem>
                    <SelectItem value="STARTER">入门版</SelectItem>
                    <SelectItem value="PROFESSIONAL">专业版</SelectItem>
                    <SelectItem value="ENTERPRISE">企业版</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiQuota">API 配额（次/月）</Label>
                <Input
                  id="apiQuota"
                  type="number"
                  min={0}
                  value={formData.apiQuota}
                  onChange={(e) =>
                    handleChange('apiQuota', parseInt(e.target.value) || 0)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 企业主账号 */}
        <Card>
          <CardHeader>
            <CardTitle>企业主账号</CardTitle>
            <CardDescription>创建企业的管理员账号</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">
                  邮箱 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  placeholder="admin@company.com"
                  value={formData.ownerEmail}
                  onChange={(e) => handleChange('ownerEmail', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerName">
                  姓名 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ownerName"
                  placeholder="输入姓名"
                  value={formData.ownerName}
                  onChange={(e) => handleChange('ownerName', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerPassword">初始密码</Label>
              <Input
                id="ownerPassword"
                type="password"
                placeholder="留空则自动生成"
                value={formData.ownerPassword}
                onChange={(e) => handleChange('ownerPassword', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                留空将自动生成随机密码
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 备注 */}
        <Card>
          <CardHeader>
            <CardTitle>备注</CardTitle>
            <CardDescription>平台内部备注信息</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="输入备注信息..."
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* 提交按钮 */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/console/organizations">取消</Link>
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            创建企业
          </Button>
        </div>
      </form>

      {/* 创建成功弹窗 */}
      <Dialog open={!!result} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>企业创建成功</DialogTitle>
            <DialogDescription>
              已成功创建企业「{result?.organization.name}」
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <h4 className="mb-2 font-medium">企业主账号信息</h4>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">邮箱：</span>
                  {result?.owner.email}
                </p>
                {result?.owner.tempPassword && (
                  <p>
                    <span className="text-muted-foreground">密码：</span>
                    {result.owner.tempPassword}
                  </p>
                )}
              </div>
            </div>
            {result?.owner.tempPassword && (
              <p className="text-sm text-muted-foreground">
                请将以上信息发送给企业主，首次登录后建议修改密码
              </p>
            )}
            <div className="flex justify-end gap-2">
              {result?.owner.tempPassword && (
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copied ? '已复制' : '复制信息'}
                </Button>
              )}
              <Button
                onClick={() =>
                  router.push(`/console/organizations/${result?.organization.id}`)
                }
              >
                查看详情
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
