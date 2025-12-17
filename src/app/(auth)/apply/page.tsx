'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function ApplyPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    orgName: '',
    industry: '',
    website: '',
    phone: '',
    description: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  })

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '提交失败')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md space-y-6 rounded-xl bg-background p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold">申请已提交</h1>
          <p className="text-muted-foreground">
            我们已收到您的企业入驻申请，工作人员将在 1-3
            个工作日内完成审核。审核结果将通过邮件通知您。
          </p>
          <div className="pt-4">
            <Button asChild variant="outline">
              <Link href="/login">返回登录</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-2xl space-y-6 rounded-xl bg-background p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">企业入驻申请</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            填写以下信息申请开通企业账号
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* 企业信息 */}
          <div className="space-y-4">
            <h3 className="font-medium">企业信息</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orgName">
                  企业名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="orgName"
                  placeholder="输入企业全称"
                  value={formData.orgName}
                  onChange={(e) => handleChange('orgName', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">所属行业</Label>
                <Input
                  id="industry"
                  placeholder="如：科技、教育、金融"
                  value={formData.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website">企业网站</Label>
                <Input
                  id="website"
                  placeholder="https://www.example.com"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">联系电话</Label>
                <Input
                  id="phone"
                  placeholder="输入企业联系电话"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">企业简介</Label>
              <Textarea
                id="description"
                placeholder="简单介绍您的企业..."
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* 联系人信息 */}
          <div className="space-y-4">
            <h3 className="font-medium">联系人信息</h3>
            <p className="text-sm text-muted-foreground">
              审核通过后，该联系人将成为企业管理员
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactName">
                  姓名 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactName"
                  placeholder="输入姓名"
                  value={formData.contactName}
                  onChange={(e) => handleChange('contactName', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">
                  邮箱 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactEmail"
                  type="email"
                  placeholder="用于登录的邮箱"
                  value={formData.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2 sm:w-1/2">
              <Label htmlFor="contactPhone">手机号码</Label>
              <Input
                id="contactPhone"
                placeholder="输入手机号码"
                value={formData.contactPhone}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              已有账号？
              <Link href="/login" className="text-primary hover:underline">
                立即登录
              </Link>
            </p>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              提交申请
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
