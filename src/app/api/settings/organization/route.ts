import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// 基本信息更新 schema
const updateInfoSchema = z.object({
  name: z.string().min(1, '企业名称不能为空').optional(),
  description: z.string().optional(),
  logo: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().url('网址格式不正确').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
})

// 安全设置 schema
const securitySettingsSchema = z.object({
  passwordMinLength: z.number().min(6).max(32).optional(),
  passwordRequireUppercase: z.boolean().optional(),
  passwordRequireNumber: z.boolean().optional(),
  passwordRequireSymbol: z.boolean().optional(),
  sessionTimeout: z.number().min(5).max(43200).optional(), // 5分钟到30天
  maxLoginAttempts: z.number().min(3).max(10).optional(),
  ipWhitelist: z.array(z.string()).optional(),
  twoFactorRequired: z.boolean().optional(),
})

// GET: 获取企业信息
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        logo: true,
        industry: true,
        website: true,
        phone: true,
        address: true,
        plan: true,
        apiQuota: true,
        apiUsed: true,
        securitySettings: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            workflows: true,
          },
        },
      },
    })

    if (!organization) {
      return NextResponse.json({ error: '企业不存在' }, { status: 404 })
    }

    // 解析安全设置，提供默认值
    const defaultSecuritySettings = {
      passwordMinLength: 8,
      passwordRequireUppercase: false,
      passwordRequireNumber: false,
      passwordRequireSymbol: false,
      sessionTimeout: 10080, // 7天
      maxLoginAttempts: 5,
      ipWhitelist: [],
      twoFactorRequired: false,
    }

    const securitySettings = {
      ...defaultSecuritySettings,
      ...(typeof organization.securitySettings === 'object' ? organization.securitySettings : {}),
    }

    return NextResponse.json({
      organization: {
        ...organization,
        securitySettings,
        stats: {
          memberCount: organization._count.users,
          workflowCount: organization._count.workflows,
        },
      },
    })
  } catch (error) {
    console.error('Failed to get organization:', error)
    return NextResponse.json({ error: '获取企业信息失败' }, { status: 500 })
  }
}

// PATCH: 更新企业信息
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有 OWNER 和 ADMIN 可以修改企业信息
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { type, data } = body

    if (type === 'info') {
      // 更新基本信息
      const validatedData = updateInfoSchema.parse(data)

      const organization = await prisma.organization.update({
        where: { id: session.user.organizationId },
        data: validatedData,
        select: {
          id: true,
          name: true,
          description: true,
          logo: true,
          industry: true,
          website: true,
          phone: true,
          address: true,
        },
      })

      // 记录审计日志
      await prisma.auditLog.create({
        data: {
          action: 'organization.info_updated',
          resource: 'organization',
          resourceId: organization.id,
          detail: {
            updatedFields: Object.keys(validatedData),
          },
          userId: session.user.id,
          organizationId: session.user.organizationId,
        },
      })

      return NextResponse.json({ organization })
    } else if (type === 'security') {
      // 更新安全设置（只有 OWNER 可以修改）
      if (session.user.role !== 'OWNER') {
        return NextResponse.json({ error: '只有企业所有者可以修改安全设置' }, { status: 403 })
      }

      const validatedSettings = securitySettingsSchema.parse(data)

      // 获取现有设置
      const existing = await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { securitySettings: true },
      })

      const currentSettings = typeof existing?.securitySettings === 'object'
        ? existing.securitySettings as Record<string, unknown>
        : {}

      // 合并设置
      const newSettings = { ...currentSettings, ...validatedSettings }

      const organization = await prisma.organization.update({
        where: { id: session.user.organizationId },
        data: { securitySettings: newSettings },
        select: {
          id: true,
          securitySettings: true,
        },
      })

      // 记录审计日志
      await prisma.auditLog.create({
        data: {
          action: 'organization.security_updated',
          resource: 'organization',
          resourceId: organization.id,
          detail: {
            updatedSettings: Object.keys(validatedSettings),
          },
          userId: session.user.id,
          organizationId: session.user.organizationId,
        },
      })

      return NextResponse.json({ organization })
    } else {
      return NextResponse.json({ error: '无效的更新类型' }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || '数据验证失败' },
        { status: 400 }
      )
    }

    console.error('Failed to update organization:', error)
    return NextResponse.json({ error: '更新企业信息失败' }, { status: 500 })
  }
}
