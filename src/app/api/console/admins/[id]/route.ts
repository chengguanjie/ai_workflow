import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { consoleAuth } from '@/lib/console-auth'
import { hash } from 'bcryptjs'
import { PlatformRole } from '@prisma/client'

// 获取单个管理员
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params

    const admin = await prisma.platformAdmin.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        loginAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
      },
    })

    if (!admin) {
      return NextResponse.json({ error: '管理员不存在' }, { status: 404 })
    }

    return NextResponse.json(admin)
  } catch (error) {
    console.error('获取管理员详情失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

// 更新管理员
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有超管可以修改管理员
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '只有超级管理员可以修改管理员' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, role, isActive, password, unlockAccount } = body

    const existing = await prisma.platformAdmin.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '管理员不存在' }, { status: 404 })
    }

    // 不能禁用自己
    if (id === session.user.id && isActive === false) {
      return NextResponse.json({ error: '不能禁用自己的账户' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (role !== undefined) {
      const validRoles: PlatformRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'SUPPORT']
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: '无效的角色' }, { status: 400 })
      }
      updateData.role = role
    }
    if (isActive !== undefined) updateData.isActive = isActive
    if (password) {
      updateData.passwordHash = await hash(password, 12)
    }
    if (unlockAccount) {
      updateData.loginAttempts = 0
      updateData.lockedUntil = null
    }

    const admin = await prisma.platformAdmin.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    // 记录审计日志
    await prisma.platformAuditLog.create({
      data: {
        action: 'UPDATE_ADMIN',
        resource: 'admin',
        resourceId: admin.id,
        detail: { changes: Object.keys(updateData) },
        adminId: session.user.id,
      },
    })

    return NextResponse.json(admin)
  } catch (error) {
    console.error('更新管理员失败:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

// 删除管理员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await consoleAuth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有超管可以删除管理员
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '只有超级管理员可以删除管理员' }, { status: 403 })
    }

    const { id } = await params

    // 不能删除自己
    if (id === session.user.id) {
      return NextResponse.json({ error: '不能删除自己的账户' }, { status: 400 })
    }

    const existing = await prisma.platformAdmin.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '管理员不存在' }, { status: 404 })
    }

    // 删除管理员（审计日志会因外键约束被级联删除或报错，根据需求处理）
    await prisma.platformAdmin.delete({
      where: { id },
    })

    // 记录审计日志
    await prisma.platformAuditLog.create({
      data: {
        action: 'DELETE_ADMIN',
        resource: 'admin',
        resourceId: id,
        detail: { email: existing.email, name: existing.name },
        adminId: session.user.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除管理员失败:', error)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
