'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  GitBranch,
  History,
  Settings,
  Plug,
  Users,
  ChevronLeft,
  ChevronRight,
  Bot,
  LayoutTemplate,
  Database,
  Building2,
  MessageSquarePlus,
  CreditCard,
  ClipboardCheck,
  Link2,
} from 'lucide-react'
import { useSidebarStore } from '@/stores/sidebar-store'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigation = [
  { name: '工作台', href: '/dashboard', icon: LayoutDashboard },
  { name: '工作流', href: '/workflows', icon: GitBranch },
  { name: '模板库', href: '/templates', icon: LayoutTemplate },
  { name: '知识库', href: '/knowledge-bases', icon: Database },
  { name: '审批待办', href: '/approvals', icon: ClipboardCheck },
  { name: '执行历史', href: '/executions', icon: History },
]

// 管理员专属设置菜单项（仅 OWNER 和 ADMIN 可见）
const adminSettingsNavigation = [
  { name: 'AI 配置', href: '/settings/ai-config', icon: Bot },
  { name: '渠道授权', href: '/settings/integrations', icon: Link2 },
  { name: 'API 调用', href: '/settings/api', icon: Plug },
  { name: '成员管理', href: '/settings/members', icon: Users },
  { name: '部门管理', href: '/settings/departments', icon: Building2 },
  { name: '付费管理', href: '/settings/billing', icon: CreditCard },
  { name: '企业设置', href: '/settings/organization', icon: Settings },
]

// 部门负责人设置菜单项（部门负责人可见）
const managerSettingsNavigation = [
  { name: '成员管理', href: '/settings/members', icon: Users },
]

const feedbackNavigation = [
  { name: '平台反馈', href: '/feedback', icon: MessageSquarePlus },
]

export function Sidebar() {
  const pathname = usePathname() ?? ''
  const { isCollapsed, toggle } = useSidebarStore()
  const { data: session } = useSession()

  // 判断用户角色权限
  const userRole = session?.user?.role
  const isAdmin = userRole === 'OWNER' || userRole === 'ADMIN'
  const isDepartmentManager = session?.user?.isDepartmentManager === true

  // 根据角色获取设置菜单
  const getSettingsNavigation = () => {
    if (isAdmin) {
      return adminSettingsNavigation
    }
    if (isDepartmentManager) {
      return managerSettingsNavigation
    }
    return [] // 普通员工不显示设置菜单
  }

  const settingsNavigation = getSettingsNavigation()

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'relative flex h-full flex-col border-r bg-background transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <GitBranch className="h-6 w-6 shrink-0 text-primary" />
            {!isCollapsed && (
              <span className="text-lg font-semibold whitespace-nowrap">AI Workflow</span>
            )}
          </Link>
        </div>

        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-muted"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </Button>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const linkContent = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isCollapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && item.name}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.name}</p>
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkContent
          })}

          {/* 设置菜单 - 仅在有菜单项时显示 */}
          {settingsNavigation.length > 0 && (
            <>
              <div className={cn('my-4 border-t', isCollapsed && 'mx-2')} />

              {!isCollapsed && (
                <p className="px-3 text-xs font-medium text-muted-foreground">设置</p>
              )}

              {settingsNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href)
                const linkContent = (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isCollapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!isCollapsed && item.name}
                  </Link>
                )

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return linkContent
              })}
            </>
          )}

          <div className={cn('my-4 border-t', isCollapsed && 'mx-2')} />

          {!isCollapsed && (
            <p className="px-3 text-xs font-medium text-muted-foreground">支持</p>
          )}

          {feedbackNavigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const linkContent = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isCollapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && item.name}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.name}</p>
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkContent
          })}
        </nav>
      </div>
    </TooltipProvider>
  )
}
