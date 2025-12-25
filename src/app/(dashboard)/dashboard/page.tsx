import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { GitBranch, PlayCircle, Clock, Zap, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

async function getDashboardStats(organizationId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    workflowCount,
    todayExecutions,
    monthTokens,
    avgDuration,
    recentExecutions,
    weeklyExecutions,
    topWorkflows,
    recentErrors,
  ] = await Promise.all([
    prisma.workflow.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    }),
    prisma.execution.count({
      where: {
        organizationId,
        createdAt: {
          gte: todayStart,
        },
      },
    }),
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
    prisma.execution.findMany({
      where: {
        organizationId,
        createdAt: { gte: weekAgo },
      },
      select: {
        status: true,
        createdAt: true,
      },
    }),
    prisma.execution.groupBy({
      by: ['workflowId'],
      where: {
        organizationId,
        createdAt: { gte: monthStart },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    prisma.execution.findMany({
      where: {
        organizationId,
        status: 'FAILED',
        createdAt: { gte: weekAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        error: true,
        createdAt: true,
        workflow: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ])

  const workflowIds = topWorkflows.map(w => w.workflowId)
  const workflowNames = workflowIds.length > 0 ? await prisma.workflow.findMany({
    where: { id: { in: workflowIds } },
    select: { id: true, name: true },
  }) : []

  const workflowNameMap = new Map(workflowNames.map(w => [w.id, w.name]))

  const dailyStats = new Map<string, { total: number; success: number }>()
  for (const exec of weeklyExecutions) {
    const date = exec.createdAt.toISOString().split('T')[0]
    if (!dailyStats.has(date)) {
      dailyStats.set(date, { total: 0, success: 0 })
    }
    const stat = dailyStats.get(date)!
    stat.total++
    if (exec.status === 'COMPLETED') {
      stat.success++
    }
  }

  const trend = Array.from(dailyStats.entries())
    .map(([date, stat]) => ({
      date,
      total: stat.total,
      success: stat.success,
      successRate: stat.total > 0 ? (stat.success / stat.total * 100).toFixed(1) : '0',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalWeekly = weeklyExecutions.length
  const successWeekly = weeklyExecutions.filter(e => e.status === 'COMPLETED').length
  const weeklySuccessRate = totalWeekly > 0 ? (successWeekly / totalWeekly * 100).toFixed(1) : '0'

  return {
    workflowCount,
    todayExecutions,
    monthTokens: monthTokens._sum.totalTokens || 0,
    avgDuration: avgDuration._avg.duration,
    recentExecutions,
    trend,
    weeklySuccessRate,
    totalWeekly,
    topWorkflows: topWorkflows.map(w => ({
      workflowId: w.workflowId,
      name: workflowNameMap.get(w.workflowId) || '未知工作流',
      count: w._count.id,
    })),
    recentErrors,
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
            <CardTitle className="text-sm font-medium">周成功率</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.weeklySuccessRate}%</div>
            <p className="text-xs text-muted-foreground">最近7天 {stats.totalWeekly} 次执行</p>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              7天执行趋势
            </CardTitle>
            <CardDescription>每日执行次数和成功率</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.trend.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>
            ) : (
              <div className="space-y-2">
                {stats.trend.map((day) => (
                  <div key={day.date} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20">
                      {day.date.slice(5)}
                    </span>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${Math.min(100, day.total * 5)}%` }}
                      />
                    </div>
                    <span className="text-xs w-12 text-right">{day.total}次</span>
                    <span className="text-xs w-12 text-right text-green-600">{day.successRate}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              热门工作流
            </CardTitle>
            <CardDescription>本月执行次数最多的工作流</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topWorkflows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {stats.topWorkflows.map((wf, index) => (
                  <Link
                    key={wf.workflowId}
                    href={`/workflows/${wf.workflowId}`}
                    className="flex items-center gap-3 hover:bg-muted/50 -mx-2 px-2 py-1 rounded"
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{wf.name}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{wf.count} 次</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              近期错误
            </CardTitle>
            <CardDescription>最近7天失败的执行</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentErrors.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">太棒了！最近没有错误</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentErrors.map((err) => (
                  <Link
                    key={err.id}
                    href={`/executions/${err.id}`}
                    className="block hover:bg-muted/50 -mx-2 px-2 py-1 rounded"
                  >
                    <p className="text-sm font-medium truncate">{err.workflow.name}</p>
                    <p className="text-xs text-red-600 truncate">
                      {err.error || '执行失败'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(err.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </Link>
                ))}
                <Link
                  href="/executions?status=FAILED"
                  className="text-sm text-primary hover:underline block text-center pt-2"
                >
                  查看全部错误
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
