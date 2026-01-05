'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  GitBranch,
  GitMerge,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { LogicCondition, LogicNodeConfigData, LogicNodeMode } from '@/types/workflow'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LogicNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

const MODE_LABELS: Record<LogicNodeMode, string> = {
  condition: '条件判断',
  merge: '合并处理',
}

const MODE_OPTIONS: { value: LogicNodeMode; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: 'condition',
    label: MODE_LABELS.condition,
    icon: GitBranch,
    description: '根据表达式决定激活哪些后续分支',
  },
  {
    value: 'merge',
    label: MODE_LABELS.merge,
    icon: GitMerge,
    description: '等待所有上游节点完成后，汇总结果传递给下游',
  },
]

export function LogicNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: LogicNodeConfigPanelProps) {
  const { nodes, edges, updateNode } = useWorkflowStore()
  const [isGenerating, setIsGenerating] = useState(false)

  const logicConfig = useMemo<LogicNodeConfigData>(
    () => (config as unknown as LogicNodeConfigData) || { mode: 'condition' },
    [config]
  )
  const currentMode = logicConfig.mode || 'condition'

  const conditions: LogicCondition[] = useMemo(
    () => logicConfig.conditions || [],
    [logicConfig]
  )

  const upstreamNodes = useMemo(() => {
    const incomingEdges = edges.filter(e => e.target === nodeId)
    return incomingEdges.map(e => {
      const node = nodes.find(n => n.id === e.source)
      const nodeData = node?.data as { name?: string; type?: string; config?: Record<string, unknown> } | undefined
      return {
        id: e.source,
        name: nodeData?.name || e.source,
        type: nodeData?.type || 'unknown',
        config: nodeData?.config,
      }
    })
  }, [nodes, edges, nodeId])

  const downstreamNodes = useMemo(() => {
    const outgoingEdges = edges.filter(e => e.source === nodeId)
    return outgoingEdges.map(e => {
      const node = nodes.find(n => n.id === e.target)
      const nodeData = node?.data as { name?: string; type?: string } | undefined
      return {
        id: e.target,
        name: nodeData?.name || e.target,
        type: nodeData?.type || 'unknown',
      }
    })
  }, [nodes, edges, nodeId])

  const handleModeChange = (mode: LogicNodeMode) => {
    onUpdate({ ...logicConfig, mode })
    updateNode(nodeId, { name: MODE_LABELS[mode] })
  }

  const handleConditionChange = (index: number, updates: Partial<LogicCondition>) => {
    const next = [...conditions]
    next[index] = { ...next[index], ...updates }
    onUpdate({ ...logicConfig, conditions: next })
  }

  const handleAddCondition = () => {
    const downstreamName = downstreamNodes[conditions.length]?.name || ''
    const newCondition: LogicCondition = {
      id: `cond_${Date.now()}`,
      label: `条件 ${conditions.length + 1}`,
      expression: '',
      targetNodeNameHint: downstreamName,
    }
    onUpdate({ ...logicConfig, conditions: [...conditions, newCondition] })
  }

  const handleRemoveCondition = (index: number) => {
    const next = conditions.filter((_, i) => i !== index)
    onUpdate({ ...logicConfig, conditions: next })
  }

  const handleAIGenerate = useCallback(async () => {
    if (upstreamNodes.length === 0) {
      toast.warning('请先连接上游节点', {
        description: 'AI生成需要基于上游节点的数据结构',
      })
      return
    }
    
    setIsGenerating(true)
    try {
      const currentNode = nodes.find(n => n.id === nodeId)
      const currentNodeData = currentNode?.data as { name?: string } | undefined

      const response = await fetch('/api/ai/generate-field-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldType: 'logicConditions',
          currentContent: JSON.stringify(conditions),
          workflowContext: {
            currentNodeId: nodeId,
            currentNodeName: currentNodeData?.name,
            currentNodeType: 'LOGIC',
            mode: currentMode,
            upstreamNodes: upstreamNodes.map(n => ({
              id: n.id,
              name: n.name,
              type: n.type,
              fields: n.type === 'INPUT' 
                ? (n.config?.fields as Array<{ name: string }> || []).map(f => f.name)
                : ['output'],
            })),
            downstreamNodes: downstreamNodes.map(n => ({
              id: n.id,
              name: n.name,
              type: n.type,
            })),
          },
          availableReferences: upstreamNodes.flatMap(n => {
            if (n.type === 'INPUT') {
              const fields = n.config?.fields as Array<{ name: string }> || []
              return fields.map(f => `{{${n.name}.${f.name}}}`)
            }
            return [`{{${n.name}}}`]
          }),
        }),
      })

      if (response.ok) {
        const resData = await response.json()
        const data = resData.success ? resData.data : {}
        if (data.content) {
          try {
            const generated = JSON.parse(data.content)
            if (Array.isArray(generated)) {
              const newConditions: LogicCondition[] = generated.map((item, idx) => ({
                id: `cond_${Date.now()}_${idx}`,
                label: item.label || `条件 ${idx + 1}`,
                expression: item.expression || '',
                targetNodeNameHint: item.targetNodeNameHint || downstreamNodes[idx]?.name || '',
                description: item.description || '',
              }))
              onUpdate({ ...logicConfig, conditions: newConditions })
            }
          } catch {
            const newCondition: LogicCondition = {
              id: `cond_${Date.now()}`,
              label: '条件 1',
              expression: data.content,
              targetNodeNameHint: downstreamNodes[0]?.name || '',
            }
            onUpdate({ ...logicConfig, conditions: [newCondition] })
          }
        }
      }
    } catch (error) {
      console.error('AI generate error:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [nodeId, nodes, conditions, currentMode, upstreamNodes, downstreamNodes, logicConfig, onUpdate])

  return (
    <div className="space-y-4">
      {/* 模式选择卡片 */}
      <div className="grid grid-cols-2 gap-2">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon
          const isSelected = currentMode === option.value
          return (
            <button
              key={option.value}
              onClick={() => handleModeChange(option.value)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                  {option.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {option.description}
              </p>
            </button>
          )
        })}
      </div>

      {/* 条件判断模式的配置内容 */}
      {currentMode === 'condition' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm">条件配置</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>使用 {"{{节点名.字段}}"} 引用上游数据</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleAIGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-violet-500" />
                )}
                AI生成
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleAddCondition}
              >
                <Plus className="h-3 w-3" />
                添加
              </Button>
            </div>
          </div>

          {conditions.length === 0 ? (
            <div className="py-6 text-center border border-dashed rounded-lg bg-muted/20">
              <GitBranch className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">点击"添加"创建条件分支</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conditions.map((condition, index) => (
                <div
                  key={condition.id}
                  className="p-3 rounded-lg border bg-card space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {index + 1}
                      </span>
                      <Input
                        value={condition.label || ''}
                        onChange={(e) => handleConditionChange(index, { label: e.target.value })}
                        className="h-7 w-28 text-xs"
                        placeholder="条件名称"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveCondition(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Input
                    value={condition.expression || ''}
                    onChange={(e) => handleConditionChange(index, { expression: e.target.value })}
                    className="text-xs font-mono h-8"
                    placeholder='例如: {{上游节点.得分}} > 0.8'
                  />

                  <div className="flex gap-2">
                    <Select
                      value={condition.targetNodeNameHint || ''}
                      onValueChange={(v) => handleConditionChange(index, { targetNodeNameHint: v })}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="目标节点" />
                      </SelectTrigger>
                      <SelectContent>
                        {downstreamNodes.map((node) => (
                          <SelectItem key={node.id} value={node.name}>
                            {node.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}

              <div className="px-3 py-2 rounded-lg border border-dashed bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  默认分支：未命中条件时走最后一个下游节点
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 合并处理模式的配置内容 */}
      {currentMode === 'merge' && (
        <div className="space-y-3">
          <Label className="text-sm">合并配置</Label>
          <div className="p-3 rounded-lg border bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">
              等待所有上游节点完成后，合并结果传递给下游
            </p>
            {upstreamNodes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {upstreamNodes.map((node) => (
                  <span key={node.id} className="text-xs px-2 py-1 bg-background rounded border">
                    {node.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">请先连接上游节点</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
