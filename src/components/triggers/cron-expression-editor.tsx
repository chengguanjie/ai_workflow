'use client'

import { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Clock, AlertCircle } from 'lucide-react'

interface CronExpressionEditorProps {
  value: string
  onChange: (value: string) => void
}

type PresetType = 'preset' | 'custom'

interface CronPreset {
  label: string
  value: string
  description: string
}

const CRON_PRESETS: CronPreset[] = [
  { label: '每分钟', value: '* * * * *', description: '每分钟执行一次' },
  { label: '每5分钟', value: '*/5 * * * *', description: '每5分钟执行一次' },
  { label: '每15分钟', value: '*/15 * * * *', description: '每15分钟执行一次' },
  { label: '每30分钟', value: '*/30 * * * *', description: '每30分钟执行一次' },
  { label: '每小时', value: '0 * * * *', description: '每小时整点执行' },
  { label: '每天凌晨', value: '0 0 * * *', description: '每天 00:00 执行' },
  { label: '每天早上9点', value: '0 9 * * *', description: '每天 09:00 执行' },
  { label: '每天中午12点', value: '0 12 * * *', description: '每天 12:00 执行' },
  { label: '每天下午6点', value: '0 18 * * *', description: '每天 18:00 执行' },
  { label: '工作日早9点', value: '0 9 * * 1-5', description: '周一至周五 09:00 执行' },
  { label: '每周一', value: '0 0 * * 1', description: '每周一 00:00 执行' },
  { label: '每月1号', value: '0 0 1 * *', description: '每月1号 00:00 执行' },
]

// Common minute options
const MINUTE_OPTIONS = [
  { label: '每分钟', value: '*' },
  { label: '每5分钟', value: '*/5' },
  { label: '每10分钟', value: '*/10' },
  { label: '每15分钟', value: '*/15' },
  { label: '每30分钟', value: '*/30' },
  { label: '整点', value: '0' },
  { label: '第30分', value: '30' },
]

// Common hour options
const HOUR_OPTIONS = [
  { label: '每小时', value: '*' },
  { label: '每2小时', value: '*/2' },
  { label: '每3小时', value: '*/3' },
  { label: '每6小时', value: '*/6' },
  { label: '每12小时', value: '*/12' },
  { label: '凌晨0点', value: '0' },
  { label: '早上6点', value: '6' },
  { label: '早上9点', value: '9' },
  { label: '中午12点', value: '12' },
  { label: '下午6点', value: '18' },
  { label: '晚上10点', value: '22' },
]

// Day of week labels
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// Validate cron expression
function validateCronExpression(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    return { valid: false, error: 'Cron 表达式必须包含5个部分' }
  }

  const ranges = [
    { name: '分钟', min: 0, max: 59 },
    { name: '小时', min: 0, max: 23 },
    { name: '日期', min: 1, max: 31 },
    { name: '月份', min: 1, max: 12 },
    { name: '星期', min: 0, max: 7 },
  ]

  for (let i = 0; i < 5; i++) {
    const part = parts[i]
    const range = ranges[i]

    if (part === '*') continue
    if (part.startsWith('*/')) {
      const interval = parseInt(part.slice(2))
      if (isNaN(interval) || interval < 1) {
        return { valid: false, error: `${range.name}间隔值无效` }
      }
      continue
    }

    // Check comma-separated values
    const values = part.split(',')
    for (const v of values) {
      if (v.includes('-')) {
        const [start, end] = v.split('-').map((s) => parseInt(s))
        if (isNaN(start) || isNaN(end) || start > end || start < range.min || end > range.max) {
          return { valid: false, error: `${range.name}范围值无效` }
        }
      } else {
        const num = parseInt(v)
        if (isNaN(num) || num < range.min || num > range.max) {
          return { valid: false, error: `${range.name}值超出范围 (${range.min}-${range.max})` }
        }
      }
    }
  }

  return { valid: true }
}

// Parse cron expression
function parseCronExpression(cron: string): {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
} {
  const parts = cron.trim().split(/\s+/)
  return {
    minute: parts[0] || '*',
    hour: parts[1] || '*',
    dayOfMonth: parts[2] || '*',
    month: parts[3] || '*',
    dayOfWeek: parts[4] || '*',
  }
}

// Build cron expression
function buildCronExpression(parts: {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}): string {
  return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`
}

// Get human readable description
function getCronDescription(cron: string): string {
  const parts = parseCronExpression(cron)
  const descriptions: string[] = []

  // Minute
  if (parts.minute === '*') {
    descriptions.push('每分钟')
  } else if (parts.minute.startsWith('*/')) {
    descriptions.push(`每 ${parts.minute.slice(2)} 分钟`)
  } else {
    descriptions.push(`在第 ${parts.minute} 分`)
  }

  // Hour
  if (parts.hour === '*') {
    if (parts.minute !== '*' && !parts.minute.startsWith('*/')) {
      descriptions.push('每小时')
    }
  } else if (parts.hour.startsWith('*/')) {
    descriptions.push(`每 ${parts.hour.slice(2)} 小时`)
  } else {
    const hour = parseInt(parts.hour)
    descriptions.push(`${hour} 点`)
  }

  // Day of month
  if (parts.dayOfMonth !== '*') {
    if (parts.dayOfMonth.startsWith('*/')) {
      descriptions.push(`每 ${parts.dayOfMonth.slice(2)} 天`)
    } else {
      descriptions.push(`每月 ${parts.dayOfMonth} 号`)
    }
  }

  // Month
  if (parts.month !== '*') {
    const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    if (parts.month.includes(',')) {
      const months = parts.month.split(',').map(m => monthNames[parseInt(m)] || m)
      descriptions.push(`在 ${months.join('、')}`)
    } else {
      descriptions.push(`在 ${monthNames[parseInt(parts.month)] || parts.month}`)
    }
  }

  // Day of week
  if (parts.dayOfWeek !== '*') {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    if (parts.dayOfWeek === '1-5') {
      descriptions.push('工作日')
    } else if (parts.dayOfWeek === '0,6') {
      descriptions.push('周末')
    } else if (parts.dayOfWeek.includes(',')) {
      const days = parts.dayOfWeek.split(',').map(d => dayNames[parseInt(d)] || d)
      descriptions.push(`在 ${days.join('、')}`)
    } else if (parts.dayOfWeek.includes('-')) {
      const [start, end] = parts.dayOfWeek.split('-').map(d => parseInt(d))
      descriptions.push(`${dayNames[start]} 至 ${dayNames[end]}`)
    } else {
      descriptions.push(`每${dayNames[parseInt(parts.dayOfWeek)] || parts.dayOfWeek}`)
    }
  }

  return descriptions.join(' ') || '每分钟'
}

// Calculate next execution times
function getNextExecutionTimes(cron: string, count: number = 5): Date[] {
  const times: Date[] = []
  const now = new Date()
  let current = new Date(now)

  // Simple calculation for next few executions
  const parts = parseCronExpression(cron)

  for (let i = 0; i < count * 1000 && times.length < count; i++) {
    current = new Date(current.getTime() + 60000) // Add 1 minute

    const minute = current.getMinutes()
    const hour = current.getHours()
    const dayOfMonth = current.getDate()
    const month = current.getMonth() + 1
    const dayOfWeek = current.getDay()

    // Check minute
    if (!matchCronPart(parts.minute, minute)) continue
    // Check hour
    if (!matchCronPart(parts.hour, hour)) continue
    // Check day of month
    if (!matchCronPart(parts.dayOfMonth, dayOfMonth)) continue
    // Check month
    if (!matchCronPart(parts.month, month)) continue
    // Check day of week
    if (!matchCronPart(parts.dayOfWeek, dayOfWeek)) continue

    times.push(new Date(current))
  }

  return times
}

function matchCronPart(pattern: string, value: number): boolean {
  if (pattern === '*') return true
  if (pattern.startsWith('*/')) {
    const interval = parseInt(pattern.slice(2))
    return value % interval === 0
  }
  if (pattern.includes(',')) {
    return pattern.split(',').some(p => parseInt(p) === value)
  }
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(p => parseInt(p))
    return value >= start && value <= end
  }
  return parseInt(pattern) === value
}

export function CronExpressionEditor({ value, onChange }: CronExpressionEditorProps) {
  const [mode, setMode] = useState<PresetType>('preset')
  const [cronParts, setCronParts] = useState(() => parseCronExpression(value))
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Check if current value matches a preset
  const matchedPreset = useMemo(() => {
    return CRON_PRESETS.find(p => p.value === value)
  }, [value])

  // Validate the cron expression
  const validation = useMemo(() => validateCronExpression(value), [value])

  // Set mode based on whether value matches preset
  useEffect(() => {
    if (matchedPreset) {
      setMode('preset')
    } else {
      setMode('custom')
      setCronParts(parseCronExpression(value))
    }
  }, [value, matchedPreset])

  // Handle preset selection
  const handlePresetSelect = (presetValue: string) => {
    onChange(presetValue)
  }

  // Handle custom part change
  const handlePartChange = (part: keyof typeof cronParts, partValue: string) => {
    const newParts = { ...cronParts, [part]: partValue }
    setCronParts(newParts)
    onChange(buildCronExpression(newParts))
  }

  // Handle weekday toggle
  const handleWeekdayToggle = (days: string[]) => {
    let newValue: string
    if (days.length === 0) {
      newValue = '*'
    } else if (days.length === 7) {
      newValue = '*'
    } else {
      newValue = days.sort((a, b) => parseInt(a) - parseInt(b)).join(',')
    }
    handlePartChange('dayOfWeek', newValue)
  }

  // Get selected weekdays for toggle group
  const selectedWeekdays = useMemo(() => {
    if (cronParts.dayOfWeek === '*') return []
    if (cronParts.dayOfWeek.includes('-')) {
      const [start, end] = cronParts.dayOfWeek.split('-').map(d => parseInt(d))
      const days: string[] = []
      for (let i = start; i <= end; i++) {
        days.push(String(i))
      }
      return days
    }
    return cronParts.dayOfWeek.split(',')
  }, [cronParts.dayOfWeek])

  const description = useMemo(() => getCronDescription(value), [value])
  const nextTimes = useMemo(() => getNextExecutionTimes(value, 3), [value])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Cron 表达式</Label>
        <Badge variant="outline" className="font-mono">
          {value}
        </Badge>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as PresetType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="preset">快速选择</TabsTrigger>
          <TabsTrigger value="custom">自定义</TabsTrigger>
        </TabsList>

        <TabsContent value="preset" className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePresetSelect(preset.value)}
                className={`p-3 text-left rounded-lg border transition-colors ${
                  value === preset.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div className="font-medium text-sm">{preset.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="custom" className="mt-4 space-y-4">
          {/* Minute selection */}
          <div className="space-y-2">
            <Label className="text-sm">分钟</Label>
            <Select
              value={MINUTE_OPTIONS.find(o => o.value === cronParts.minute) ? cronParts.minute : 'custom'}
              onValueChange={(v) => v !== 'custom' && handlePartChange('minute', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择分钟" />
              </SelectTrigger>
              <SelectContent>
                {MINUTE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
                {!MINUTE_OPTIONS.find(o => o.value === cronParts.minute) && (
                  <SelectItem value="custom">
                    自定义: {cronParts.minute}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Hour selection */}
          <div className="space-y-2">
            <Label className="text-sm">小时</Label>
            <Select
              value={HOUR_OPTIONS.find(o => o.value === cronParts.hour) ? cronParts.hour : 'custom'}
              onValueChange={(v) => v !== 'custom' && handlePartChange('hour', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择小时" />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
                {!HOUR_OPTIONS.find(o => o.value === cronParts.hour) && (
                  <SelectItem value="custom">
                    自定义: {cronParts.hour}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Weekday selection */}
          <div className="space-y-2">
            <Label className="text-sm">星期（不选则每天）</Label>
            <ToggleGroup
              type="multiple"
              value={selectedWeekdays}
              onValueChange={handleWeekdayToggle}
              className="justify-start"
            >
              {WEEKDAY_LABELS.map((day, idx) => (
                <ToggleGroupItem
                  key={idx}
                  value={String(idx)}
                  className="w-10 h-10"
                  aria-label={`周${day}`}
                >
                  {day}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showAdvanced ? '隐藏高级选项' : '显示高级选项'}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-5 gap-2 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">分钟</Label>
                <Input
                  value={cronParts.minute}
                  onChange={(e) => handlePartChange('minute', e.target.value)}
                  placeholder="*"
                  className="font-mono text-center text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">小时</Label>
                <Input
                  value={cronParts.hour}
                  onChange={(e) => handlePartChange('hour', e.target.value)}
                  placeholder="*"
                  className="font-mono text-center text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">日</Label>
                <Input
                  value={cronParts.dayOfMonth}
                  onChange={(e) => handlePartChange('dayOfMonth', e.target.value)}
                  placeholder="*"
                  className="font-mono text-center text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">月</Label>
                <Input
                  value={cronParts.month}
                  onChange={(e) => handlePartChange('month', e.target.value)}
                  placeholder="*"
                  className="font-mono text-center text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">周</Label>
                <Input
                  value={cronParts.dayOfWeek}
                  onChange={(e) => handlePartChange('dayOfWeek', e.target.value)}
                  placeholder="*"
                  className="font-mono text-center text-sm"
                />
              </div>
            </div>
          )}

          {showAdvanced && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <code className="bg-muted px-1 rounded">*</code> 任意值，
                <code className="bg-muted px-1 rounded">*/n</code> 每隔n，
                <code className="bg-muted px-1 rounded">1,3,5</code> 列表，
                <code className="bg-muted px-1 rounded">1-5</code> 范围
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Validation error */}
      {!validation.valid && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{validation.error}</span>
        </div>
      )}

      {/* Description and preview */}
      <div className="rounded-lg bg-muted p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{description}</span>
        </div>

        {validation.valid && nextTimes.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p className="mb-1">接下来执行时间：</p>
            <ul className="space-y-0.5">
              {nextTimes.map((time, idx) => (
                <li key={idx}>
                  {time.toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
