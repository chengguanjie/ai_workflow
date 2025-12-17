import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SessionProvider } from 'next-auth/react'

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  )
}
