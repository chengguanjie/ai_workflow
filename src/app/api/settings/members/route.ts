import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

// GET: 获取所有成员
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const members = await prisma.user.findMany({
      where: {
        organizationId: session.user.organizationId,
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
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { role: 'asc' }, // OWNER 排最前
        { createdAt: 'asc' },
      ],
    })

    // 计算角色排序权重
    const roleOrder = { OWNER: 0, ADMIN: 1, EDITOR: 2, MEMBER: 3, VIEWER: 4 }
    const sortedMembers = members.sort((a, b) => {
      return (roleOrder[a.role as keyof typeof roleOrder] || 99) -
             (roleOrder[b.role as keyof typeof roleOrder] || 99)
    })

    return NextResponse.json({ members: sortedMembers })
  } catch (error) {
    console.error('Failed to get members:', error)
    return NextResponse.json({ error: '获取成员列表失败' }, { status: 500 })
  }
}

// POST: 直接创建成员（初始密码123456）
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 检查权限：只有 OWNER 和 ADMIN 可以创建成员
    if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权限创建成员' }, { status: 403 })
    }

    const body = await request.json()
    const { email, name, departmentId } = createMemberSchema.parse(body)

    // 检查邮箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 })
    }

    // 如果指定了部门，检查部门是否存在且属于当前企业
    if (departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      })
      if (!department || department.organizationId !== session.user.organizationId) {
        return NextResponse.json({ error: '部门不存在' }, { status: 400 })
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

    return NextResponse.json({
      message: '成员创建成功',
      member: user,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return NextResponse.json(
        { error: issues[0]?.message || '输入验证失败' },
        { status: 400 }
      )
    }

    console.error('Create member error:', error)
    const errorMessage = error instanceof Error ? error.message : '创建成员失败'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
