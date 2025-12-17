'use client'

import { useSession, signOut } from 'next-auth/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, User } from 'lucide-react'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  OPERATOR: '运营',
  SUPPORT: '客服',
}

export function ConsoleHeader() {
  const { data: session } = useSession()

  const handleSignOut = () => {
    signOut({ callbackUrl: '/console/login' })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-medium">平台管理后台</h1>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || 'A'}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-sm font-medium">
                  {session?.user?.name || session?.user?.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {roleLabels[session?.user?.role as string] || '管理员'}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>我的账号</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              个人设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
