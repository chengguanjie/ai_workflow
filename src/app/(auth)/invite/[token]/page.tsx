'use client'

import { useState, useEffect, Suspense, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitBranch, Loader2, CheckCircle2, XCircle, Building2, Check, X } from 'lucide-react'
import { validatePassword, getRequirementsDescription, DEFAULT_REQUIREMENTS } from '@/lib/auth/password-validator'

interface Invitation {
  id: string
  email: string | null
  role: string
  type: 'EMAIL' | 'LINK'
  organization: {
    id: string
    name: string
    logo: string | null
  }
  department: {
    id: string
    name: string
  } | null
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理员',
  EDITOR: '编辑者',
  MEMBER: '成员',
  VIEWER: '观察者',
}

function InviteForm({ token }: { token: string }) {
  const router = useRouter()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const passwordRequirements = getRequirementsDescription(DEFAULT_REQUIREMENTS)
  
  const validation = useMemo(() => {
    if (!password) return null
    return validatePassword(password)
  }, [password])

  useEffect(() => {
    verifyInvitation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const verifyInvitation = async () => {
    try {
      const res = await fetch(`/api/invite?token=${token}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '邀请验证失败')
      }

      const data = await res.json()
      setInvitation(data.invitation)

      // 如果是邮件邀请，预填邮箱
      if (data.invitation.email) {
        setEmail(data.invitation.email)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '邀请验证失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    const validationResult = validatePassword(password)
    if (!validationResult.isValid) {
      setError(validationResult.errors[0])
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          name,
          password,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '加入失败')
      }

      setSuccess(true)

      // 3秒后跳转到登录页
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">验证邀请中...</p>
        </CardContent>
      </Card>
    )
  }

  if (error && !invitation) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-destructive/10 p-3">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <p className="mt-4 font-medium">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            邀请可能已过期或已被使用
          </p>
          <Link href="/login" className="mt-4">
            <Button variant="outline">返回登录</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-green-100 p-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <p className="mt-4 font-medium">加入成功！</p>
          <p className="mt-2 text-sm text-muted-foreground">
            即将跳转到登录页面...
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
          <GitBranch className="h-6 w-6 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl">加入团队</CardTitle>
        <CardDescription>
          您被邀请加入以下团队
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 团队信息 */}
        <div className="mb-6 rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{invitation?.organization.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">
                  {ROLE_LABELS[invitation?.role || 'MEMBER']}
                </Badge>
                {invitation?.department && (
                  <Badge variant="outline">
                    {invitation.department.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={invitation?.type === 'EMAIL'}
              required
            />
            {invitation?.type === 'EMAIL' && (
              <p className="text-xs text-muted-foreground">
                邮箱地址已由邀请指定
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input
              id="name"
              type="text"
              placeholder="您的姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="请设置密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="space-y-1 mt-2">
              <p className="text-xs text-muted-foreground mb-1">密码要求：</p>
              {passwordRequirements.map((req, index) => {
                let isMet = false
                if (password) {
                  if (req.includes('12')) isMet = password.length >= 12
                  else if (req.includes('大写')) isMet = /[A-Z]/.test(password)
                  else if (req.includes('小写')) isMet = /[a-z]/.test(password)
                  else if (req.includes('数字')) isMet = /[0-9]/.test(password)
                  else if (req.includes('特殊')) isMet = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)
                }
                return (
                  <div key={index} className="flex items-center gap-1 text-xs">
                    {password ? (
                      isMet ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 text-muted-foreground" />
                      )
                    ) : (
                      <span className="w-3 h-3" />
                    )}
                    <span className={password && isMet ? 'text-green-600' : 'text-muted-foreground'}>
                      {req}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-destructive">两次输入的密码不一致</p>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={submitting || !validation?.isValid || password !== confirmPassword}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            加入团队
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link href="/login" className="text-primary hover:underline">
            直接登录
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function InviteFormSkeleton() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
          <GitBranch className="h-6 w-6 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl">加入团队</CardTitle>
        <CardDescription>验证邀请中...</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Suspense fallback={<InviteFormSkeleton />}>
        <InviteForm token={token} />
      </Suspense>
    </div>
  )
}
