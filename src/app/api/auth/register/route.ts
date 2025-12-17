import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少6位'),
  name: z.string().min(1, '姓名不能为空'),
  organizationName: z.string().min(1, '企业名称不能为空'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, name, organizationName } = registerSchema.parse(body)

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: '该邮箱已被注册' },
        { status: 400 }
      )
    }

    // 创建企业和用户
    const passwordHash = await hash(password, 12)

    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        users: {
          create: {
            email,
            name,
            passwordHash,
            role: 'OWNER',
          },
        },
      },
      include: {
        users: true,
      },
    })

    const user = organization.users[0]

    return NextResponse.json({
      message: '注册成功',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: organization.id,
        organizationName: organization.name,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return NextResponse.json(
        { error: issues[0]?.message || '输入验证失败' },
        { status: 400 }
      )
    }

    console.error('Register error:', error)
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    )
  }
}
