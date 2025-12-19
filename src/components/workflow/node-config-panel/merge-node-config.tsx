'use client'

import { useState } from 'react'
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
import { OutputTabContent } from './shared/output-tab-content'
import type { MergeStrategy, ParallelErrorStrategy } from '@/types/workflow'

type MergeTabType = 'config' | 'output'

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
  const mergeStrategy = (config?.mergeStrategy as MergeStrategy) || 'all'

  // Tab 配置
  const tabs: { key: MergeTabType; label: string }[] = [
    { key: 'config', label: '配置' },
    { key: 'output', label: '输出' },
  ]
  const errorStrategy = (config?.errorStrategy as ParallelErrorStrategy) || 'fail_fast'
  const outputMode = (config?.outputMode as string) || 'merge'
  const timeout = (config?.timeout as number) || 300000

  const updateConfig = (updates: Record<string, unknown>) => {
    onUpdate({ ...config, ...updates })
  }

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
              <li>• 合并后的结果可供后续节点通过变量引用访问</li>
              <li>• 输出格式：{'{{节点名.分支名.字段名}}'}</li>
            </ul>
          </div>
        </div>
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
