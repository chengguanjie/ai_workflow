'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useSafeSearchParams } from '@/hooks/use-safe-search-params'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KeyRound, Loader2, Check, X, ArrowLeft } from 'lucide-react'
import { validatePassword, getRequirementsDescription, DEFAULT_REQUIREMENTS } from '@/lib/auth/password-validator'

function ResetPasswordForm() {
                  const router = useRouter()
                  const searchParams = useSafeSearchParams()
                  const token = searchParams.get('token') ?? ''

                  const [newPassword, setNewPassword] = useState('')
                  const [confirmPassword, setConfirmPassword] = useState('')
                  const [error, setError] = useState('')
                  const [loading, setLoading] = useState(false)
                  const [success, setSuccess] = useState(false)

                  const passwordRequirements = getRequirementsDescription(DEFAULT_REQUIREMENTS)

                  const validation = useMemo(() => {
                                    if (!newPassword) return null
                                    return validatePassword(newPassword)
                  }, [newPassword])

                  // 如果没有 token，显示错误
                  if (!token) {
                                    return (
                                                      <Card className="w-full max-w-md">
                                                                        <CardHeader className="text-center">
                                                                                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                                                                                                            <X className="h-6 w-6 text-destructive" />
                                                                                          </div>
                                                                                          <CardTitle className="text-2xl">无效链接</CardTitle>
                                                                                          <CardDescription>
                                                                                                            重置密码链接无效或已过期。
                                                                                          </CardDescription>
                                                                        </CardHeader>
                                                                        <CardContent className="flex justify-center">
                                                                                          <Button asChild variant="default">
                                                                                                            <Link href="/forgot-password">
                                                                                                                              重新申请重置
                                                                                                            </Link>
                                                                                          </Button>
                                                                        </CardContent>
                                                      </Card>
                                    )
                  }

                  const handleSubmit = async (e: React.FormEvent) => {
                                    e.preventDefault()
                                    setError('')

                                    if (newPassword !== confirmPassword) {
                                                      setError('两次输入的密码不一致')
                                                      return
                                    }

                                    const validationResult = validatePassword(newPassword)
                                    if (!validationResult.isValid) {
                                                      setError(validationResult.errors[0])
                                                      return
                                    }

                                    setLoading(true)

                                    try {
                                                      const res = await fetch('/api/auth/reset-password', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ token, newPassword, confirmPassword }),
                                                      })

                                                      const data = await res.json()

                                                      if (!res.ok) {
                                                                        throw new Error(data.message || '重置密码失败')
                                                      }

                                                      setSuccess(true)

                                                      // 3秒后跳转到登录页
                                                      setTimeout(() => {
                                                                        router.push('/login')
                                                      }, 3000)

                                    } catch (err) {
                                                      setError(err instanceof Error ? err.message : '重置密码失败')
                                    } finally {
                                                      setLoading(false)
                                    }
                  }

                  if (success) {
                                    return (
                                                      <Card className="w-full max-w-md">
                                                                        <CardHeader className="text-center">
                                                                                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                                                                                                            <Check className="h-8 w-8 text-green-600" />
                                                                                          </div>
                                                                                          <CardTitle className="text-2xl">密码重置成功</CardTitle>
                                                                                          <CardDescription>
                                                                                                            您的密码已成功更新。正在跳转到登录页面...
                                                                                          </CardDescription>
                                                                        </CardHeader>
                                                                        <CardContent>
                                                                                          <Button asChild className="w-full">
                                                                                                            <Link href="/login">
                                                                                                                              立即登录
                                                                                                            </Link>
                                                                                          </Button>
                                                                        </CardContent>
                                                      </Card>
                                    )
                  }

                  return (
                                    <Card className="w-full max-w-md">
                                                      <CardHeader className="text-center">
                                                                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                                                                                          <KeyRound className="h-6 w-6 text-primary-foreground" />
                                                                        </div>
                                                                        <CardTitle className="text-2xl">设置新密码</CardTitle>
                                                                        <CardDescription>
                                                                                          请输入您的新密码
                                                                        </CardDescription>
                                                      </CardHeader>
                                                      <CardContent>
                                                                        <form onSubmit={handleSubmit} className="space-y-4">
                                                                                          {error && (
                                                                                                            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                                                                                                              {error}
                                                                                                            </div>
                                                                                          )}

                                                                                          <div className="space-y-2">
                                                                                                            <Label htmlFor="newPassword">新密码</Label>
                                                                                                            <Input
                                                                                                                              id="newPassword"
                                                                                                                              type="password"
                                                                                                                              placeholder="请输入新密码"
                                                                                                                              value={newPassword}
                                                                                                                              onChange={(e) => setNewPassword(e.target.value)}
                                                                                                                              required
                                                                                                            />
                                                                                                            <div className="space-y-1 mt-2">
                                                                                                                              <p className="text-xs text-muted-foreground mb-1">密码要求：</p>
                                                                                                                              {passwordRequirements.map((req, index) => {
                                                                                                                                                let isMet = false
                                                                                                                                                if (newPassword) {
                                                                                                                                                                  if (req.includes('12')) isMet = newPassword.length >= 12
                                                                                                                                                                  else if (req.includes('大写')) isMet = /[A-Z]/.test(newPassword)
                                                                                                                                                                  else if (req.includes('小写')) isMet = /[a-z]/.test(newPassword)
                                                                                                                                                                  else if (req.includes('数字')) isMet = /[0-9]/.test(newPassword)
                                                                                                                                                                  else if (req.includes('特殊')) isMet = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)
                                                                                                                                                }
                                                                                                                                                return (
                                                                                                                                                                  <div key={index} className="flex items-center gap-1 text-xs">
                                                                                                                                                                                    {newPassword ? (
                                                                                                                                                                                                      isMet ? (
                                                                                                                                                                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                                                                                                                                                      ) : (
                                                                                                                                                                                                                        <X className="h-3 w-3 text-muted-foreground" />
                                                                                                                                                                                                      )
                                                                                                                                                                                    ) : (
                                                                                                                                                                                                      <span className="w-3 h-3" />
                                                                                                                                                                                    )}
                                                                                                                                                                                    <span className={newPassword && isMet ? 'text-green-600' : 'text-muted-foreground'}>
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
                                                                                                                              placeholder="请再次输入新密码"
                                                                                                                              value={confirmPassword}
                                                                                                                              onChange={(e) => setConfirmPassword(e.target.value)}
                                                                                                                              required
                                                                                                            />
                                                                                                            {confirmPassword && newPassword !== confirmPassword && (
                                                                                                                              <p className="text-xs text-destructive">两次输入的密码不一致</p>
                                                                                                            )}
                                                                                          </div>

                                                                                          <Button
                                                                                                            type="submit"
                                                                                                            className="w-full"
                                                                                                            disabled={loading || !validation?.isValid || newPassword !== confirmPassword}
                                                                                          >
                                                                                                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                                                            重置密码
                                                                                          </Button>

                                                                                          <div className="text-center">
                                                                                                            <Link
                                                                                                                              href="/login"
                                                                                                                              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                                                                                                            >
                                                                                                                              <ArrowLeft className="mr-2 h-4 w-4" />
                                                                                                                              返回登录
                                                                                                            </Link>
                                                                                          </div>
                                                                        </form>
                                                      </CardContent>
                                    </Card>
                  )
}

export default function ResetPasswordPage() {
                  return (
                                    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
                                                      <Suspense fallback={
                                                                        <Card className="w-full max-w-md">
                                                                                          <CardContent className="pt-6 text-center">
                                                                                                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                                                                                            <p className="mt-2 text-muted-foreground">加载中...</p>
                                                                                          </CardContent>
                                                                        </Card>
                                                      }>
                                                                        <ResetPasswordForm />
                                                      </Suspense>
                                    </div>
                  )
}
