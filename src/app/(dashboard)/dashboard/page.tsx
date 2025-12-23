import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GitBranch, PlayCircle, Clock, Zap } from 'lucide-react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

async function getDashboardStats(organizationId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    workflowCount,
    todayExecutions,
    monthTokens,
    avgDuration,
    recentExecutions,
  ] = await Promise.all([
    // 工作流总数
    prisma.workflow.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    }),
    // 今日执行次数
    prisma.execution.count({
      where: {
        organizationId,
        createdAt: {
          gte: todayStart,
        },
      },
    }),
    // 本月 Token 消耗
    prisma.execution.aggregate({
      where: {
        organizationId,
        createdAt: {
          gte: monthStart,
        },
      },
      _sum: {
        totalTokens: true,
      },
    }),
    // 平均执行耗时（毫秒）
    prisma.execution.aggregate({
      where: {
        organizationId,
        status: 'COMPLETED',
        duration: {
          not: null,
        },
      },
      _avg: {
        duration: true,
      },
    }),
    // 最近执行记录
    prisma.execution.findMany({
      where: {
        organizationId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        createdAt: true,
        duration: true,
        workflow: {
          select: {
            name: true,
          },
        },
      },
    }),
  ])

  return {
    workflowCount,
    todayExecutions,
    monthTokens: monthTokens._sum.totalTokens || 0,
    avgDuration: avgDuration._avg.duration,
    recentExecutions,
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString()
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(2)}M`
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'text-green-600'
    case 'FAILED':
      return 'text-red-600'
    case 'RUNNING':
      return 'text-blue-600'
    case 'PENDING':
      return 'text-yellow-600'
    case 'CANCELLED':
      return 'text-gray-600'
    default:
      return 'text-muted-foreground'
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return '完成'
    case 'FAILED':
      return '失败'
    case 'RUNNING':
      return '运行中'
    case 'PENDING':
      return '等待中'
    case 'CANCELLED':
      return '已取消'
    default:
      return status
  }
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const stats = await getDashboardStats(session.user.organizationId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">工作台</h1>
        <p className="text-muted-foreground">欢迎回来！查看您的工作流概况</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">工作流总数</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.workflowCount}</div>
            <p className="text-xs text-muted-foreground">已创建的工作流</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">今日执行</CardTitle>
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayExecutions}</div>
            <p className="text-xs text-muted-foreground">今日执行次数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">本月 Token</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokens(stats.monthTokens)}</div>
            <p className="text-xs text-muted-foreground">本月消耗 Token</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">平均耗时</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
            <p className="text-xs text-muted-foreground">执行平均耗时</p>
          </CardContent>
        </Card>
      </div>

      {/* 快速操作 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>快速开始</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              创建您的第一个 AI 工作流，自动化文本处理任务。
            </p>
            <Link
              href="/workflows/new"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              创建工作流
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近执行</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentExecutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无执行记录</p>
            ) : (
              <div className="space-y-3">
                {stats.recentExecutions.map((execution) => (
                  <Link
                    key={execution.id}
                    href={`/executions/${execution.id}`}
                    className="flex items-center justify-between hover:bg-muted/50 -mx-2 px-2 py-1 rounded"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium truncate max-w-[200px]">
                        {execution.workflow.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(execution.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${getStatusColor(execution.status)}`}>
                        {getStatusText(execution.status)}
                      </span>
                      {execution.duration && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(execution.duration)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                {stats.recentExecutions.length > 0 && (
                  <Link
                    href="/executions"
                    className="text-sm text-primary hover:underline block text-center pt-2"
                  >
                    查看全部执行记录
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
