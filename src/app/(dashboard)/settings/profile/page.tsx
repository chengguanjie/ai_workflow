'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { User, Lock, Shield, Eye, EyeOff } from 'lucide-react'

const profileSchema = z.object({
  name: z.string().min(2, '姓名至少需要2个字符'),
  email: z.string().email('请输入有效的邮箱地址'),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z
    .string()
    .min(8, '密码至少需要8个字符')
    .regex(/[A-Z]/, '密码需要包含至少一个大写字母')
    .regex(/[a-z]/, '密码需要包含至少一个小写字母')
    .regex(/[0-9]/, '密码需要包含至少一个数字'),
  confirmPassword: z.string().min(1, '请确认新密码'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
})

type ProfileFormData = z.infer<typeof profileSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

export default function ProfileSettingsPage() {
  const { data: session, update: updateSession } = useSession()
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: session?.user?.name || '',
      email: session?.user?.email || '',
    },
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const onUpdateProfile = async (data: ProfileFormData) => {
    setIsUpdatingProfile(true)
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '更新失败')
      }

      await updateSession({ name: data.name })
      toast.success('个人信息已更新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败，请稍后重试')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const onUpdatePassword = async (data: PasswordFormData) => {
    setIsUpdatingPassword(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '密码修改失败')
      }

      passwordForm.reset()
      toast.success('密码已成功修改')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '密码修改失败，请稍后重试')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">个人设置</h1>
        <p className="text-muted-foreground">
          管理您的个人信息和账户安全
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            个人信息
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Lock className="h-4 w-4" />
            账户安全
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          {/* 头像卡片 */}
          <Card>
            <CardHeader>
              <CardTitle>头像</CardTitle>
              <CardDescription>您的个人头像将显示在应用的各个位置</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={session?.user?.image || ''} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  头像基于您的姓名自动生成
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 基本信息卡片 */}
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>更新您的个人基本信息</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">姓名</Label>
                  <Input
                    id="name"
                    {...profileForm.register('name')}
                    placeholder="请输入您的姓名"
                  />
                  {profileForm.formState.errors.name && (
                    <p className="text-sm text-destructive">
                      {profileForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    {...profileForm.register('email')}
                    placeholder="请输入您的邮箱"
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    邮箱地址不可修改，如需更改请联系管理员
                  </p>
                  {profileForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {profileForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>角色</Label>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {session?.user?.role === 'ADMIN' ? '管理员' :
                       session?.user?.role === 'OWNER' ? '所有者' : '成员'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? '保存中...' : '保存修改'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          {/* 修改密码卡片 */}
          <Card>
            <CardHeader>
              <CardTitle>修改密码</CardTitle>
              <CardDescription>
                定期修改密码可以提高账户安全性。密码需要至少8个字符，包含大小写字母和数字。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onUpdatePassword)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">当前密码</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      {...passwordForm.register('currentPassword')}
                      placeholder="请输入当前密码"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="text-sm text-destructive">
                      {passwordForm.formState.errors.currentPassword.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">新密码</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      {...passwordForm.register('newPassword')}
                      placeholder="请输入新密码"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {passwordForm.formState.errors.newPassword && (
                    <p className="text-sm text-destructive">
                      {passwordForm.formState.errors.newPassword.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认新密码</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      {...passwordForm.register('confirmPassword')}
                      placeholder="请再次输入新密码"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium mb-2">密码要求：</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 至少8个字符</li>
                    <li>• 至少一个大写字母 (A-Z)</li>
                    <li>• 至少一个小写字母 (a-z)</li>
                    <li>• 至少一个数字 (0-9)</li>
                  </ul>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isUpdatingPassword}>
                    {isUpdatingPassword ? '修改中...' : '修改密码'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* 登录历史卡片 */}
          <Card>
            <CardHeader>
              <CardTitle>账户安全提示</CardTitle>
              <CardDescription>保护您账户安全的建议</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  定期更换密码，建议每3个月更换一次
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  不要在多个网站使用相同的密码
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  不要将密码告诉他人或写在容易被发现的地方
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  如发现账户异常，请立即修改密码并联系管理员
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
