'use client'

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
import { X, Plus } from 'lucide-react'
import type { Condition, ConditionOperator } from '@/types/workflow'

interface ConditionNodeConfigPanelProps {
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
  { value: 'startsWith', label: '开头是', needsValue: true },
  { value: 'endsWith', label: '结尾是', needsValue: true },
  { value: 'isEmpty', label: '为空', needsValue: false },
  { value: 'isNotEmpty', label: '不为空', needsValue: false },
]

export function ConditionNodeConfigPanel({
  config,
  onUpdate,
  availableVariables = [],
}: ConditionNodeConfigPanelProps) {
  const conditions = (config?.conditions as Condition[]) || []
  const evaluationMode = (config?.evaluationMode as 'all' | 'any') || 'all'

  const addCondition = () => {
    const newCondition: Condition = {
      variable: '',
      operator: 'equals',
      value: '',
    }
    onUpdate({ ...config, conditions: [...conditions, newCondition] })
  }

  const updateCondition = (index: number, updates: Partial<Condition>) => {
    const newConditions = [...conditions]
    newConditions[index] = { ...newConditions[index], ...updates }
    onUpdate({ ...config, conditions: newConditions })
  }

  const removeCondition = (index: number) => {
    const newConditions = conditions.filter((_, i) => i !== index)
    onUpdate({ ...config, conditions: newConditions })
  }

  const updateEvaluationMode = (mode: 'all' | 'any') => {
    onUpdate({ ...config, evaluationMode: mode })
  }

  const getOperatorNeedsValue = (operator: ConditionOperator): boolean => {
    const op = OPERATORS.find(o => o.value === operator)
    return op?.needsValue ?? true
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">条件逻辑</Label>
        <Select value={evaluationMode} onValueChange={(v) => updateEvaluationMode(v as 'all' | 'any')}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部满足 (AND)</SelectItem>
            <SelectItem value="any">任一满足 (OR)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {evaluationMode === 'all' 
            ? '所有条件都为真时，执行"是"分支' 
            : '任一条件为真时，执行"是"分支'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">条件列表</Label>
          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus className="mr-1 h-3 w-3" />
            添加条件
          </Button>
        </div>

        {conditions.length === 0 ? (
          <div className="border rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              暂无条件，点击上方按钮添加
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conditions.map((condition, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    条件 {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeCondition(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">变量</Label>
                  {availableVariables.length > 0 ? (
                    <Select
                      value={condition.variable}
                      onValueChange={(v) => updateCondition(index, { variable: v })}
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
                      value={condition.variable}
                      onChange={(e) => updateCondition(index, { variable: e.target.value })}
                      placeholder="{{节点名.字段名}}"
                      className="h-8 text-xs font-mono"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">运算符</Label>
                  <Select
                    value={condition.operator}
                    onValueChange={(v) => updateCondition(index, { operator: v as ConditionOperator })}
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

                {getOperatorNeedsValue(condition.operator) && (
                  <div className="space-y-2">
                    <Label className="text-xs">比较值</Label>
                    <Input
                      value={String(condition.value ?? '')}
                      onChange={(e) => {
                        const val = e.target.value
                        const numVal = Number(val)
                        const finalVal = !isNaN(numVal) && val.trim() !== '' ? numVal : val
                        updateCondition(index, { value: finalVal })
                      }}
                      placeholder="输入比较值"
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                {index < conditions.length - 1 && (
                  <div className="pt-2 text-center">
                    <span className="text-xs px-2 py-1 bg-muted rounded">
                      {evaluationMode === 'all' ? 'AND' : 'OR'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">分支说明</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>是 (True): 条件满足</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950 rounded">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>否 (False): 条件不满足</span>
          </div>
        </div>
      </div>
    </div>
  )
}
