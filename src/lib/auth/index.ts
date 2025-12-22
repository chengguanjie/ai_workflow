import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: '邮箱/手机号', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // 支持邮箱或手机号登录
        const account = credentials.email as string
        const user = await prisma.user.findUnique({
          where: { email: account.toLowerCase() },
          include: { organization: true },
        })

        if (!user || !user.isActive) {
          return null
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isPasswordValid) {
          return null
        }

        // 更新最后登录时间
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        // 检查是否是部门负责人
        let isDepartmentManager = false
        let managedDepartmentIds: string[] = []
        if (user.departmentId) {
          // 查询用户是否是任何部门的负责人
          const managedDepartments = await prisma.department.findMany({
            where: {
              managerId: user.id,
              organizationId: user.organizationId,
            },
            select: { id: true },
          })
          isDepartmentManager = managedDepartments.length > 0
          managedDepartmentIds = managedDepartments.map(d => d.id)
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          departmentId: user.departmentId,
          isDepartmentManager,
          managedDepartmentIds,
          mustChangePassword: user.mustChangePassword,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.organizationId = user.organizationId
        token.organizationName = user.organizationName
        token.departmentId = user.departmentId
        token.isDepartmentManager = user.isDepartmentManager
        token.managedDepartmentIds = user.managedDepartmentIds
        token.mustChangePassword = user.mustChangePassword
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.organizationId = token.organizationId as string
        session.user.organizationName = token.organizationName as string
        session.user.departmentId = token.departmentId as string | null
        session.user.isDepartmentManager = token.isDepartmentManager as boolean
        session.user.managedDepartmentIds = token.managedDepartmentIds as string[]
        session.user.mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
})

// 类型扩展
declare module 'next-auth' {
  interface User {
    role?: string
    organizationId?: string
    organizationName?: string
    departmentId?: string | null
    isDepartmentManager?: boolean
    managedDepartmentIds?: string[]
    mustChangePassword?: boolean
  }

  interface Session {
    user: User & {
      id: string
      role: string
      organizationId: string
      organizationName: string
      departmentId: string | null
      isDepartmentManager: boolean
      managedDepartmentIds: string[]
      mustChangePassword: boolean
    }
  }
}

