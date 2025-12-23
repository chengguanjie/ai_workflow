import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// DELETE: 撤销邀请
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id: invitationId } = await params

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    // 只有 OWNER 和 ADMIN 可以撤销邀请
    if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
      return ApiResponse.error('权限不足', 403)
    }

    // 获取邀请信息
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    })

    if (!invitation || invitation.organizationId !== session.user.organizationId) {
      return ApiResponse.error('邀请不存在', 404)
    }

    // 删除邀请
    await prisma.invitation.delete({
      where: { id: invitationId },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'invitation.revoked',
        resource: 'invitation',
        resourceId: invitationId,
        detail: {
          email: invitation.email,
          role: invitation.role,
          type: invitation.type,
        },
        userId: session.user.id,
        organizationId: session.user.organizationId,
      },
    })

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Failed to revoke invitation:', error)
    return ApiResponse.error('撤销邀请失败', 500)
  }
}
