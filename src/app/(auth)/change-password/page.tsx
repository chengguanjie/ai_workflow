'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KeyRound, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { validatePassword, getRequirementsDescription, DEFAULT_REQUIREMENTS } from '@/lib/auth/password-validator'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordRequirements = getRequirementsDescription(DEFAULT_REQUIREMENTS)

  const validation = useMemo(() => {
    if (!newPassword) return null
    return validatePassword(newPassword)
  }, [newPassword])

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
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, confirmPassword }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '修改密码失败')
      }

      toast.success('密码修改成功，请重新登录')

      await signOut({ redirect: false })
      router.push('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <KeyRound className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">修改密码</CardTitle>
          <CardDescription>
            首次登录需要修改初始密码
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
              确认修改
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
