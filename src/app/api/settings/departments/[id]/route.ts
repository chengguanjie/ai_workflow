import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { updateDepartmentPath, getDescendantDepartmentIds } from '@/lib/permissions/department'
import { canViewDepartment } from '@/lib/permissions/department-visibility'
import { logDepartmentChange } from '@/lib/audit'

// 最大部门层级深度
const MAX_DEPARTMENT_DEPTH = 10

// GET: 获取单个部门详情
// 添加可见性检查 (Requirements: 4.4)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user?.organizationId || !session?.user?.id) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查用户是否可以查看该部门 (Requirements: 4.4)
    const canView = await canViewDepartment(session.user.id, id)
    if (!canView) {
      // 返回404而非403，避免信息泄露
      return ApiResponse.error('部门不存在', 404)
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
// 添加层级深度限制检查 (Requirements: 5.1, 5.2, 5.3)
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
    let newLevel = existingDept.level
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
          select: { level: true },
        })
        if (!parentDept) {
          return ApiResponse.error('父部门不存在', 400)
        }

        // 检查是否会形成循环引用（父部门不能是当前部门的子部门）
        const descendants = await getDescendantDepartmentIds(id)
        if (descendants.includes(parentId)) {
          return ApiResponse.error('不能将子部门设为父部门', 400)
        }

        // 计算新的层级
        newLevel = parentDept.level + 1

        // 检查层级深度限制 (Requirements: 5.1, 5.2)
        // 需要考虑当前部门的子部门深度
        const maxDescendantDepth = await getMaxDescendantDepth(id)
        const totalDepth = newLevel + maxDescendantDepth
        if (totalDepth >= MAX_DEPARTMENT_DEPTH) {
          return ApiResponse.error(`移动后部门层级将超过 ${MAX_DEPARTMENT_DEPTH} 级限制`, 400)
        }
      } else {
        // 移动到根级别
        newLevel = 0
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

    // 构建变更记录用于审计日志
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    if (name !== undefined && name.trim() !== existingDept.name) {
      changes.name = { old: existingDept.name, new: name.trim() }
    }
    if (description !== undefined && description?.trim() !== existingDept.description) {
      changes.description = { old: existingDept.description, new: description?.trim() || null }
    }
    if (parentId !== undefined && parentId !== existingDept.parentId) {
      changes.parentId = { old: existingDept.parentId, new: parentId || null }
    }
    if (sortOrder !== undefined && sortOrder !== existingDept.sortOrder) {
      changes.sortOrder = { old: existingDept.sortOrder, new: sortOrder }
    }
    if (managerId !== undefined && managerId !== existingDept.managerId) {
      changes.managerId = { old: existingDept.managerId, new: managerId || null }
    }

    // 只有有变更时才记录审计日志
    if (Object.keys(changes).length > 0) {
      // 获取父部门名称
      let parentName: string | undefined
      if (department.parentId) {
        const parentDept = await prisma.department.findUnique({
          where: { id: department.parentId },
          select: { name: true },
        })
        parentName = parentDept?.name || undefined
      }

      await logDepartmentChange(
        session.user.id,
        session.user.organizationId,
        'updated',
        {
          departmentId: id,
          departmentName: department.name,
          parentId: department.parentId,
          parentName,
          changes,
        }
      )
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

/**
 * 获取部门的最大子部门深度
 */
async function getMaxDescendantDepth(departmentId: string): Promise<number> {
  const descendants = await prisma.department.findMany({
    where: {
      path: {
        contains: departmentId,
      },
    },
    select: { level: true },
  })

  if (descendants.length === 0) {
    return 0
  }

  const currentDept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { level: true },
  })

  if (!currentDept) {
    return 0
  }

  const maxLevel = Math.max(...descendants.map(d => d.level))
  return maxLevel - currentDept.level
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

    // 记录审计日志
    await logDepartmentChange(
      session.user.id,
      session.user.organizationId,
      'deleted',
      {
        departmentId: id,
        departmentName: department.name,
        parentId: department.parentId,
      }
    )

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to delete department:', error)
    return ApiResponse.error('删除部门失败', 500)
  }
}

