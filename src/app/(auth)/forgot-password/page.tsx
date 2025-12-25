'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
                  const [email, setEmail] = useState('')
                  const [loading, setLoading] = useState(false)
                  const [isSubmitted, setIsSubmitted] = useState(false)
                  const [error, setError] = useState('')

                  const handleSubmit = async (e: React.FormEvent) => {
                                    e.preventDefault()
                                    setError('')
                                    setLoading(true)

                                    try {
                                                      const res = await fetch('/api/auth/forgot-password', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ email }),
                                                      })

                                                      const data = await res.json()

                                                      if (!res.ok) {
                                                                        throw new Error(data.message || '发送请求失败')
                                                      }

                                                      setIsSubmitted(true)
                                    } catch (err) {
                                                      setError(err instanceof Error ? err.message : '发送请求失败')
                                    } finally {
                                                      setLoading(false)
                                    }
                  }

                  if (isSubmitted) {
                                    return (
                                                      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
                                                                        <Card className="w-full max-w-md">
                                                                                          <CardHeader className="text-center">
                                                                                                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                                                                                                                              <CheckCircle2 className="h-8 w-8 text-green-600" />
                                                                                                            </div>
                                                                                                            <CardTitle className="text-2xl">邮件已发送</CardTitle>
                                                                                                            <CardDescription className="pt-2 text-base">
                                                                                                                              如果 <strong>{email}</strong> 是已注册的邮箱，您将收到一封包含重置密码指令的邮件。
                                                                                                            </CardDescription>
                                                                                          </CardHeader>
                                                                                          <CardContent className="flex flex-col gap-4">
                                                                                                            <div className="rounded-lg bg-orange-50 p-4 text-sm text-orange-800">
                                                                                                                              <p>请检查您的收件箱及垃圾邮件文件夹。邮件通常会在几分钟内送达。</p>
                                                                                                            </div>

                                                                                                            <Button asChild className="w-full" variant="outline">
                                                                                                                              <Link href="/login">
                                                                                                                                                返回登录
                                                                                                                              </Link>
                                                                                                            </Button>

                                                                                                            <Button
                                                                                                                              variant="link"
                                                                                                                              className="mt-2 text-muted-foreground"
                                                                                                                              onClick={() => setIsSubmitted(false)}
                                                                                                            >
                                                                                                                              没收到？重试
                                                                                                            </Button>
                                                                                          </CardContent>
                                                                        </Card>
                                                      </div>
                                    )
                  }

                  return (
                                    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
                                                      <Card className="w-full max-w-md">
                                                                        <CardHeader className="text-center">
                                                                                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                                                                                                            <Mail className="h-6 w-6 text-primary-foreground" />
                                                                                          </div>
                                                                                          <CardTitle className="text-2xl">忘记密码？</CardTitle>
                                                                                          <CardDescription>
                                                                                                            输入您的注册邮箱，我们将向您发送重置密码的链接
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
                                                                                                                              <Label htmlFor="email">邮箱地址</Label>
                                                                                                                              <Input
                                                                                                                                                id="email"
                                                                                                                                                type="email"
                                                                                                                                                placeholder="name@example.com"
                                                                                                                                                value={email}
                                                                                                                                                onChange={(e) => setEmail(e.target.value)}
                                                                                                                                                required
                                                                                                                              />
                                                                                                            </div>

                                                                                                            <Button type="submit" className="w-full" disabled={loading}>
                                                                                                                              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                                                                              发送重置链接
                                                                                                            </Button>

                                                                                                            <div className="mt-4 text-center">
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
                                    </div>
                  )
}
