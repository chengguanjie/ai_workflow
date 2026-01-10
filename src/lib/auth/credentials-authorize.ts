import { compare } from 'bcryptjs'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/db'

export type CredentialsAuthorizeInput = {
  email?: string
  password?: string
}

export type CredentialsAuthorizeResult = Session['user'] | null

/**
 * Shared credentials authorization logic (used by NextAuth Credentials provider).
 * Kept in a standalone module so it can be exercised by integration tests.
 */
export async function authorizeCredentials(
  credentials: CredentialsAuthorizeInput
): Promise<CredentialsAuthorizeResult> {
  if (!credentials?.email || !credentials?.password) {
    return null
  }

  // 支持邮箱或手机号登录（当前实现统一使用 email 字段存储）
  const account = credentials.email as string
  const user = await prisma.user.findUnique({
    where: { email: account.toLowerCase() },
    include: { organization: true },
  })

  if (!user || !user.isActive) {
    return null
  }

  // 检查账户是否被锁定
  if (user.lockedUntil && new Date() < user.lockedUntil) {
    return null
  }

  // 检查企业状态
  const orgStatus = user.organization.status
  if (orgStatus === 'SUSPENDED' || orgStatus === 'DISABLED' || orgStatus === 'PENDING') {
    return null
  }

  const isPasswordValid = await compare(credentials.password as string, user.passwordHash)

  if (!isPasswordValid) {
    // 登录失败，增加失败次数
    const newAttempts = (user.loginAttempts || 0) + 1
    const maxAttempts = 5
    const lockDurationMinutes = 30

    if (newAttempts >= maxAttempts) {
      // 达到最大失败次数，锁定账户
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: newAttempts,
          lockedUntil: new Date(Date.now() + lockDurationMinutes * 60 * 1000),
        },
      })
    } else {
      // 更新失败次数
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      })
    }
    return null
  }

  // 登录成功，重置失败次数和锁定时间
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      loginAttempts: 0,
      lockedUntil: null,
    },
  })

  // 检查是否是部门负责人
  let isDepartmentManager = false
  let managedDepartmentIds: string[] = []
  if (user.departmentId) {
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
}

