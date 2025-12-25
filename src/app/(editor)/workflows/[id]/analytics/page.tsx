'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Star,
  Lightbulb,
  Check,
  X,
  BarChart3,
  TrendingUp,
  RefreshCw,
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

// 动态导入增强的分析页面组件
const EnhancedAnalytics = dynamic(() => import('./enhanced-page'), {
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
})

// 导入图表组件
const AnalyticsChart = dynamic(() => import('@/components/workflow/analytics/analytics-chart'), {
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
})

interface AnalyticsData {
  summary: {
    totalExecutions: number
    successCount: number
    failureCount: number
    successRate: number
    avgRating: number
    feedbackCount: number
    accuracyRate: number
    avgDuration: number
    avgTokens: number
  }
  trend: Array<{
    date: string
    executions: number
    successRate: number
    avgRating: number
  }>
  issueBreakdown: Array<{
    category: string
    count: number
    percentage: number
  }>
  ratingDistribution: Array<{
    rating: number
    count: number
    percentage: number
  }>
  suggestions: {
    pending: number
    applied: number
    total: number
  }
}

interface Suggestion {
  id: string
  suggestionType: string
  suggestionTitle: string
  suggestionDetail: string
  confidence: number
  priority: number
  status: 'PENDING' | 'APPLIED' | 'REJECTED'
  createdAt: string
}

interface NodeStats {
  nodeId: string
  nodeName: string
  nodeType: string
  executions: number
  successCount: number
  failureCount: number
  successRate: number
  avgDuration: number
  maxDuration: number
  minDuration: number
  totalDuration: number
  avgTokens: number
  totalTokens: number
}

interface CostData {
  summary: {
    totalTokens: number
    totalPromptTokens: number
    totalCompletionTokens: number
    totalCost: number
    totalExecutions: number
    avgCostPerExecution: number
    avgTokensPerExecution: number
  }
  trend: Array<{
    date: string
    tokens: number
    cost: number
    executions: number
  }>
  modelBreakdown: Array<{
    model: string
    tokens: number
    cost: number
    count: number
    percentage: number
  }>
}

const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  KNOWLEDGE_BASE: '知识库问题',
  PROMPT_UNCLEAR: '提示词不清晰',
  PROMPT_WRONG: '提示词错误',
  MODEL_CAPABILITY: '模型能力不足',
  MODEL_CONFIG: '模型配置问题',
  INPUT_QUALITY: '输入质量问题',
  CONTEXT_MISSING: '上下文缺失',
  LOGIC_ERROR: '逻辑错误',
  OTHER: '其他',
}

export default function WorkflowAnalyticsPage() {
  const params = useParams()
  const workflowId = params.id as string

  const [period, setPeriod] = useState('week')
  const [isLoading, setIsLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [trendChartType, setTrendChartType] = useState<'LINE' | 'BAR' | 'AREA'>('LINE')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(60000) // 默认1分钟
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [nodeStats, setNodeStats] = useState<NodeStats[]>([])
  const [isLoadingNodeStats, setIsLoadingNodeStats] = useState(false)
  const [costData, setCostData] = useState<CostData | null>(null)
  const [isLoadingCost, setIsLoadingCost] = useState(false)

  // 加载统计数据
  const loadAnalytics = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/analytics?period=${period}`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      // API 返回格式: { success: true, data: {...} }
      setAnalytics(result.data || null)
    } catch {
      toast.error('加载统计数据失败')
    } finally {
      setIsLoading(false)
    }
  }, [workflowId, period])

  // 加载优化建议
  const loadSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/suggestions?status=PENDING&limit=5`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setSuggestions(result.data?.suggestions || [])
    } catch {
      // 静默失败，不影响主功能
    } finally {
      setIsLoadingSuggestions(false)
    }
  }, [workflowId])

  // 加载节点统计数据
  const loadNodeStats = useCallback(async () => {
    setIsLoadingNodeStats(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/analytics/nodes?period=${period}`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setNodeStats(result.data?.nodes || [])
    } catch {
      // 静默失败
    } finally {
      setIsLoadingNodeStats(false)
    }
  }, [workflowId, period])

  // 加载成本数据
  const loadCostData = useCallback(async () => {
    setIsLoadingCost(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/analytics/cost?period=${period}`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setCostData(result.data || null)
    } catch {
      // 静默失败
    } finally {
      setIsLoadingCost(false)
    }
  }, [workflowId, period])

  // 自动刷新逻辑
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadAnalytics()
        loadSuggestions()
        loadNodeStats()
        loadCostData()
      }, refreshInterval)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, loadAnalytics, loadSuggestions, loadNodeStats, loadCostData])

  useEffect(() => {
    loadAnalytics()
    loadSuggestions()
    loadNodeStats()
    loadCostData()
  }, [loadAnalytics, loadSuggestions, loadNodeStats, loadCostData])

  // 应用建议
  const handleApplySuggestion = async (suggestionId: string) => {
    try {
      const response = await fetch(`/api/suggestions/${suggestionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createNewVersion: true }),
      })

      if (!response.ok) throw new Error('应用失败')

      toast.success('优化建议已应用')
      loadSuggestions()
      loadAnalytics()
    } catch {
      toast.error('应用建议失败')
    }
  }

  // 拒绝建议
  const handleRejectSuggestion = async (suggestionId: string) => {
    try {
      const response = await fetch(`/api/suggestions/${suggestionId}/reject`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error('操作失败')

      toast.success('已忽略该建议')
      loadSuggestions()
    } catch {
      toast.error('操作失败')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* 头部 */}
      <div className="border-b bg-background">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/workflows/${workflowId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  工作流统计分析
                </h1>
                <p className="text-sm text-muted-foreground">
                  查看执行统计、用户反馈、数据趋势和优化建议
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 手动刷新按钮 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadAnalytics()
                  loadSuggestions()
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>

              {/* 自动刷新开关 */}
              <div className="flex items-center gap-2 border-l pl-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-muted-foreground">自动刷新</span>
                </label>

                {autoRefresh && (
                  <Select
                    value={String(refreshInterval)}
                    onValueChange={(val) => setRefreshInterval(Number(val))}
                  >
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30000">30秒</SelectItem>
                      <SelectItem value="60000">1分钟</SelectItem>
                      <SelectItem value="300000">5分钟</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 时间周期选择 */}
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">最近24小时</SelectItem>
                  <SelectItem value="week">最近7天</SelectItem>
                  <SelectItem value="month">最近30天</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="container mx-auto px-6 py-6">
        <Tabs defaultValue="execution" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-4">
            <TabsTrigger value="execution" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              执行统计
            </TabsTrigger>
            <TabsTrigger value="nodes" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              节点分析
            </TabsTrigger>
            <TabsTrigger value="cost" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              成本分析
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              数据分析
            </TabsTrigger>
          </TabsList>

          {/* 执行统计标签页 */}
          <TabsContent value="execution">
            {analytics && (
              <div className="space-y-6">
                {/* 汇总卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">{analytics.summary.totalExecutions}</p>
                        <p className="text-sm text-muted-foreground">总执行次数</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-green-600">
                          {(analytics.summary.successRate * 100).toFixed(1)}%
                        </p>
                        <p className="text-sm text-muted-foreground">成功率</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center flex flex-col items-center">
                        <div className="flex items-center gap-1">
                          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                          <span className="text-3xl font-bold">
                            {analytics.summary.avgRating.toFixed(1)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">平均评分</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">{analytics.summary.feedbackCount}</p>
                        <p className="text-sm text-muted-foreground">反馈数</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">
                          {(analytics.summary.avgDuration / 1000).toFixed(1)}s
                        </p>
                        <p className="text-sm text-muted-foreground">平均耗时</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">
                          {analytics.summary.avgTokens.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">平均Token</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 主要内容区 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* 左侧：问题分类和评分分布 */}
                  <div className="space-y-6">
                    {/* 问题分类 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">问题分类分布</CardTitle>
                        <CardDescription>用户反馈中标记的问题类型</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {analytics.issueBreakdown.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            暂无问题反馈
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {analytics.issueBreakdown.map((item) => (
                              <div key={item.category}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span>{ISSUE_CATEGORY_LABELS[item.category] || item.category}</span>
                                  <span className="text-muted-foreground">
                                    {item.count} ({item.percentage.toFixed(0)}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${item.percentage}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 评分分布 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">评分分布</CardTitle>
                        <CardDescription>用户对执行结果的评分</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analytics.ratingDistribution.reverse().map((item) => (
                            <div key={item.rating} className="flex items-center gap-2">
                              <div className="flex items-center gap-1 w-16">
                                {[...Array(item.rating)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className="h-3 w-3 text-yellow-500 fill-yellow-500"
                                  />
                                ))}
                              </div>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-yellow-500 rounded-full"
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {item.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 右侧：优化建议 */}
                  <div className="lg:col-span-2">
                    <Card className="h-full">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Lightbulb className="h-4 w-4" />
                              待处理优化建议
                            </CardTitle>
                            <CardDescription>
                              AI 根据用户反馈生成的优化建议
                            </CardDescription>
                          </div>
                          {analytics.suggestions.pending > 0 && (
                            <Badge variant="secondary">
                              {analytics.suggestions.pending} 条待处理
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {isLoadingSuggestions ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : suggestions.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                            <p>暂无待处理的优化建议</p>
                            <p className="text-xs mt-1">
                              当用户提交反馈并请求AI诊断时，建议会出现在这里
                            </p>
                          </div>
                        ) : (
                          <ScrollArea className="h-[400px]">
                            <div className="space-y-4 pr-4">
                              {suggestions.map((suggestion) => (
                                <div
                                  key={suggestion.id}
                                  className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium">{suggestion.suggestionTitle}</h4>
                                        <Badge variant="outline" className="text-xs">
                                          置信度 {(suggestion.confidence * 100).toFixed(0)}%
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground line-clamp-2">
                                        {suggestion.suggestionDetail}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRejectSuggestion(suggestion.id)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => handleApplySuggestion(suggestion.id)}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        应用
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* 执行趋势 */}
                {analytics.trend.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">执行趋势</CardTitle>
                          <CardDescription>每日执行次数和成功率变化</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">图表类型:</span>
                          <div className="flex gap-1">
                            {(['LINE', 'BAR', 'AREA'] as const).map((type) => (
                              <Button
                                key={type}
                                variant={trendChartType === type ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTrendChartType(type)}
                                className="text-xs"
                              >
                                {type === 'LINE' ? '折线图' : type === 'BAR' ? '柱状图' : '面积图'}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <AnalyticsChart
                        type={trendChartType}
                        data={analytics.trend}
                        config={{
                          xKey: 'date',
                          yKey: 'executions',
                          height: 350,
                        }}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* 节点分析标签页 */}
          <TabsContent value="nodes">
            {isLoadingNodeStats ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : nodeStats.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground">暂无节点执行数据</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>节点执行统计</CardTitle>
                  <CardDescription>
                    各节点的执行次数、成功率、耗时和Token消耗统计
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium">节点名称</th>
                          <th className="text-left py-3 px-4 font-medium">类型</th>
                          <th className="text-right py-3 px-4 font-medium">执行次数</th>
                          <th className="text-right py-3 px-4 font-medium">成功率</th>
                          <th className="text-right py-3 px-4 font-medium">平均耗时</th>
                          <th className="text-right py-3 px-4 font-medium">耗时范围</th>
                          <th className="text-right py-3 px-4 font-medium">平均Token</th>
                          <th className="text-right py-3 px-4 font-medium">总Token</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nodeStats.map((node) => (
                          <tr key={node.nodeId} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-4">
                              <div className="font-medium">{node.nodeName}</div>
                              <div className="text-xs text-muted-foreground">{node.nodeId}</div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="text-xs">
                                {node.nodeType}
                              </Badge>
                            </td>
                            <td className="text-right py-3 px-4">
                              {node.executions}
                            </td>
                            <td className="text-right py-3 px-4">
                              <span
                                className={
                                  node.successRate >= 0.9
                                    ? 'text-green-600 font-medium'
                                    : node.successRate >= 0.7
                                      ? 'text-yellow-600 font-medium'
                                      : 'text-red-600 font-medium'
                                }
                              >
                                {(node.successRate * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="text-right py-3 px-4">
                              {(node.avgDuration / 1000).toFixed(2)}s
                            </td>
                            <td className="text-right py-3 px-4 text-xs text-muted-foreground">
                              {(node.minDuration / 1000).toFixed(2)}s - {(node.maxDuration / 1000).toFixed(2)}s
                            </td>
                            <td className="text-right py-3 px-4">
                              {node.avgTokens.toLocaleString()}
                            </td>
                            <td className="text-right py-3 px-4">
                              <span
                                className={
                                  node.totalTokens > 100000
                                    ? 'text-red-600 font-medium'
                                    : node.totalTokens > 50000
                                      ? 'text-yellow-600'
                                      : ''
                                }
                              >
                                {node.totalTokens.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 统计摘要 */}
                  <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{nodeStats.length}</p>
                      <p className="text-sm text-muted-foreground">节点总数</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {nodeStats.reduce((sum, n) => sum + n.executions, 0)}
                      </p>
                      <p className="text-sm text-muted-foreground">节点执行总次数</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {nodeStats.reduce((sum, n) => sum + n.totalTokens, 0).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">Token总消耗</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 成本分析标签页 */}
          <TabsContent value="cost">
            {isLoadingCost ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !costData ? (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground">暂无成本数据</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* 成本汇总卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-green-600">
                          ${costData.summary.totalCost.toFixed(4)}
                        </p>
                        <p className="text-sm text-muted-foreground">总成本 (USD)</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">
                          {costData.summary.totalTokens.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">总Token</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">
                          ${costData.summary.avgCostPerExecution.toFixed(4)}
                        </p>
                        <p className="text-sm text-muted-foreground">平均成本/次</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold">
                          {costData.summary.avgTokensPerExecution.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">平均Token/次</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 模型成本分布 */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">模型成本分布</CardTitle>
                      <CardDescription>各AI模型的Token消耗和成本占比</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {costData.modelBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          暂无模型使用数据
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {costData.modelBreakdown.map((item) => (
                            <div key={item.model}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">{item.model}</span>
                                <span className="text-muted-foreground">
                                  ${item.cost.toFixed(4)} ({item.percentage.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 rounded-full"
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>{item.tokens.toLocaleString()} tokens</span>
                                <span>{item.count} 次调用</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Token分布饼图 */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Token类型分布</CardTitle>
                      <CardDescription>输入Token与输出Token的比例</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AnalyticsChart
                        type="PIE"
                        data={[
                          { name: '输入Token', value: costData.summary.totalPromptTokens },
                          { name: '输出Token', value: costData.summary.totalCompletionTokens },
                        ]}
                        config={{
                          nameKey: 'name',
                          valueKey: 'value',
                          height: 250,
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* 成本趋势 */}
                {costData.trend.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">成本趋势</CardTitle>
                      <CardDescription>每日Token消耗和成本变化</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AnalyticsChart
                        type="BAR"
                        data={costData.trend}
                        config={{
                          xKey: 'date',
                          yKey: 'tokens',
                          height: 300,
                        }}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* 数据分析标签页 */}
          <TabsContent value="analytics">
            <EnhancedAnalytics />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
