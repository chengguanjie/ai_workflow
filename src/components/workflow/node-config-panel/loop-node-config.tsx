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
import { Repeat, ListOrdered, RefreshCcw } from 'lucide-react'
import { OutputTabContent } from './shared/output-tab-content'
import type { ConditionOperator, LoopType } from '@/types/workflow'

type LoopTabType = 'config' | 'output'

interface LoopNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
  availableVariables?: Array<{ label: string; value: string }>
}

const OPERATORS: { value: ConditionOperator; label: string; needsValue: boolean }[] = [
  { value: 'equals', label: '等于 (==)', needsValue: true },
  { value: 'notEquals', label: '不等于 (!=)', needsValue: true },
  { value: 'greaterThan', label: '大于 (>)', needsValue: true },
  { value: 'lessThan', label: '小于 (<)', needsValue: true },
  { value: 'greaterOrEqual', label: '大于等于 (>=)', needsValue: true },
  { value: 'lessOrEqual', label: '小于等于 (<=)', needsValue: true },
  { value: 'contains', label: '包含', needsValue: true },
  { value: 'notContains', label: '不包含', needsValue: true },
  { value: 'isEmpty', label: '为空', needsValue: false },
  { value: 'isNotEmpty', label: '不为空', needsValue: false },
]

export function LoopNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
  availableVariables = [],
}: LoopNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<LoopTabType>('config')
  const loopType = (config?.loopType as LoopType) || 'FOR'

  // Tab 配置
  const tabs: { key: LoopTabType; label: string }[] = [
    { key: 'config', label: '配置' },
    { key: 'output', label: '输出' },
  ]
  const forConfig = (config?.forConfig as Record<string, unknown>) || {
    arrayVariable: '',
    itemName: 'item',
    indexName: 'index',
  }
  const whileConfig = (config?.whileConfig as Record<string, unknown>) || {
    condition: { variable: '', operator: 'lessThan', value: 10 },
    maxIterations: 100,
  }
  const maxIterations = (config?.maxIterations as number) || 1000
  const continueOnError = (config?.continueOnError as boolean) || false

  const updateLoopType = (type: LoopType) => {
    onUpdate({ ...config, loopType: type })
  }

  const updateForConfig = (updates: Record<string, unknown>) => {
    onUpdate({
      ...config,
      forConfig: { ...forConfig, ...updates },
    })
  }

  const updateWhileConfig = (updates: Record<string, unknown>) => {
    onUpdate({
      ...config,
      whileConfig: { ...whileConfig, ...updates },
    })
  }

  const updateWhileCondition = (updates: Record<string, unknown>) => {
    const currentCondition = (whileConfig.condition as Record<string, unknown>) || {}
    updateWhileConfig({
      condition: { ...currentCondition, ...updates },
    })
  }

  const getOperatorNeedsValue = (operator: ConditionOperator): boolean => {
    const op = OPERATORS.find(o => o.value === operator)
    return op?.needsValue ?? true
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">循环类型</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={loopType === 'FOR' ? 'default' : 'outline'}
                size="sm"
                className="flex items-center gap-2"
                onClick={() => updateLoopType('FOR')}
              >
                <ListOrdered className="h-4 w-4" />
                FOR 循环
              </Button>
              <Button
                variant={loopType === 'WHILE' ? 'default' : 'outline'}
                size="sm"
                className="flex items-center gap-2"
                onClick={() => updateLoopType('WHILE')}
              >
                <RefreshCcw className="h-4 w-4" />
                WHILE 循环
              </Button>
            </div>
          </div>

          {loopType === 'FOR' && (
            <div className="space-y-4 border rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <ListOrdered className="h-4 w-4" />
                FOR 循环配置
              </div>

              <div className="space-y-2">
                <Label className="text-xs">数组变量</Label>
                {availableVariables.length > 0 ? (
                  <Select
                    value={forConfig.arrayVariable as string}
                    onValueChange={(v) => updateForConfig({ arrayVariable: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择数组变量" />
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
                    value={forConfig.arrayVariable as string}
                    onChange={(e) => updateForConfig({ arrayVariable: e.target.value })}
                    placeholder="{{节点名.数组字段}}"
                    className="h-8 text-xs font-mono"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  要遍历的数组，如 {"{{data.items}}"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">当前项变量名</Label>
                  <Input
                    value={forConfig.itemName as string}
                    onChange={(e) => updateForConfig({ itemName: e.target.value })}
                    placeholder="item"
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    访问: {"{{loop.item}}"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">索引变量名</Label>
                  <Input
                    value={forConfig.indexName as string}
                    onChange={(e) => updateForConfig({ indexName: e.target.value })}
                    placeholder="index"
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    访问: {"{{loop.index}}"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loopType === 'WHILE' && (
            <div className="space-y-4 border rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <RefreshCcw className="h-4 w-4" />
                WHILE 循环配置
              </div>

              <div className="space-y-2">
                <Label className="text-xs">条件变量</Label>
                {availableVariables.length > 0 ? (
                  <Select
                    value={(whileConfig.condition as Record<string, unknown>)?.variable as string || ''}
                    onValueChange={(v) => updateWhileCondition({ variable: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择变量" />
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
                    value={(whileConfig.condition as Record<string, unknown>)?.variable as string || ''}
                    onChange={(e) => updateWhileCondition({ variable: e.target.value })}
                    placeholder="{{节点名.字段名}}"
                    className="h-8 text-xs font-mono"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">运算符</Label>
                <Select
                  value={(whileConfig.condition as Record<string, unknown>)?.operator as string || 'lessThan'}
                  onValueChange={(v) => updateWhileCondition({ operator: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {getOperatorNeedsValue((whileConfig.condition as Record<string, unknown>)?.operator as ConditionOperator || 'lessThan') && (
                <div className="space-y-2">
                  <Label className="text-xs">比较值</Label>
                  <Input
                    value={String((whileConfig.condition as Record<string, unknown>)?.value ?? '')}
                    onChange={(e) => {
                      const val = e.target.value
                      const numVal = Number(val)
                      const finalVal = !isNaN(numVal) && val.trim() !== '' ? numVal : val
                      updateWhileCondition({ value: finalVal })
                    }}
                    placeholder="输入比较值"
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">最大迭代次数</Label>
                <Input
                  type="number"
                  value={whileConfig.maxIterations as number || 100}
                  onChange={(e) => updateWhileConfig({ maxIterations: parseInt(e.target.value) || 100 })}
                  min={1}
                  max={10000}
                  className="h-8 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  防止无限循环，达到此次数将强制停止
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4 border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Repeat className="h-4 w-4" />
              通用配置
            </div>

            <div className="space-y-2">
              <Label className="text-xs">全局最大迭代次数</Label>
              <Input
                type="number"
                value={maxIterations}
                onChange={(e) => onUpdate({ ...config, maxIterations: parseInt(e.target.value) || 1000 })}
                min={1}
                max={100000}
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground">
                适用于所有循环类型的安全限制
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">出错时继续</Label>
                <p className="text-xs text-muted-foreground">
                  循环体内出错时是否继续下一次迭代
                </p>
              </div>
              <Button
                variant={continueOnError ? 'default' : 'outline'}
                size="sm"
                onClick={() => onUpdate({ ...config, continueOnError: !continueOnError })}
              >
                {continueOnError ? '是' : '否'}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">连接端口说明</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>循环体 (Body): 每次迭代执行</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>完成 (Done): 循环结束后执行</span>
              </div>
            </div>
            <div className="mt-2 p-2 bg-muted rounded text-xs">
              <p><strong>循环变量:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>{"{{loop.index}}"} - 当前索引 (从0开始)</li>
                <li>{"{{loop.iteration}}"} - 当前迭代次数 (从1开始)</li>
                <li>{"{{loop.item}}"} - 当前项 (仅FOR循环)</li>
                <li>{"{{loop.isFirst}}"} - 是否第一次迭代</li>
                <li>{"{{loop.isLast}}"} - 是否最后一次迭代</li>
              </ul>
            </div>
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
