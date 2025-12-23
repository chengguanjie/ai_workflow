import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { updateDepartmentPath, getDescendantDepartmentIds } from '@/lib/permissions/department'

// GET: 获取单个部门详情
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const department = await prisma.department.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        children: {
          select: { id: true, name: true },
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
        _count: {
          select: { users: true, children: true },
        },
      },
    })

    if (!department) {
      return ApiResponse.error('部门不存在', 404)
    }

    // 获取负责人信息
    let manager = null
    if (department.managerId) {
      manager = await prisma.user.findUnique({
        where: { id: department.managerId },
        select: { id: true, name: true, email: true, avatar: true },
      })
    }

    return ApiResponse.success({
      department: {
        ...department,
        manager,
      },
    })
  } catch (error) {
    console.error('Failed to get department:', error)
    return ApiResponse.error('获取部门详情失败', 500)
  }
}

// PATCH: 更新部门
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查权限
    if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const { name, description, parentId, sortOrder, managerId } = body

    // 检查部门是否存在
    const existingDept = await prisma.department.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    })

    if (!existingDept) {
      return ApiResponse.error('部门不存在', 404)
    }

    // 如果更新父部门，需要验证
    if (parentId !== undefined) {
      // 不能将自己设为父部门
      if (parentId === id) {
        return ApiResponse.error('不能将部门设为自己的子部门', 400)
      }

      // 如果设置了父部门，检查是否存在
      if (parentId) {
        const parentDept = await prisma.department.findFirst({
          where: {
            id: parentId,
            organizationId: session.user.organizationId,
          },
        })
        if (!parentDept) {
          return ApiResponse.error('父部门不存在', 400)
        }

        // 检查是否会形成循环引用（父部门不能是当前部门的子部门）
        const descendants = await getDescendantDepartmentIds(id)
        if (descendants.includes(parentId)) {
          return ApiResponse.error('不能将子部门设为父部门', 400)
        }
      }
    }

    // 如果设置负责人，检查用户是否存在且属于该企业
    if (managerId !== undefined && managerId !== null) {
      const managerUser = await prisma.user.findFirst({
        where: {
          id: managerId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })
      if (!managerUser) {
        return ApiResponse.error('指定的负责人不存在或已禁用', 400)
      }
    }

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(managerId !== undefined && { managerId: managerId || null }),
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
    })

    // 如果父部门变更，更新部门路径
    if (parentId !== undefined && parentId !== existingDept.parentId) {
      await updateDepartmentPath(id)
    }

    // 获取负责人信息
    let manager = null
    if (department.managerId) {
      manager = await prisma.user.findUnique({
        where: { id: department.managerId },
        select: { id: true, name: true, email: true, avatar: true },
      })
    }

    return ApiResponse.success({
      department: {
        ...department,
        manager,
      },
    })
  } catch (error) {
    console.error('Failed to update department:', error)
    return ApiResponse.error('更新部门失败', 500)
  }
}

// DELETE: 删除部门
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查权限
    if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
      return ApiResponse.error('权限不足', 403)
    }

    // 检查部门是否存在
    const department = await prisma.department.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      include: {
        _count: {
          select: { users: true, children: true },
        },
      },
    })

    if (!department) {
      return ApiResponse.error('部门不存在', 404)
    }

    // 检查是否有成员
    if (department._count.users > 0) {
      return ApiResponse.error(`部门下还有 ${department._count.users} 名成员，请先移除成员`, 400)
    }

    // 检查是否有子部门
    if (department._count.children > 0) {
      return ApiResponse.error(`部门下还有 ${department._count.children} 个子部门，请先删除子部门`, 400)
    }

    await prisma.department.delete({
      where: { id },
    })

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete department:', error)
    return ApiResponse.error('删除部门失败', 500)
  }
}

