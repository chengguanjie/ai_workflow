import { NextRequest } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// 验证邮箱或手机号
const isEmailOrPhone = (value: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const phoneRegex = /^1[3-9]\d{9}$/ // 中国大陆手机号
  return emailRegex.test(value) || phoneRegex.test(value)
}

const createMemberSchema = z.object({
  email: z.string().min(1, '请输入邮箱或手机号').refine(isEmailOrPhone, '请输入有效的邮箱或手机号'),
  name: z.string().min(1, '姓名不能为空'),
  departmentId: z.string().optional(),
})

// 获取用户管理的部门ID列表（包括子部门）
async function getManagedDepartmentIds(userId: string, organizationId: string): Promise<string[]> {
  // 查找用户管理的所有部门
  const managedDepartments = await prisma.department.findMany({
    where: {
      managerId: userId,
      organizationId,
    },
    select: { id: true, path: true },
  })

  if (managedDepartments.length === 0) {
    return []
  }

  // 获取这些部门及其所有子部门
  const allDepartmentIds = new Set<string>()

  for (const dept of managedDepartments) {
    allDepartmentIds.add(dept.id)

    // 查找所有子部门（path 以当前部门路径开头）
    const childDepts = await prisma.department.findMany({
      where: {
        organizationId,
        OR: [
          { parentId: dept.id },
          { path: { startsWith: dept.path ? `${dept.path}/${dept.id}` : `/${dept.id}` } },
        ],
      },
      select: { id: true },
    })

    childDepts.forEach(child => allDepartmentIds.add(child.id))
  }

  return Array.from(allDepartmentIds)
}

// GET: 获取成员列表
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const isAdmin = session.user.role === 'OWNER' || session.user.role === 'ADMIN'

    // 构建查询条件
    const whereCondition: {
      organizationId: string
      departmentId?: { in: string[] } | null
    } = {
      organizationId: session.user.organizationId,
    }

    // 如果不是管理员，检查是否是部门负责人
    if (!isAdmin) {
      const managedDepartmentIds = await getManagedDepartmentIds(
        session.user.id,
        session.user.organizationId
      )

      // 如果不是部门负责人，返回空列表（普通员工无权查看成员）
      if (managedDepartmentIds.length === 0) {
        return ApiResponse.success({
          members: [],
          canManageMembers: false,
          managedDepartmentIds: [],
        })
      }

      // 部门负责人只能看到自己管理的部门中的成员
      whereCondition.departmentId = { in: managedDepartmentIds }
    }

    const members = await prisma.user.findMany({
      where: {
        ...whereCondition,
        isActive: true, // 只获取活跃成员
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        departmentId: true,
        department: {
          select: { id: true, name: true, level: true, parentId: true },
        },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    })

    // 计算角色排序权重
    const roleOrder = { OWNER: 0, ADMIN: 1, EDITOR: 2, MEMBER: 3, VIEWER: 4 }
    const sortedMembers = members.sort((a, b) => {
      return (roleOrder[a.role as keyof typeof roleOrder] || 99) -
        (roleOrder[b.role as keyof typeof roleOrder] || 99)
    })

    // 获取部门负责人管理的部门ID（用于前端判断）
    const managedDepartmentIds = isAdmin
      ? [] // 管理员可以管理所有
      : await getManagedDepartmentIds(session.user.id, session.user.organizationId)

    return ApiResponse.success({
      members: sortedMembers,
      canManageMembers: isAdmin || managedDepartmentIds.length > 0,
      managedDepartmentIds,
      isAdmin,
    })
  } catch (error) {
    console.error('Failed to get members:', error)
    return ApiResponse.error('获取成员列表失败', 500)
  }
}

// POST: 直接创建成员（初始密码123456）
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const isAdmin = session.user.role === 'OWNER' || session.user.role === 'ADMIN'

    // 获取用户管理的部门ID
    const managedDepartmentIds = isAdmin
      ? null // 管理员不受限制
      : await getManagedDepartmentIds(session.user.id, session.user.organizationId)

    // 检查权限：只有 OWNER、ADMIN 或部门负责人可以创建成员
    if (!isAdmin && (!managedDepartmentIds || managedDepartmentIds.length === 0)) {
      return ApiResponse.error('无权限创建成员', 403)
    }

    const body = await request.json()
    const { email, name, departmentId } = createMemberSchema.parse(body)

    // 部门负责人必须指定部门，且只能添加到自己管理的部门
    if (!isAdmin) {
      if (!departmentId) {
        return ApiResponse.error('请选择部门', 400)
      }
      if (!managedDepartmentIds!.includes(departmentId)) {
        return ApiResponse.error('您只能添加成员到您管理的部门', 403)
      }
    }

    // 检查邮箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      return ApiResponse.error('该邮箱已被注册', 400)
    }

    // 如果指定了部门，检查部门是否存在且属于当前企业
    if (departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      })
      if (!department || department.organizationId !== session.user.organizationId) {
        return ApiResponse.error('部门不存在', 400)
      }
    }

    // 创建用户，初始密码123456
    const passwordHash = await hash('123456', 12)

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: 'MEMBER', // 新成员默认为MEMBER
        organizationId: session.user.organizationId,
        departmentId: departmentId || null,
        mustChangePassword: true, // 首次登录需要修改密码
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        departmentId: true,
        department: {
          select: { id: true, name: true },
        },
      },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'member.created',
        resource: 'user',
        resourceId: user.id,
        detail: {
          email: user.email,
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
          createdBy: session.user.id,
        },
        userId: session.user.id,
        organizationId: session.user.organizationId,
      },
    })

    return ApiResponse.created({
      message: '成员创建成功',
      member: user,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return ApiResponse.error(issues[0]?.message || '输入验证失败', 400)
    }

    console.error('Create member error:', error)
    const errorMessage = error instanceof Error ? error.message : '创建成员失败'
    return ApiResponse.error(errorMessage, 500)
  }
}
