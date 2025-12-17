'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Settings,
  Shield,
  FileText,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    title: '数据看板',
    href: '/console/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: '入驻申请',
    href: '/console/applications',
    icon: ClipboardList,
  },
  {
    title: '企业管理',
    href: '/console/organizations',
    icon: Building2,
  },
  {
    title: '审计日志',
    href: '/console/audit-logs',
    icon: FileText,
  },
  {
    title: '管理员',
    href: '/console/settings/admins',
    icon: Shield,
  },
  {
    title: '系统设置',
    href: '/console/settings',
    icon: Settings,
  },
]

export function ConsoleSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/console/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Platform Console</span>
        </Link>
      </div>

      <nav className="space-y-1 p-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
