import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`

    return ApiResponse.success({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    })
  } catch (error) {
    return ApiResponse.error('健康检查失败', 503, {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
