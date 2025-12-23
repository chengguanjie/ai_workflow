'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import AnalyticsChart from '@/components/workflow/analytics/analytics-chart'

type AnalyticsChartType = 'LINE' | 'BAR' | 'PIE' | 'AREA' | 'SCATTER' | 'RADAR'

function toAnalyticsChartType(value: unknown): AnalyticsChartType | null {
  if (typeof value !== 'string') return null
  if (value === 'LINE') return 'LINE'
  if (value === 'BAR') return 'BAR'
  if (value === 'PIE') return 'PIE'
  if (value === 'AREA') return 'AREA'
  if (value === 'SCATTER') return 'SCATTER'
  if (value === 'RADAR') return 'RADAR'
  return null
}

interface AnalyticsConfig {
  id: string
  name: string
  label: string
  type: string
  unit?: string
  defaultVisualization?: string
}

interface DataPoint {
  date: Date
  value: number
  count: number
}

interface AnalyticsDataItem {
  config: AnalyticsConfig
  data: DataPoint[]
  summary: {
    total: number
    average: number | null
    min: number | null
    max: number | null
  }
}

interface AnalyticsResponse {
  dateRange: {
    start: string
    end: string
  }
  groupBy: string
  aggregationType: string
  data: AnalyticsDataItem[]
}

const TIME_RANGES = [
  { value: '7d', label: '最近7天' },
  { value: '30d', label: '最近30天' },
  { value: '90d', label: '最近90天' },
  { value: '180d', label: '最近半年' },
  { value: '365d', label: '最近一年' },
]

const AGGREGATION_TYPES = [
  { value: 'AVG', label: '平均值' },
  { value: 'SUM', label: '总和' },
  { value: 'MIN', label: '最小值' },
  { value: 'MAX', label: '最大值' },
  { value: 'COUNT', label: '计数' },
  { value: 'MEDIAN', label: '中位数' },
]

export default function EnhancedAnalyticsPage() {
  const params = useParams()
  const workflowId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [configs, setConfigs] = useState<AnalyticsConfig[]>([])
  const [selectedConfig, setSelectedConfig] = useState<string>('all')
  const [timeRange, setTimeRange] = useState('30d')
  const [groupBy, setGroupBy] = useState('day')
  const [aggregationType, setAggregationType] = useState('AVG')
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null)

  // 加载分析配置
  const loadConfigs = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/analytics/config`)
      if (!response.ok) throw new Error('加载配置失败')
      const result = await response.json()
      // API 返回格式: { success: true, data: [...] }
      const nextConfigs = result.data || []
      setConfigs(nextConfigs)
      if (nextConfigs.length === 0) {
        setAnalyticsData(null)
        setIsLoading(false)
      }
    } catch (_error) {
      setConfigs([])
      setAnalyticsData(null)
      setIsLoading(false)
      toast.error('加载分析配置失败')
    }
  }

  // 加载分析数据
  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      // 计算日期范围
      const days = parseInt(timeRange.replace('d', ''))
      const startDate = startOfDay(subDays(new Date(), days))
      const endDate = endOfDay(new Date())

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        groupBy,
        aggregation: aggregationType,
      })

      if (selectedConfig !== 'all') {
        params.append('configId', selectedConfig)
      }

      const response = await fetch(
        `/api/workflows/${workflowId}/analytics/data?${params}`
      )
      if (!response.ok) throw new Error('加载数据失败')
      const result = await response.json()
      // API 返回格式: { success: true, data: {...} }
      setAnalyticsData(result.data || null)
    } catch (_error) {
      toast.error('加载分析数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 刷新数据
  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadAnalytics()
    setIsRefreshing(false)
    toast.success('数据已刷新')
  }

  // 计算趋势
  const calculateTrend = (data: DataPoint[]) => {
    if (data.length < 2) return { value: 0, direction: 'stable' as const }

    const recent = data.slice(-7).reduce((sum, d) => sum + d.value, 0) / Math.min(data.length, 7)
    const previous = data.slice(-14, -7).reduce((sum, d) => sum + d.value, 0) / Math.min(data.slice(-14, -7).length, 7)

    if (previous === 0) return { value: 0, direction: 'stable' as const }

    const change = ((recent - previous) / previous) * 100
    const direction = change > 5 ? 'up' : change < -5 ? 'down' : 'stable'

    return { value: Math.abs(change), direction }
  }

  useEffect(() => {
    setIsLoading(true)
    setSelectedConfig('all')
    setConfigs([])
    setAnalyticsData(null)
    loadConfigs()
  }, [workflowId])

  useEffect(() => {
    if (configs.length > 0) {
      loadAnalytics()
    }
  }, [workflowId, selectedConfig, timeRange, groupBy, aggregationType, configs])

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
        <Link href={`/workflows/${workflowId}/analytics/config`}>
          <Button variant="outline" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            配置数据点
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>数据筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">数据点</label>
              <Select value={selectedConfig} onValueChange={setSelectedConfig}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有数据点</SelectItem>
                  {configs.map(config => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">时间范围</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map(range => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">分组方式</label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">按天</SelectItem>
                  <SelectItem value="week">按周</SelectItem>
                  <SelectItem value="month">按月</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">聚合方式</label>
              <Select value={aggregationType} onValueChange={setAggregationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATION_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : analyticsData && analyticsData.data.length > 0 ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {analyticsData.data.map(item => {
              const trend = calculateTrend(item.data)
              return (
                <Card key={item.config.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {item.config.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-2xl font-bold">
                          {item.summary.average?.toFixed(2) || 0}
                          {item.config.unit && (
                            <span className="text-sm font-normal text-muted-foreground ml-1">
                              {item.config.unit}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          共 {item.summary.total} 个数据点
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {trend.direction === 'up' ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : trend.direction === 'down' ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={`text-sm ${
                          trend.direction === 'up' ? 'text-green-500' :
                          trend.direction === 'down' ? 'text-red-500' :
                          'text-muted-foreground'
                        }`}>
                          {trend.value.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>最小: {item.summary.min?.toFixed(2) || 0}</span>
                      <span>最大: {item.summary.max?.toFixed(2) || 0}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Charts */}
          <Tabs defaultValue="0" className="space-y-4">
            <TabsList>
              {analyticsData.data.map((item, index) => (
                <TabsTrigger key={index} value={index.toString()}>
                  {item.config.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {analyticsData.data.map((item, index) => (
              <TabsContent key={index} value={index.toString()}>
                <Card>
                  <CardHeader>
                    <CardTitle>{item.config.label}趋势图</CardTitle>
                    <CardDescription>
                      {format(new Date(analyticsData.dateRange.start), 'yyyy年MM月dd日', { locale: zhCN })} -
                      {format(new Date(analyticsData.dateRange.end), 'yyyy年MM月dd日', { locale: zhCN })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnalyticsChart
                      type={toAnalyticsChartType(item.config.defaultVisualization) ?? 'LINE'}
                      data={item.data}
                      config={{
                        xKey: 'date',
                        yKey: 'value',
                        height: 400,
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              {configs.length === 0 ? (
                <div className="space-y-4">
                  <p>尚未配置数据收集点</p>
                  <Link href={`/workflows/${workflowId}/analytics/config`}>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      配置数据点
                    </Button>
                  </Link>
                </div>
              ) : (
                <p>暂无数据</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
