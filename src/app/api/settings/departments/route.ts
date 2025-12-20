import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateDepartmentPath } from '@/lib/permissions/department'

// GET: 获取所有部门（支持树形结构）
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const departments = await prisma.department.findMany({
      where: {
        organizationId: session.user.organizationId,
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: [
        { level: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    })

    // 获取负责人信息
    const managerIds = departments.map(d => d.managerId).filter(Boolean) as string[]
    const managers = await prisma.user.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, name: true, email: true },
    })
    const managerMap = new Map(managers.map(m => [m.id, m]))

    // 添加负责人信息到部门数据
    const departmentsWithManager = departments.map(d => ({
      ...d,
      manager: d.managerId ? managerMap.get(d.managerId) || null : null,
    }))

    // 构建树形结构
    const buildTree = (parentId: string | null): typeof departmentsWithManager => {
      return departmentsWithManager
        .filter(d => d.parentId === parentId)
        .map(d => ({
          ...d,
          children: buildTree(d.id),
        }))
    }

    const tree = buildTree(null)

    return NextResponse.json({
      departments: departmentsWithManager,
      tree,
    })
  } catch (error) {
    console.error('Failed to get departments:', error)
    return NextResponse.json({ error: '获取部门列表失败' }, { status: 500 })
  }
}

// POST: 创建部门
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 检查权限（只有 OWNER 和 ADMIN 可以创建部门）
    if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, parentId, sortOrder } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 })
    }

    // 如果有父部门，检查父部门是否存在且属于同一组织
    if (parentId) {
      const parentDept = await prisma.department.findFirst({
        where: {
          id: parentId,
          organizationId: session.user.organizationId,
        },
      })
      if (!parentDept) {
        return NextResponse.json({ error: '父部门不存在' }, { status: 400 })
      }
    }

    // 计算层级
    let level = 0
    if (parentId) {
      const parentDeptData = await prisma.department.findUnique({
        where: { id: parentId },
        select: { level: true },
      })
      if (parentDeptData) {
        level = parentDeptData.level + 1
      }
    }

    const department = await prisma.department.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        parentId: parentId || null,
        sortOrder: sortOrder || 0,
        level,
        organizationId: session.user.organizationId,
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
    })

    // 更新部门路径
    await updateDepartmentPath(department.id)

    // 重新获取更新后的部门数据
    const updatedDepartment = await prisma.department.findUnique({
      where: { id: department.id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    })

    return NextResponse.json({ department: updatedDepartment }, { status: 201 })
  } catch (error) {
    console.error('Failed to create department:', error)
    return NextResponse.json({ error: '创建部门失败' }, { status: 500 })
  }
}
