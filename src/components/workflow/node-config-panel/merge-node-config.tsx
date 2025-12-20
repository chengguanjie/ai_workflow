'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Loader2, AlertCircle } from 'lucide-react'
import { OutputTabContent } from './shared/output-tab-content'
import { PromptTabContent } from './shared/prompt-tab-content'
import type { MergeStrategy, ParallelErrorStrategy } from '@/types/workflow'
import type { AIProviderConfig } from './shared/types'

type MergeTabType = 'config' | 'ai' | 'prompt' | 'output'

interface MergeNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

const MERGE_STRATEGIES: { value: MergeStrategy; label: string; description: string }[] = [
  { value: 'all', label: '全部完成', description: '等待所有分支完成后继续' },
  { value: 'any', label: '任一完成', description: '任一分支完成后继续' },
  { value: 'race', label: '竞速模式', description: '使用最快完成的分支结果' },
]

const ERROR_STRATEGIES: { value: ParallelErrorStrategy; label: string; description: string }[] = [
  { value: 'fail_fast', label: '立即失败', description: '任一分支失败时立即停止' },
  { value: 'continue', label: '继续执行', description: '跳过失败分支，继续其他分支' },
  { value: 'collect', label: '收集错误', description: '完成所有分支后汇总错误' },
]

const OUTPUT_MODES: { value: string; label: string; description: string }[] = [
  { value: 'merge', label: '合并对象', description: '将各分支输出合并为一个对象' },
  { value: 'array', label: '数组格式', description: '将各分支输出收集为数组' },
  { value: 'first', label: '首个结果', description: '仅使用第一个完成的分支输出' },
]

export function MergeNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: MergeNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<MergeTabType>('config')
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)

  const mergeConfig = config as {
    mergeStrategy?: MergeStrategy
    errorStrategy?: ParallelErrorStrategy
    outputMode?: string
    timeout?: number
    enableAI?: boolean
    aiConfigId?: string
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    userPrompt?: string
  } || {}

  const mergeStrategy = mergeConfig.mergeStrategy || 'all'
  const errorStrategy = mergeConfig.errorStrategy || 'fail_fast'
  const outputMode = mergeConfig.outputMode || 'merge'
  const timeout = mergeConfig.timeout || 300000
  const enableAI = mergeConfig.enableAI || false

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          const providerList = data.providers || []
          setProviders(providerList)

          // 如果启用了 AI 但没有选择配置，使用默认配置
          if (enableAI && !mergeConfig.aiConfigId && data.defaultProvider) {
            updateConfig({
              aiConfigId: data.defaultProvider.id,
              model: data.defaultProvider.defaultModel,
            })
          }
        }
      } catch (error) {
        console.error('Failed to load providers:', error)
      } finally {
        setLoadingProviders(false)
      }
    }
    loadProviders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateConfig = (updates: Record<string, unknown>) => {
    onUpdate({ ...config, ...updates })
  }

  const handleChange = (key: string, value: unknown) => {
    updateConfig({ [key]: value })
  }

  // 当选择服务商时，自动填充默认模型
  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    updateConfig({
      aiConfigId: configId,
      model: selected?.defaultModel || '',
    })
  }

  // 切换 AI 处理开关
  const handleEnableAIChange = (enabled: boolean) => {
    if (enabled && providers.length > 0) {
      // 启用时自动选择默认服务商
      const defaultProvider = providers.find(p => p.isDefault) || providers[0]
      updateConfig({
        enableAI: true,
        aiConfigId: defaultProvider?.id,
        model: defaultProvider?.defaultModel,
      })
    } else {
      updateConfig({ enableAI: enabled })
    }
  }

  const selectedProvider = providers.find(p => p.id === mergeConfig.aiConfigId)

  // Tab 配置
  const tabs: { key: MergeTabType; label: string }[] = [
    { key: 'config', label: '配置' },
    { key: 'ai', label: 'AI 配置' },
    { key: 'prompt', label: '提示词' },
    { key: 'output', label: '输出' },
  ]

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
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
          {/* 合并策略 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">合并策略</Label>
            <Select
              value={mergeStrategy}
              onValueChange={(v) => updateConfig({ mergeStrategy: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MERGE_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy.value} value={strategy.value}>
                    <div className="flex flex-col">
                      <span>{strategy.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {strategy.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MERGE_STRATEGIES.find((s) => s.value === mergeStrategy)?.description}
            </p>
          </div>

          {/* 错误处理策略 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">错误处理</Label>
            <Select
              value={errorStrategy}
              onValueChange={(v) => updateConfig({ errorStrategy: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ERROR_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy.value} value={strategy.value}>
                    <div className="flex flex-col">
                      <span>{strategy.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {strategy.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ERROR_STRATEGIES.find((s) => s.value === errorStrategy)?.description}
            </p>
          </div>

          {/* 输出模式 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">输出模式</Label>
            <Select
              value={outputMode}
              onValueChange={(v) => updateConfig({ outputMode: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex flex-col">
                      <span>{mode.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {mode.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {OUTPUT_MODES.find((m) => m.value === outputMode)?.description}
            </p>
          </div>

          {/* 超时设置 - 仅在 'all' 策略下显示 */}
          {mergeStrategy === 'all' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">超时时间（秒）</Label>
              <Input
                type="number"
                value={Math.floor(timeout / 1000)}
                onChange={(e) =>
                  updateConfig({ timeout: parseInt(e.target.value, 10) * 1000 })
                }
                min={1}
                max={3600}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                等待所有分支完成的最大时间，超时后将使用已完成的分支结果
              </p>
            </div>
          )}

          {/* 说明信息 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <h4 className="text-sm font-medium">MERGE 节点说明</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• MERGE 节点用于合并多个并行分支的执行结果</li>
              <li>• 所有连接到此节点的上游分支都会被等待和处理</li>
              <li>• 可启用 AI 处理对合并结果进行智能汇总</li>
              <li>• 合并后的结果可供后续节点通过变量引用访问</li>
            </ul>
          </div>
        </div>
      )}

      {/* AI 配置 Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-4">
          {/* AI 处理开关 */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">启用 AI 处理</Label>
              <p className="text-xs text-muted-foreground">
                对合并后的结果进行 AI 智能汇总处理
              </p>
            </div>
            <Switch
              checked={enableAI}
              onCheckedChange={handleEnableAIChange}
            />
          </div>

          {enableAI && (
            <>
              {loadingProviders ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载服务商...
                </div>
              ) : providers.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>尚未配置 AI 服务商，请前往 <a href="/settings/ai-config" className="underline font-medium">设置 → AI 配置</a> 添加</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>服务商配置</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={mergeConfig.aiConfigId || ''}
                      onChange={(e) => handleProviderChange(e.target.value)}
                    >
                      <option value="">选择服务商配置...</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.displayName}{provider.isDefault ? ' (默认)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>模型</Label>
                    {selectedProvider && selectedProvider.models && selectedProvider.models.length > 0 ? (
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={mergeConfig.model || selectedProvider.defaultModel || ''}
                        onChange={(e) => handleChange('model', e.target.value)}
                      >
                        {selectedProvider.models.map((model) => (
                          <option key={model} value={model}>
                            {model}{model === selectedProvider.defaultModel ? ' (默认)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={mergeConfig.model || ''}
                        onChange={(e) => handleChange('model', e.target.value)}
                        placeholder={selectedProvider?.defaultModel || '输入模型名称'}
                      />
                    )}
                    {selectedProvider && (
                      <p className="text-xs text-muted-foreground">
                        默认模型: {selectedProvider.defaultModel}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Temperature</Label>
                      <Input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={mergeConfig.temperature || 0.7}
                        onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Tokens</Label>
                      <Input
                        type="number"
                        min="1"
                        max="128000"
                        value={mergeConfig.maxTokens || 2048}
                        onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {!enableAI && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                启用 AI 处理后，可以对合并的多个分支结果进行智能汇总、分析或重新组织
              </p>
            </div>
          )}
        </div>
      )}

      {/* 提示词 Tab */}
      {activeTab === 'prompt' && (
        <>
          {enableAI ? (
            <PromptTabContent
              processConfig={{
                systemPrompt: mergeConfig.systemPrompt,
                userPrompt: mergeConfig.userPrompt,
              }}
              knowledgeItems={[]}
              onSystemPromptChange={(value) => handleChange('systemPrompt', value)}
              onUserPromptChange={(value) => handleChange('userPrompt', value)}
            />
          ) : (
            <div className="rounded-lg bg-muted/50 p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                请先在「AI 配置」中启用 AI 处理
              </p>
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => setActiveTab('ai')}
              >
                前往启用
              </button>
            </div>
          )}
        </>
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
