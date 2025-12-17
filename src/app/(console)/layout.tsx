import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { consoleAuth } from '@/lib/console-auth'
import { ConsoleSidebar } from '@/components/console/sidebar'
import { ConsoleHeader } from '@/components/console/header'

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await consoleAuth()

  // 如果未登录，重定向到登录页
  if (!session) {
    redirect('/console/login')
  }

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-muted/30">
        <ConsoleSidebar />
        <div className="ml-64">
          <ConsoleHeader />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </SessionProvider>
  )
}
