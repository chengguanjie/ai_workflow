import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Role } from '@prisma/client'


// PATCH: 修改成员角色
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: memberId } = await params

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有 OWNER 和 ADMIN 可以修改角色
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { role: newRole } = body

    if (!newRole || !Object.values(Role).includes(newRole)) {
      return NextResponse.json({ error: '无效的角色' }, { status: 400 })
    }

    // 获取目标成员信息
    const targetMember = await prisma.user.findUnique({
      where: { id: memberId },
    })

    if (!targetMember || targetMember.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: '成员不存在' }, { status: 404 })
    }

    // 不能修改自己的角色
    if (memberId === session.user.id) {
      return NextResponse.json({ error: '不能修改自己的角色' }, { status: 400 })
    }

    // OWNER 角色不能被修改
    if (targetMember.role === 'OWNER') {
      return NextResponse.json({ error: '不能修改企业所有者的角色' }, { status: 400 })
    }

    // 不能设置为 OWNER
    if (newRole === 'OWNER') {
      return NextResponse.json({ error: '不能将成员设为企业所有者' }, { status: 400 })
    }

    // ADMIN 不能操作其他 ADMIN
    if (session.user.role === 'ADMIN' && targetMember.role === 'ADMIN') {
      return NextResponse.json({ error: 'ADMIN 不能修改其他 ADMIN 的角色' }, { status: 403 })
    }

    // 更新角色
    const updatedMember = await prisma.user.update({
      where: { id: memberId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'member.role_changed',
        resource: 'user',
        resourceId: memberId,
        detail: {
          oldRole: targetMember.role,
          newRole: newRole,
          memberEmail: targetMember.email,
        },
        userId: session.user.id,
        organizationId: session.user.organizationId,
      },
    })

    return NextResponse.json({ member: updatedMember })
  } catch (error) {
    console.error('Failed to update member role:', error)
    return NextResponse.json({ error: '修改角色失败' }, { status: 500 })
  }
}

// DELETE: 移除成员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: memberId } = await params

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有 OWNER 和 ADMIN 可以移除成员
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    // 获取目标成员信息
    const targetMember = await prisma.user.findUnique({
      where: { id: memberId },
    })

    if (!targetMember || targetMember.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: '成员不存在' }, { status: 404 })
    }

    // 不能移除自己
    if (memberId === session.user.id) {
      return NextResponse.json({ error: '不能移除自己' }, { status: 400 })
    }

    // 不能移除 OWNER
    if (targetMember.role === 'OWNER') {
      return NextResponse.json({ error: '不能移除企业所有者' }, { status: 400 })
    }

    // ADMIN 不能移除其他 ADMIN
    if (session.user.role === 'ADMIN' && targetMember.role === 'ADMIN') {
      return NextResponse.json({ error: 'ADMIN 不能移除其他 ADMIN' }, { status: 403 })
    }

    // 软删除：将用户设为不活跃，而不是真删除
    await prisma.user.update({
      where: { id: memberId },
      data: { isActive: false },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'member.removed',
        resource: 'user',
        resourceId: memberId,
        detail: {
          memberEmail: targetMember.email,
          memberName: targetMember.name,
          memberRole: targetMember.role,
        },
        userId: session.user.id,
        organizationId: session.user.organizationId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove member:', error)
    return NextResponse.json({ error: '移除成员失败' }, { status: 500 })
  }
}
