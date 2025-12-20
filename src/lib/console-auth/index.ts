import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db'
import type { PlatformRole } from '@prisma/client'

// 登录失败锁定配置
const MAX_LOGIN_ATTEMPTS = 5
const LOCK_DURATION_MINUTES = 30

export const {
  handlers: consoleHandlers,
  signIn: consoleSignIn,
  signOut: consoleSignOut,
  auth: consoleAuth,
} = NextAuth({
  basePath: '/api/console/auth',
  providers: [
    Credentials({
      id: 'platform-admin',
      name: 'platform-admin',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const admin = await prisma.platformAdmin.findUnique({
          where: { email: credentials.email as string },
        })

        if (!admin) {
          return null
        }

        // 检查账户是否被锁定
        if (admin.lockedUntil && admin.lockedUntil > new Date()) {
          throw new Error('ACCOUNT_LOCKED')
        }

        // 检查账户是否激活
        if (!admin.isActive) {
          throw new Error('ACCOUNT_DISABLED')
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          admin.passwordHash
        )

        if (!isPasswordValid) {
          // 增加失败次数
          const newAttempts = admin.loginAttempts + 1
          const updateData: { loginAttempts: number; lockedUntil?: Date } = {
            loginAttempts: newAttempts,
          }

          // 达到最大失败次数，锁定账户
          if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
            updateData.lockedUntil = new Date(
              Date.now() + LOCK_DURATION_MINUTES * 60 * 1000
            )
          }

          await prisma.platformAdmin.update({
            where: { id: admin.id },
            data: updateData,
          })

          if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
            throw new Error('ACCOUNT_LOCKED')
          }

          return null
        }

        // 登录成功，重置失败次数，更新登录时间
        await prisma.platformAdmin.update({
          where: { id: admin.id },
          data: {
            loginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        })

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.isAdmin = true // 标记为平台管理员
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as PlatformRole
        session.user.isAdmin = token.isAdmin as boolean
      }
      return session
    },
  },
  pages: {
    signIn: '/console/login',
    error: '/console/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 小时（比企业用户短）
  },
  cookies: {
    sessionToken: {
      name: 'console-session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
})

// 平台管理员 Session 类型
export interface ConsoleSession {
  user: {
    id: string
    email: string
    name?: string | null
    role: PlatformRole
    isAdmin: boolean
  }
  expires: string
}

// 类型扩展 - 添加平台管理员特有的属性
// 注意: role 属性已在 @/lib/auth/index.ts 中声明为 string 类型
// 这里只添加 isAdmin 属性，role 在使用时转换为 PlatformRole
declare module 'next-auth' {
  interface User {
    isAdmin?: boolean
  }
}
