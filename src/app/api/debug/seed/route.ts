import { auth } from '@/lib/auth'
import { seedOfficialTemplates } from '@/lib/templates/official-templates'
import { ApiResponse } from '@/lib/api/api-response'

export async function GET() {
  try {
    // 环境检查：只在非生产环境允许
    if (process.env.NODE_ENV === 'production') {
      return ApiResponse.error('禁止操作：生产环境不允许重置数据', 403)
    }

    // 认证检查
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未授权：需要登录', 401)
    }

    // 角色权限检查：只有 OWNER/ADMIN 可以执行
    const allowedRoles = ['OWNER', 'ADMIN']
    if (!allowedRoles.includes(session.user.role)) {
      return ApiResponse.error('权限不足：只有企业所有者和管理员可以重置数据', 403)
    }

    await seedOfficialTemplates()
    return ApiResponse.success({ message: '官方模板库已成功重构并同步！' });
  } catch (error) {
    const { logError } = await import('@/lib/security/safe-logger')
    logError('同步失败', error instanceof Error ? error : undefined)
    return ApiResponse.error('同步失败: ' + String(error), 500);
  }
}
