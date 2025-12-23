'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface AnalyticsChartProps {
  type: 'LINE' | 'BAR' | 'PIE' | 'AREA' | 'SCATTER' | 'RADAR'
  data: Record<string, unknown>[]
  config: {
    xKey?: string
    yKey?: string
    dataKey?: string
    nameKey?: string
    valueKey?: string
    title?: string
    colors?: string[]
    height?: number
  }
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
]

// 格式化日期
const formatDate = (dateStr: string | number | undefined) => {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'MM-dd', { locale: zhCN })
  } catch {
    return String(dateStr)
  }
}

// 格式化数值
const formatValue = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toFixed(2)
}

interface PayloadItem {
  color: string
  name: string
  value: number
}

// 自定义 Tooltip
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: PayloadItem[]; label?: string | number }) => {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium">{formatDate(label)}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatValue(entry.value)}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsChart({ type, data, config }: AnalyticsChartProps) {
  const {
    xKey = 'date',
    yKey = 'value',
    dataKey = 'value',
    nameKey = 'name',
    valueKey = 'value',
    colors = DEFAULT_COLORS,
    height = 300,
  } = config


  const renderChart = useMemo(() => {
    switch (type) {
      case 'LINE':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatDate}
                className="text-xs"
              />
              <YAxis
                tickFormatter={formatValue}
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke={colors[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )

      case 'BAR':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatDate}
                className="text-xs"
              />
              <YAxis
                tickFormatter={formatValue}
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey={yKey} fill={colors[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'AREA':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatDate}
                className="text-xs"
              />
              <YAxis
                tickFormatter={formatValue}
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke={colors[0]}
                fill={colors[0]}
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'PIE':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'SCATTER':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatDate}
                className="text-xs"
              />
              <YAxis
                tickFormatter={formatValue}
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Scatter name={dataKey} data={data} fill={colors[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        )

      case 'RADAR':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={data}>
              <PolarGrid />
              <PolarAngleAxis dataKey={nameKey} />
              <PolarRadiusAxis />
              <Radar
                name={dataKey}
                dataKey={valueKey}
                stroke={colors[0]}
                fill={colors[0]}
                fillOpacity={0.6}
              />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        )

      default:
        return null
    }
  }, [type, data, xKey, yKey, dataKey, nameKey, valueKey, colors, height])

  return <div className="w-full">{renderChart}</div>
}