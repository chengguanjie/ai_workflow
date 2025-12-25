import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { updateDepartmentPath } from '@/lib/permissions/department'
import { filterVisibleDepartments } from '@/lib/permissions/department-visibility'
import { logDepartmentChange } from '@/lib/audit'

// 最大部门层级深度
const MAX_DEPARTMENT_DEPTH = 10

// GET: 获取所有部门（支持树形结构）
// 根据用户角色过滤可见部门 (Requirements: 4.1, 4.2, 4.3, 4.4)
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.organizationId || !session?.user?.id) {
      return ApiResponse.error('未授权', 401)
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

    // 根据用户角色过滤可见部门
    const visibleDepartments = await filterVisibleDepartments(
      session.user.id,
      session.user.organizationId,
      departments
    )

    // 获取负责人信息
    const managerIds = visibleDepartments.map(d => d.managerId).filter(Boolean) as string[]
    const managers = await prisma.user.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, name: true, email: true },
    })
    const managerMap = new Map(managers.map(m => [m.id, m]))

    // 添加负责人信息到部门数据
    const departmentsWithManager = visibleDepartments.map(d => ({
      ...d,
      manager: d.managerId ? managerMap.get(d.managerId) || null : null,
    }))

    // 构建树形结构（只包含可见部门）
    const visibleIds = new Set(visibleDepartments.map(d => d.id))
    const buildTree = (parentId: string | null): typeof departmentsWithManager => {
      return departmentsWithManager
        .filter(d => d.parentId === parentId || (d.parentId && !visibleIds.has(d.parentId) && parentId === null))
        .map(d => ({
          ...d,
          children: buildTree(d.id),
        }))
    }

    const tree = buildTree(null)

    return ApiResponse.success({
      departments: departmentsWithManager,
      tree,
    })
  } catch (error) {
    console.error('Failed to get departments:', error)
    return ApiResponse.error('获取部门列表失败', 500)
  }
}

// POST: 创建部门
// 添加层级深度限制 (Requirements: 5.1, 5.2, 5.3)
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 检查权限（只有 OWNER 和 ADMIN 可以创建部门）
    if (session.user.role !== 'OWNER' && session.user.role !== 'ADMIN') {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const { name, description, parentId, sortOrder, managerId } = body

    if (!name?.trim()) {
      return ApiResponse.error('部门名称不能为空', 400)
    }

    // 计算层级
    let level = 0
    if (parentId) {
      // 检查父部门是否存在且属于同一组织
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
      level = parentDept.level + 1

      // 检查层级深度限制 (Requirements: 5.1, 5.2)
      if (level >= MAX_DEPARTMENT_DEPTH) {
        return ApiResponse.error(`部门层级不能超过 ${MAX_DEPARTMENT_DEPTH} 级`, 400)
      }
    }

    // 如果指定了负责人，验证其存在且属于同一组织
    if (managerId) {
      const manager = await prisma.user.findFirst({
        where: {
          id: managerId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })
      if (!manager) {
        return ApiResponse.error('指定的负责人不存在', 400)
      }
    }

    const department = await prisma.department.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        parentId: parentId || null,
        sortOrder: sortOrder || 0,
        level,
        managerId: managerId || null,
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

    // 获取父部门名称用于审计日志
    let parentName: string | undefined
    if (parentId) {
      const parentDept = await prisma.department.findUnique({
        where: { id: parentId },
        select: { name: true },
      })
      parentName = parentDept?.name || undefined
    }

    // 记录审计日志
    await logDepartmentChange(
      session.user.id,
      session.user.organizationId,
      'created',
      {
        departmentId: department.id,
        departmentName: department.name,
        parentId: parentId || null,
        parentName,
      }
    )

    return ApiResponse.created({ department: updatedDepartment })
  } catch (error) {
    console.error('Failed to create department:', error)
    return ApiResponse.error('创建部门失败', 500)
  }
}
