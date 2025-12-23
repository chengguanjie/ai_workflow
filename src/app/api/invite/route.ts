import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// GET: 验证邀请 token 并获取邀请信息
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return ApiResponse.error('缺少邀请 token', 400)
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!invitation) {
      return ApiResponse.error('邀请不存在或已失效', 404)
    }

    // 检查是否过期
    if (new Date(invitation.expiresAt) < new Date()) {
      return ApiResponse.error('邀请已过期', 400)
    }

    // 检查是否已用完
    if (invitation.usedCount >= invitation.maxUses) {
      return ApiResponse.error('邀请已达到使用上限', 400)
    }

    // 检查邮件邀请是否已被接受
    if (invitation.type === 'EMAIL' && invitation.acceptedAt) {
      return ApiResponse.error('邀请已被接受', 400)
    }

    return ApiResponse.success({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        type: invitation.type,
        organization: invitation.organization,
        department: invitation.department,
      },
    })
  } catch (error) {
    console.error('Failed to verify invitation:', error)
    return ApiResponse.error('验证邀请失败', 500)
  }
}
