import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确').toLowerCase().trim(),
  password: z.string()
    .min(12, '密码至少12位')
    .regex(/[A-Z]/, '密码必须包含大写字母')
    .regex(/[a-z]/, '密码必须包含小写字母')
    .regex(/[0-9]/, '密码必须包含数字')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, '密码必须包含特殊字符'),
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名最多50个字符').trim(),
  organizationName: z.string().min(2, '企业名称至少2个字符').max(100, '企业名称最多100个字符').trim(),
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
      return ApiResponse.error('该邮箱已被注册', 400)
    }

    // 创建企业和用户
    const passwordHash = await hash(password, 12)

    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        securitySettings: {
          passwordMinLength: 8,
          passwordRequireUppercase: false,
          passwordRequireNumber: false,
          passwordRequireSymbol: false,
          sessionTimeout: 10080, // 7天
          maxLoginAttempts: 5,
          ipWhitelist: [],
          twoFactorRequired: false,
        },
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

    return ApiResponse.created({
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
      return ApiResponse.error(issues[0]?.message || '输入验证失败', 400)
    }

    console.error('Register error:', error)
    return ApiResponse.error('注册失败，请稍后重试', 500)
  }
}
