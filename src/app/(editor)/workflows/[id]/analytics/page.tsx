'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Star,
  Clock,
  Zap,
  MessageSquare,
  Lightbulb,
  Check,
  X,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'

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
  const router = useRouter()
  const workflowId = params.id as string

  const [period, setPeriod] = useState('week')
  const [isLoading, setIsLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // 加载统计数据
  const loadAnalytics = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/analytics?period=${period}`)
      if (!response.ok) throw new Error('加载失败')
      const result = await response.json()
      setAnalytics(result.data)
    } catch (error) {
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
      setSuggestions(result.data.suggestions || [])
    } catch (error) {
      console.error('加载建议失败', error)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }, [workflowId])

  useEffect(() => {
    loadAnalytics()
    loadSuggestions()
  }, [loadAnalytics, loadSuggestions])

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
    } catch (error) {
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
    } catch (error) {
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
                  查看执行统计、用户反馈和优化建议
                </p>
              </div>
            </div>

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

      {/* 内容 */}
      <div className="container mx-auto px-6 py-6">
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
                  <CardTitle className="text-base">执行趋势</CardTitle>
                  <CardDescription>每日执行次数和成功率变化</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">日期</th>
                          <th className="text-right py-2 px-4">执行次数</th>
                          <th className="text-right py-2 px-4">成功率</th>
                          <th className="text-right py-2 px-4">平均评分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.trend.map((item) => (
                          <tr key={item.date} className="border-b">
                            <td className="py-2 px-4">{item.date}</td>
                            <td className="text-right py-2 px-4">{item.executions}</td>
                            <td className="text-right py-2 px-4">
                              <span
                                className={
                                  item.successRate >= 0.9
                                    ? 'text-green-600'
                                    : item.successRate >= 0.7
                                    ? 'text-yellow-600'
                                    : 'text-red-600'
                                }
                              >
                                {(item.successRate * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="text-right py-2 px-4">
                              {item.avgRating > 0 ? (
                                <span className="flex items-center justify-end gap-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                  {item.avgRating.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
