'use client'

import { useState, useEffect, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CronExpressionEditor } from '@/components/triggers/cron-expression-editor'
import { OutputTabContent } from './shared/output-tab-content'
import {
  PlayCircle,
  Webhook,
  Clock,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import type { TriggerType, TriggerNodeConfigData } from '@/types/workflow'

type TriggerTabType = 'config' | 'output'

interface TriggerNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

// Common timezones
const TIMEZONES = [
  { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
  { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)' },
  { value: 'Asia/Singapore', label: '新加坡时间 (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: '香港时间 (UTC+8)' },
  { value: 'UTC', label: 'UTC 协调世界时' },
  { value: 'America/New_York', label: '美国东部时间' },
  { value: 'America/Los_Angeles', label: '美国太平洋时间' },
  { value: 'Europe/London', label: '伦敦时间' },
]

const TRIGGER_TYPES: { value: TriggerType; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { value: 'MANUAL', label: '手动触发', icon: PlayCircle, description: '通过界面手动执行工作流' },
  { value: 'WEBHOOK', label: 'Webhook', icon: Webhook, description: '通过 HTTP 请求触发工作流' },
  { value: 'SCHEDULE', label: '定时调度', icon: Clock, description: '按照 Cron 表达式定时执行' },
]

export function TriggerNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: TriggerNodeConfigPanelProps) {
  const triggerConfig = config as TriggerNodeConfigData | undefined
  const [copied, setCopied] = useState(false)
  const [inputTemplateError, setInputTemplateError] = useState<string | null>(null)
  const [inputTemplateStr, setInputTemplateStr] = useState('')
  const [activeTab, setActiveTab] = useState<TriggerTabType>('config')

  // Tab 配置
  const tabs: { key: TriggerTabType; label: string }[] = [
    { key: 'config', label: '配置' },
    { key: 'output', label: '输出' },
  ]

  // Initialize input template string from config
  useEffect(() => {
    if (triggerConfig?.inputTemplate) {
      setInputTemplateStr(JSON.stringify(triggerConfig.inputTemplate, null, 2))
    } else {
      setInputTemplateStr('')
    }
  }, [triggerConfig?.inputTemplate])

  const updateConfig = useCallback((updates: Partial<TriggerNodeConfigData>) => {
    onUpdate({ ...config, ...updates })
  }, [onUpdate, config])

  const triggerType = triggerConfig?.triggerType || 'MANUAL'
  const enabled = triggerConfig?.enabled ?? true
  const webhookPath = triggerConfig?.webhookPath || ''
  const hasWebhookSecret = triggerConfig?.hasWebhookSecret ?? false
  const cronExpression = triggerConfig?.cronExpression || '0 9 * * *'
  const timezone = triggerConfig?.timezone || 'Asia/Shanghai'
  const retryOnFail = triggerConfig?.retryOnFail ?? false
  const maxRetries = triggerConfig?.maxRetries ?? 3

  // Generate webhook path if not exists
  useEffect(() => {
    if (triggerType === 'WEBHOOK' && !webhookPath) {
      const randomPath = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      updateConfig({ webhookPath: randomPath })
    }
  }, [triggerType, webhookPath, updateConfig])

  const handleTriggerTypeChange = (value: TriggerType) => {
    updateConfig({ triggerType: value })
  }

  const handleCopyWebhook = async () => {
    const fullUrl = `${window.location.origin}/api/webhooks/${webhookPath}`
    await navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerateWebhook = () => {
    const randomPath = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    updateConfig({ webhookPath: randomPath })
  }

  const handleInputTemplateChange = (value: string) => {
    setInputTemplateStr(value)
    if (!value.trim()) {
      setInputTemplateError(null)
      updateConfig({ inputTemplate: undefined })
      return
    }
    try {
      const parsed = JSON.parse(value)
      setInputTemplateError(null)
      updateConfig({ inputTemplate: parsed })
    } catch {
      setInputTemplateError('JSON 格式无效')
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 配置 Tab */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* Trigger Type Selection */}
          <div className="space-y-3">
            <Label>触发类型</Label>
            <div className="grid grid-cols-1 gap-2">
              {TRIGGER_TYPES.map((type) => {
                const Icon = type.icon
                const isSelected = triggerType === type.value
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => handleTriggerTypeChange(type.value)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                  >
                    <Icon className={`h-5 w-5 mt-0.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{type.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{type.description}</div>
                    </div>
                    {isSelected && (
                      <Badge variant="secondary" className="text-xs">
                        已选择
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">启用触发器</Label>
              <p className="text-xs text-muted-foreground">
                关闭后触发器将不会执行
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(value) => updateConfig({ enabled: value })}
            />
          </div>

          {/* Webhook Configuration */}
          {triggerType === 'WEBHOOK' && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Webhook 配置</Label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${webhookPath}`}
                    readOnly
                    className="font-mono text-xs flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhook}
                    title="复制 URL"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRegenerateWebhook}
                    title="重新生成"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">启用密钥验证</Label>
                  <p className="text-xs text-muted-foreground">
                    通过 X-Webhook-Secret 头验证请求
                  </p>
                </div>
                <Switch
                  checked={hasWebhookSecret}
                  onCheckedChange={(value) => updateConfig({ hasWebhookSecret: value })}
                />
              </div>

              {hasWebhookSecret && (
                <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  <p>保存工作流后，密钥将自动生成并显示在触发器管理页面。</p>
                </div>
              )}
            </div>
          )}

          {/* Schedule Configuration */}
          {triggerType === 'SCHEDULE' && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">定时调度配置</Label>
              </div>

              <CronExpressionEditor
                value={cronExpression}
                onChange={(value) => updateConfig({ cronExpression: value })}
              />

              <div className="space-y-2">
                <Label className="text-sm">时区</Label>
                <Select
                  value={timezone}
                  onValueChange={(value) => updateConfig({ timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择时区" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Input Template (for Webhook and Schedule) */}
          {(triggerType === 'WEBHOOK' || triggerType === 'SCHEDULE') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>输入模板 (可选)</Label>
                <Badge variant="outline" className="text-xs">JSON</Badge>
              </div>
              <Textarea
                value={inputTemplateStr}
                onChange={(e) => handleInputTemplateChange(e.target.value)}
                placeholder={`{\n  "key": "默认值"\n}`}
                className="font-mono text-sm min-h-[100px]"
              />
              {inputTemplateError && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {inputTemplateError}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                定义触发时的默认输入数据。Webhook 触发可覆盖这些值。
              </p>
            </div>
          )}

          {/* Retry Configuration */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">失败重试</Label>
                <p className="text-xs text-muted-foreground">
                  触发失败时自动重试
                </p>
              </div>
              <Switch
                checked={retryOnFail}
                onCheckedChange={(value) => updateConfig({ retryOnFail: value })}
              />
            </div>

            {retryOnFail && (
              <div className="space-y-2">
                <Label className="text-sm">最大重试次数</Label>
                <Select
                  value={String(maxRetries)}
                  onValueChange={(value) => updateConfig({ maxRetries: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} 次
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Manual Trigger Hint */}
          {triggerType === 'MANUAL' && (
            <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <PlayCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">手动触发模式</p>
                  <p className="mt-1">
                    工作流需要在界面上手动点击执行，适合测试或一次性任务。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
