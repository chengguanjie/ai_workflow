'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { X, Plus, GripVertical } from 'lucide-react'
import { OutputTabContent } from './shared/output-tab-content'
import type { SwitchCase, SwitchMatchType } from '@/types/workflow'

// 生成短随机 ID
const generateId = () => Math.random().toString(36).slice(2, 8)

type SwitchTabType = 'config' | 'output'

interface SwitchNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
  availableVariables?: Array<{ label: string; value: string }>
}

const MATCH_TYPES: { value: SwitchMatchType; label: string; description: string }[] = [
  { value: 'exact', label: '精确匹配', description: '值完全相等' },
  { value: 'contains', label: '包含匹配', description: '值包含指定文本' },
  { value: 'regex', label: '正则匹配', description: '使用正则表达式匹配' },
  { value: 'range', label: '范围匹配', description: '数值在指定范围内' },
]

// Tab 配置 - 定义在组件外部避免重复创建
const TABS: { key: SwitchTabType; label: string }[] = [
  { key: 'config', label: '配置' },
  { key: 'output', label: '输出' },
]

export function SwitchNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
  availableVariables = [],
}: SwitchNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<SwitchTabType>('config')

  const switchVariable = (config?.switchVariable as string) || ''
  const cases = (config?.cases as SwitchCase[]) || []
  const matchType = (config?.matchType as SwitchMatchType) || 'exact'
  const caseSensitive = (config?.caseSensitive as boolean) ?? true
  const _includeDefault = (config?.includeDefault as boolean) ?? true

  const addCase = () => {
    const newCase: SwitchCase = {
      id: `case-${generateId()}`,
      label: `Case ${cases.filter(c => !c.isDefault).length + 1}`,
      value: '',
    }
    onUpdate({ ...config, cases: [...cases, newCase] })
  }

  const addDefaultCase = () => {
    // Check if default case already exists
    if (cases.some(c => c.isDefault)) return

    const defaultCase: SwitchCase = {
      id: 'default',
      label: 'Default',
      value: '',
      isDefault: true,
    }
    onUpdate({ ...config, cases: [...cases, defaultCase] })
  }

  const updateCase = (id: string, updates: Partial<SwitchCase>) => {
    const newCases = cases.map(c =>
      c.id === id ? { ...c, ...updates } : c
    )
    onUpdate({ ...config, cases: newCases })
  }

  const removeCase = (id: string) => {
    const newCases = cases.filter(c => c.id !== id)
    onUpdate({ ...config, cases: newCases })
  }

  const updateSwitchVariable = (variable: string) => {
    onUpdate({ ...config, switchVariable: variable })
  }

  const updateMatchType = (type: SwitchMatchType) => {
    onUpdate({ ...config, matchType: type })
  }

  const updateCaseSensitive = (sensitive: boolean) => {
    onUpdate({ ...config, caseSensitive: sensitive })
  }

  const hasDefaultCase = cases.some(c => c.isDefault)

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex border-b">
        {TABS.map((tab) => (
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
        <div className="space-y-4">
          {/* 切换变量 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">切换变量</Label>
            {availableVariables.length > 0 ? (
              <Select
                value={switchVariable}
                onValueChange={updateSwitchVariable}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="选择要切换的变量" />
                </SelectTrigger>
                <SelectContent>
                  {availableVariables.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={switchVariable}
                onChange={(e) => updateSwitchVariable(e.target.value)}
                placeholder="{{节点名.字段名}}"
                className="h-8 text-sm font-mono"
              />
            )}
            <p className="text-xs text-muted-foreground">
              根据此变量的值选择执行的分支
            </p>
          </div>

          {/* 匹配类型 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">匹配方式</Label>
            <Select value={matchType} onValueChange={(v) => updateMatchType(v as SwitchMatchType)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div>{type.label}</div>
                      <div className="text-xs text-muted-foreground">{type.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 大小写敏感 */}
          {matchType !== 'range' && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">区分大小写</Label>
                <p className="text-xs text-muted-foreground">
                  字符串比较时是否区分大小写
                </p>
              </div>
              <Switch
                checked={caseSensitive}
                onCheckedChange={updateCaseSensitive}
              />
            </div>
          )}

          {/* Case 列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">分支列表</Label>
              <div className="flex gap-1">
                {!hasDefaultCase && (
                  <Button variant="outline" size="sm" onClick={addDefaultCase}>
                    <Plus className="mr-1 h-3 w-3" />
                    默认分支
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={addCase}>
                  <Plus className="mr-1 h-3 w-3" />
                  添加分支
                </Button>
              </div>
            </div>

            {cases.length === 0 ? (
              <div className="border rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  暂无分支，点击上方按钮添加
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cases.map((switchCase, index) => (
                  <div
                    key={switchCase.id || `case-fallback-${index}`}
                    className={`border rounded-lg p-3 space-y-3 ${
                      switchCase.isDefault ? 'bg-muted/50 border-dashed' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <span className={`text-xs font-medium ${
                          switchCase.isDefault ? 'text-muted-foreground italic' : ''
                        }`}>
                          {switchCase.isDefault ? '默认分支' : `分支 ${index + 1}`}
                        </span>
                        <div
                          className={`w-2 h-2 rounded-full ${
                            switchCase.isDefault ? 'bg-gray-400' : 'bg-emerald-500'
                          }`}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeCase(switchCase.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">标签</Label>
                        <Input
                          value={switchCase.label}
                          onChange={(e) => updateCase(switchCase.id, { label: e.target.value })}
                          placeholder="分支名称"
                          className="h-8 text-xs"
                        />
                      </div>
                      {!switchCase.isDefault && (
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {matchType === 'range' ? '范围值' : '匹配值'}
                          </Label>
                          <Input
                            value={String(switchCase.value ?? '')}
                            onChange={(e) => {
                              const val = e.target.value
                              // Try to parse as number if it looks like one
                              const numVal = Number(val)
                              const finalVal = !isNaN(numVal) && val.trim() !== '' ? numVal : val
                              updateCase(switchCase.id, { value: finalVal })
                            }}
                            placeholder={
                              matchType === 'range' ? '如: 1-10 或 >=5' :
                              matchType === 'regex' ? '正则表达式' :
                              '匹配值'
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      )}
                    </div>

                    {switchCase.isDefault && (
                      <p className="text-xs text-muted-foreground">
                        当没有其他分支匹配时，执行此分支
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分支说明 */}
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">分支说明</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>- 按顺序依次匹配各分支条件</p>
              <p>- 匹配成功后执行对应分支，不再继续匹配</p>
              <p>- 未匹配任何分支时执行默认分支（如有）</p>
            </div>

            {matchType === 'range' && (
              <div className="mt-2 p-2 bg-muted rounded text-xs">
                <p className="font-medium mb-1">范围匹配格式:</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li><code>1-10</code> 匹配 1 到 10 的值</li>
                  <li><code>&gt;=5</code> 匹配大于等于 5</li>
                  <li><code>&lt;100</code> 匹配小于 100</li>
                </ul>
              </div>
            )}
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
