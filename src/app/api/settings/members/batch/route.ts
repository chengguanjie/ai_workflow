/**
 * 成员批量操作API
 * 实现批量删除、批量修改角色、批量修改部门功能
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { Role } from '@prisma/client'
import { getAuditService, AuditLogEntry } from '@/lib/audit/audit-service'

/**
 * 批量操作类型
 */
type BatchOperation = 'delete' | 'updateRole' | 'updateDepartment'

/**
 * 批量操作请求验证Schema
 */
const batchOperationSchema = z.object({
  memberIds: z.array(z.string()).min(1, '请选择至少一个成员'),
  operation: z.enum(['delete', 'updateRole', 'updateDepartment']),
  data: z.object({
    role: z.nativeEnum(Role).optional(),
    departmentId: z.string().nullable().optional(),
  }).optional(),
})

/**
 * 批量操作响应接口
 */
interface BatchOperationResponse {
  success: string[]
  failed: Array<{
    memberId: string
    reason: string
  }>
}

/**
 * 验证成员是否可以被操作
 */
function validateMemberOperation(
  targetMember: { id: string; role: Role; email: string | null },
  operatorId: string,
  operatorRole: Role,
  operation: BatchOperation
): { valid: boolean; reason?: string } {
  // 不能操作自己
  if (targetMember.id === operatorId) {
    return { valid: false, reason: '不能操作自己' }
  }

  // 不能操作OWNER
  if (targetMember.role === 'OWNER') {
    return { valid: false, reason: '不能操作企业所有者' }
  }

  // ADMIN不能操作其他ADMIN
  if (operatorRole === 'ADMIN' && targetMember.role === 'ADMIN') {
    return { valid: false, reason: 'ADMIN不能操作其他ADMIN' }
  }

  return { valid: true }
}

/**
 * POST: 批量操作成员
 * - 批量删除成员
 * - 批量修改角色
 * - 批量修改部门
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 只有OWNER和ADMIN可以进行批量操作
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('权限不足', 403)
    }

    const body = await request.json()
    const validationResult = batchOperationSchema.safeParse(body)

    if (!validationResult.success) {
      const issues = validationResult.error.issues
      return ApiResponse.error(issues[0]?.message || '输入验证失败', 400)
    }

    const { memberIds, operation, data } = validationResult.data

    // 验证操作特定的数据
    if (operation === 'updateRole') {
      if (!data?.role) {
        return ApiResponse.error('请指定新角色', 400)
      }
      // 不能设置为OWNER
      if (data.role === 'OWNER') {
        return ApiResponse.error('不能将成员设为企业所有者', 400)
      }
    }

    if (operation === 'updateDepartment' && data?.departmentId) {
      // 验证部门存在且属于同一组织
      const department = await prisma.department.findFirst({
        where: {
          id: data.departmentId,
          organizationId: session.user.organizationId,
        },
      })
      if (!department) {
        return ApiResponse.error('部门不存在', 400)
      }
    }

    // 获取所有目标成员
    const targetMembers = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
        organizationId: session.user.organizationId,
        isActive: true,
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

    // 创建成员ID到成员信息的映射
    const memberMap = new Map(targetMembers.map(m => [m.id, m]))

    const result: BatchOperationResponse = {
      success: [],
      failed: [],
    }

    const auditEntries: AuditLogEntry[] = []

    // 处理每个成员
    for (const memberId of memberIds) {
      const member = memberMap.get(memberId)

      // 成员不存在或不属于当前组织
      if (!member) {
        result.failed.push({
          memberId,
          reason: '成员不存在或已被移除',
        })
        continue
      }

      // 验证操作权限
      const validation = validateMemberOperation(
        member,
        session.user.id,
        session.user.role as Role,
        operation
      )

      if (!validation.valid) {
        result.failed.push({
          memberId,
          reason: validation.reason!,
        })
        continue
      }

      try {
        // 执行操作
        switch (operation) {
          case 'delete': {
            await prisma.user.update({
              where: { id: memberId },
              data: { isActive: false },
            })

            // 记录审计日志
            auditEntries.push({
              eventType: 'permission.removed',
              operatorId: session.user.id,
              operatorName: session.user.name || undefined,
              targetResource: 'USER',
              targetResourceId: memberId,
              changes: {
                isActive: { old: true, new: false },
              },
              metadata: {
                memberEmail: member.email,
                memberName: member.name,
                memberRole: member.role,
                operation: 'batch_delete',
              },
              organizationId: session.user.organizationId,
            })

            result.success.push(memberId)
            break
          }

          case 'updateRole': {
            const newRole = data!.role!
            const oldRole = member.role

            await prisma.user.update({
              where: { id: memberId },
              data: { role: newRole },
            })

            // 记录审计日志
            auditEntries.push({
              eventType: 'permission.updated',
              operatorId: session.user.id,
              operatorName: session.user.name || undefined,
              targetResource: 'USER',
              targetResourceId: memberId,
              changes: {
                role: { old: oldRole, new: newRole },
              },
              metadata: {
                memberEmail: member.email,
                memberName: member.name,
                operation: 'batch_update_role',
              },
              organizationId: session.user.organizationId,
            })

            result.success.push(memberId)
            break
          }

          case 'updateDepartment': {
            const newDepartmentId = data?.departmentId ?? null
            const oldDepartmentId = member.departmentId

            await prisma.user.update({
              where: { id: memberId },
              data: { departmentId: newDepartmentId },
            })

            // 记录审计日志
            auditEntries.push({
              eventType: 'permission.updated',
              operatorId: session.user.id,
              operatorName: session.user.name || undefined,
              targetResource: 'USER',
              targetResourceId: memberId,
              changes: {
                departmentId: { old: oldDepartmentId, new: newDepartmentId },
              },
              metadata: {
                memberEmail: member.email,
                memberName: member.name,
                oldDepartmentName: member.department?.name,
                operation: 'batch_update_department',
              },
              organizationId: session.user.organizationId,
            })

            result.success.push(memberId)
            break
          }
        }
      } catch (error) {
        console.error(`Failed to process member ${memberId}:`, error)
        result.failed.push({
          memberId,
          reason: '操作失败',
        })
      }
    }

    // 批量记录审计日志
    if (auditEntries.length > 0) {
      const auditService = getAuditService()
      await auditService.logBatch(auditEntries)
    }

    // 根据结果返回适当的状态码
    if (result.failed.length === 0) {
      return ApiResponse.success(result)
    } else if (result.success.length === 0) {
      return ApiResponse.error('批量操作全部失败', 400, result)
    } else {
      // 部分成功，返回207 Multi-Status
      return NextResponse.json(
        {
          success: true,
          data: result,
          message: `成功: ${result.success.length}, 失败: ${result.failed.length}`,
        },
        { status: 207 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
      return ApiResponse.error(issues[0]?.message || '输入验证失败', 400)
    }

    console.error('Batch operation error:', error)
    const errorMessage = error instanceof Error ? error.message : '批量操作失败'
    return ApiResponse.error(errorMessage, 500)
  }
}
