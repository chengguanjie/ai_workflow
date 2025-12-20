'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/console/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 使用 console 专用的认证 API
      const csrfRes = await fetch('/api/console/auth/csrf')
      const { csrfToken } = await csrfRes.json()

      const res = await fetch('/api/console/auth/callback/platform-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrfToken,
          email,
          password,
          callbackUrl,
        }),
        redirect: 'manual',
      })

      // 检查响应
      if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 200) {
        // 验证登录是否成功
        const sessionRes = await fetch('/api/console/auth/session')
        const session = await sessionRes.json()

        if (session?.user) {
          router.push(callbackUrl)
          router.refresh()
          return
        }
      }

      // 登录失败，尝试获取错误信息
      const url = new URL(res.url || window.location.href)
      const errorParam = url.searchParams.get('error')

      if (errorParam === 'ACCOUNT_LOCKED') {
        setError('账户已被锁定，请30分钟后重试')
      } else if (errorParam === 'ACCOUNT_DISABLED') {
        setError('账户已被禁用，请联系超级管理员')
      } else {
        setError('邮箱或密码错误')
      }
    } catch {
      setError('登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-background p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Platform Console</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            平台管理后台
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              placeholder="admin@platform.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            登录
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          仅限平台管理员登录
        </p>
      </div>
    </div>
  )
}

function LoginFormSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-background p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Platform Console</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            平台管理后台
          </p>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

export default function ConsoleLoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
