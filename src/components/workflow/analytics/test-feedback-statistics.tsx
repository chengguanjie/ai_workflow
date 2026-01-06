'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  FileWarning,
  Bug,
  Zap,
  HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

// 动态导入图表组件
const AnalyticsChart = dynamic(() => import('./analytics-chart'), {
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
})

// 错误分类标签映射
const ERROR_CATEGORY_LABELS: Record<string, string> = {
  OUTPUT_FORMAT: '输出格式错误',
  OUTPUT_CONTENT: '输出内容错误',
  MISSING_DATA: '数据缺失',
  LOGIC_ERROR: '逻辑错误',
  PERFORMANCE: '性能问题',
  OTHER: '其他',
}

// 错误分类图标映射
const ERROR_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  OUTPUT_FORMAT: <FileWarning className="h-4 w-4" />,
  OUTPUT_CONTENT: <AlertTriangle className="h-4 w-4" />,
  MISSING_DATA: <XCircle className="h-4 w-4" />,
  LOGIC_ERROR: <Bug className="h-4 w-4" />,
  PERFORMANCE: <Zap className="h-4 w-4" />,
  OTHER: <HelpCircle className="h-4 w-4" />,
}

// 错误分类颜色映射
const ERROR_CATEGORY_COLORS: Record<string, string> = {
  OUTPUT_FORMAT: 'bg-orange-500',
  OUTPUT_CONTENT: 'bg-red-500',
  MISSING_DATA: 'bg-yellow-500',
  LOGIC_ERROR: 'bg-purple-500',
  PERFORMANCE: 'bg-blue-500',
  OTHER: 'bg-gray-500',
}

interface NodeStatistics {
  nodeId: string
  nodeName: string
  nodeType: string
  totalFeedbacks: number
  correctCount: number
  incorrectCount: number
  correctRate: number
  errorCategories: Record<string, number>
}

interface TrendData {
  date: string
  correctRate: number
  testCount: number
}

interface TestStatisticsData {
  totalTests: number
  nodeStatistics: NodeStatistics[]
  errorCategoryBreakdown: Record<string, number>
  trend: TrendData[]
}

interface TestFeedbackStatisticsProps {
  workflowId: string
}

export default function TestFeedbackStatistics({ workflowId }: TestFeedbackStatisticsProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statistics, setStatistics] = useState<TestStatisticsData | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // 加载统计数据
  const loadStatistics = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', new Date(startDate).toISOString())
      if (endDate) params.append('endDate', new Date(endDate).toISOString())
      if (selectedNodeId !== 'all') params.append('nodeId', selectedNodeId)

      const response = await fetch(
        `/api/workflows/${workflowId}/test-statistics?${params.toString()}`
      )
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setStatistics(result.data || null)
    } catch {
      toast.error('加载测试统计数据失败')
    } finally {
      setIsLoading(false)
    }
  }, [workflowId, startDate, endDate, selectedNodeId])

  // 刷新数据
  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadStatistics()
    setIsRefreshing(false)
    toast.success('数据已刷新')
  }

  // 重置筛选
  const handleResetFilters = () => {
    setStartDate('')
    setEndDate('')
    setSelectedNodeId('all')
  }

  useEffect(() => {
    loadStatistics()
  }, [loadStatistics])

  // 计算总体正确率
  const overallCorrectRate = statistics?.nodeStatistics.reduce(
    (acc, node) => {
      acc.correct += node.correctCount
      acc.total += node.totalFeedbacks
      return acc
    },
    { correct: 0, total: 0 }
  )

  const correctRatePercent = overallCorrectRate && overallCorrectRate.total > 0
    ? (overallCorrectRate.correct / overallCorrectRate.total * 100).toFixed(1)
    : '0.0'

  // 计算趋势
  const calculateTrend = () => {
    if (!statistics?.trend || statistics.trend.length < 2) {
      return { value: 0, direction: 'stable' as const }
    }

    const recent = statistics.trend.slice(-7)
    const previous = statistics.trend.slice(-14, -7)

    if (recent.length === 0 || previous.length === 0) {
      return { value: 0, direction: 'stable' as const }
    }

    const recentAvg = recent.reduce((sum, d) => sum + d.correctRate, 0) / recent.length
    const previousAvg = previous.reduce((sum, d) => sum + d.correctRate, 0) / previous.length

    if (previousAvg === 0) return { value: 0, direction: 'stable' as const }

    const change = ((recentAvg - previousAvg) / previousAvg) * 100
    const direction = change > 5 ? 'up' : change < -5 ? 'down' : 'stable'

    return { value: Math.abs(change), direction }
  }

  const trend = calculateTrend()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 筛选器 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">测试反馈筛选</CardTitle>
              <CardDescription>按时间范围和节点筛选测试反馈数据</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
              >
                重置
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">开始日期</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">结束日期</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-filter">节点筛选</Label>
              <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
                <SelectTrigger id="node-filter">
                  <SelectValue placeholder="选择节点" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有节点</SelectItem>
                  {statistics?.nodeStatistics.map((node) => (
                    <SelectItem key={node.nodeId} value={node.nodeId}>
                      {node.nodeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{statistics?.totalTests || 0}</p>
              <p className="text-sm text-muted-foreground">测试执行总数</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <p className="text-3xl font-bold text-green-600">{correctRatePercent}%</p>
                {trend.direction === 'up' ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : trend.direction === 'down' ? (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                ) : (
                  <Minus className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">总体正确率</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <p className="text-3xl font-bold text-green-600">
                  {overallCorrectRate?.correct || 0}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">正确反馈数</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <XCircle className="h-5 w-5 text-red-500" />
                <p className="text-3xl font-bold text-red-600">
                  {(overallCorrectRate?.total || 0) - (overallCorrectRate?.correct || 0)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">错误反馈数</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 主要内容区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 节点正确率 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">节点正确率</CardTitle>
            <CardDescription>各节点的测试反馈正确率统计</CardDescription>
          </CardHeader>
          <CardContent>
            {!statistics?.nodeStatistics || statistics.nodeStatistics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无节点反馈数据
              </p>
            ) : (
              <div className="space-y-4">
                {statistics.nodeStatistics.map((node) => (
                  <div key={node.nodeId}>
                    <div className="flex justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{node.nodeName}</span>
                        <Badge variant="outline" className="text-xs">
                          {node.nodeType}
                        </Badge>
                      </div>
                      <span className={`font-medium ${
                        node.correctRate >= 0.8 ? 'text-green-600' :
                        node.correctRate >= 0.5 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {(node.correctRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          node.correctRate >= 0.8 ? 'bg-green-500' :
                          node.correctRate >= 0.5 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${node.correctRate * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>正确: {node.correctCount}</span>
                      <span>错误: {node.incorrectCount}</span>
                      <span>总计: {node.totalFeedbacks}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 错误分类分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">错误分类分布</CardTitle>
            <CardDescription>按错误类型统计的问题分布</CardDescription>
          </CardHeader>
          <CardContent>
            {!statistics?.errorCategoryBreakdown || 
             Object.keys(statistics.errorCategoryBreakdown).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>暂无错误反馈</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(statistics.errorCategoryBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => {
                    const total = Object.values(statistics.errorCategoryBreakdown).reduce((a, b) => a + b, 0)
                    const percentage = total > 0 ? (count / total * 100) : 0
                    return (
                      <div key={category}>
                        <div className="flex justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            {ERROR_CATEGORY_ICONS[category] || <HelpCircle className="h-4 w-4" />}
                            <span>{ERROR_CATEGORY_LABELS[category] || category}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {count} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${ERROR_CATEGORY_COLORS[category] || 'bg-gray-500'}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 正确率趋势图 */}
      {statistics?.trend && statistics.trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">正确率趋势</CardTitle>
            <CardDescription>测试反馈正确率随时间的变化趋势</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsChart
              type="LINE"
              data={statistics.trend.map(item => ({
                date: item.date,
                correctRate: item.correctRate * 100, // 转换为百分比
                testCount: item.testCount,
              } as Record<string, unknown>))}
              config={{
                xKey: 'date',
                yKey: 'correctRate',
                height: 300,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* 测试执行趋势图 */}
      {statistics?.trend && statistics.trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">测试执行趋势</CardTitle>
            <CardDescription>每日测试执行次数变化</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsChart
              type="BAR"
              data={statistics.trend as unknown as Record<string, unknown>[]}
              config={{
                xKey: 'date',
                yKey: 'testCount',
                height: 250,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
