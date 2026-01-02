'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  GitBranch,
  Layers,
  GitMerge,
  ArrowRightLeft,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  Info,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { LogicCondition, LogicNodeConfigData, LogicNodeMode } from '@/types/workflow'
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

type LogicTabType = 'mode' | 'conditions' | 'help'

const MODE_OPTIONS: { value: LogicNodeMode; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: 'condition',
    label: '条件判断',
    icon: GitBranch,
    description: '根据表达式决定激活哪些后续分支',
  },
  {
    value: 'split',
    label: '并行拆分',
    icon: Layers,
    description: '同时激活所有后续分支，适合并行处理',
  },
  {
    value: 'merge',
    label: '结果合并',
    icon: GitMerge,
    description: '汇总多个上游节点的输出',
  },
  {
    value: 'switch',
    label: '分支选择',
    icon: ArrowRightLeft,
    description: '基于变量值在多个分支中选择其一',
  },
]

export function LogicNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: LogicNodeConfigPanelProps) {
  const { nodes, edges } = useWorkflowStore()
  const [activeTab, setActiveTab] = useState<LogicTabType>('mode')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showExamples, setShowExamples] = useState(false)

  const logicConfig = useMemo<LogicNodeConfigData>(
    () => (config as unknown as LogicNodeConfigData) || { mode: 'condition' },
    [config]
  )
  const currentMode = logicConfig.mode || 'condition'

  const conditions: LogicCondition[] = useMemo(
    () => logicConfig.conditions || [],
    [logicConfig]
  )

  const currentModeOption = MODE_OPTIONS.find(m => m.value === currentMode) || MODE_OPTIONS[0]
  const ModeIcon = currentModeOption.icon

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

  const tabs: { key: LogicTabType; label: string; badge?: number }[] = [
    { key: 'mode', label: '逻辑模式' },
    { key: 'conditions', label: '条件配置', badge: conditions.length || undefined },
    { key: 'help', label: '使用帮助' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'mode' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>选择逻辑模式</Label>
            <Select
              value={currentMode}
              onValueChange={(value) => handleModeChange(value as LogicNodeMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择逻辑模式" />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ModeIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">{currentModeOption.label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{currentModeOption.description}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">连接关系</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-xs font-medium text-muted-foreground mb-2">上游节点</div>
                {upstreamNodes.length === 0 ? (
                  <div className="text-xs text-muted-foreground/60">无上游连接</div>
                ) : (
                  <div className="space-y-1">
                    {upstreamNodes.map((node) => (
                      <div key={node.id} className="text-xs px-2 py-1 bg-background rounded border">
                        {node.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-xs font-medium text-muted-foreground mb-2">下游节点</div>
                {downstreamNodes.length === 0 ? (
                  <div className="text-xs text-muted-foreground/60">无下游连接</div>
                ) : (
                  <div className="space-y-1">
                    {downstreamNodes.map((node) => (
                      <div key={node.id} className="text-xs px-2 py-1 bg-background rounded border">
                        {node.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'conditions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label>条件列表</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>使用 {"{{节点名.字段}}"} 引用上游数据，支持 JavaScript 表达式</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleAIGenerate}
                disabled={isGenerating || upstreamNodes.length === 0}
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-violet-500" />
                )}
                AI 智能生成
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleAddCondition}
              >
                <Plus className="h-3 w-3" />
                新增
              </Button>
            </div>
          </div>

          {currentMode === 'condition' && (
            <>
              {conditions.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed rounded-lg">
                  <GitBranch className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">暂无条件配置</p>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={handleAIGenerate}
                      disabled={isGenerating || upstreamNodes.length === 0}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-violet-500" />
                      )}
                      AI 智能生成
                    </Button>
                    <span className="text-xs text-muted-foreground">或</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={handleAddCondition}
                    >
                      <Plus className="h-3 w-3" />
                      手动添加
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {conditions.map((condition, index) => (
                    <div
                      key={condition.id}
                      className="p-3 rounded-lg border bg-card space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {index + 1}
                          </span>
                          <Input
                            value={condition.label || ''}
                            onChange={(e) => handleConditionChange(index, { label: e.target.value })}
                            className="h-7 w-32 text-xs"
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

                      <div className="space-y-2">
                        <Label className="text-xs">条件表达式</Label>
                        <Input
                          value={condition.expression || ''}
                          onChange={(e) => handleConditionChange(index, { expression: e.target.value })}
                          className="text-xs font-mono"
                          placeholder='例如: {{上游节点.得分}} > 0.8'
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">目标节点（可选）</Label>
                          <Select
                            value={condition.targetNodeNameHint || ''}
                            onValueChange={(v) => handleConditionChange(index, { targetNodeNameHint: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="选择目标节点" />
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
                        <div className="space-y-1.5">
                          <Label className="text-xs">描述（可选）</Label>
                          <Input
                            value={condition.description || ''}
                            onChange={(e) => handleConditionChange(index, { description: e.target.value })}
                            className="h-8 text-xs"
                            placeholder="简要描述"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="p-3 rounded-lg border border-dashed bg-muted/20">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Info className="h-3.5 w-3.5" />
                      <span>默认分支：未命中以上条件时，走最后一个下游节点</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {currentMode === 'split' && (
            <div className="p-4 rounded-lg border bg-muted/20">
              <div className="flex items-start gap-3">
                <Layers className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium">并行拆分模式</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    此模式下所有下游分支将同时被激活执行，无需配置条件。
                  </p>
                  {downstreamNodes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium">将并行执行以下节点：</p>
                      <div className="flex flex-wrap gap-1.5">
                        {downstreamNodes.map((node) => (
                          <span key={node.id} className="text-xs px-2 py-1 bg-background rounded border">
                            {node.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentMode === 'merge' && (
            <div className="p-4 rounded-lg border bg-muted/20">
              <div className="flex items-start gap-3">
                <GitMerge className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium">结果合并模式</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    此模式下将等待所有上游分支执行完成后，合并结果供后续节点使用。
                  </p>
                  {upstreamNodes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium">将合并以下节点的输出：</p>
                      <div className="flex flex-wrap gap-1.5">
                        {upstreamNodes.map((node) => (
                          <span key={node.id} className="text-xs px-2 py-1 bg-background rounded border">
                            {node.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentMode === 'switch' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border bg-muted/20">
                <div className="flex items-start gap-3">
                  <ArrowRightLeft className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium">分支选择模式</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      根据指定变量的值，选择唯一的一个分支执行。
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">输入变量</Label>
                <Input
                  value={logicConfig.switchInput || ''}
                  onChange={(e) => onUpdate({ ...logicConfig, switchInput: e.target.value })}
                  className="text-xs font-mono"
                  placeholder='例如: {{上游节点.类型}}'
                />
                <p className="text-xs text-muted-foreground">
                  指定用于判断的变量，其值将与各分支的标签进行匹配
                </p>
              </div>

              {conditions.length === 0 ? (
                <div className="py-6 text-center border-2 border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">添加分支选项</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={handleAddCondition}
                  >
                    <Plus className="h-3 w-3" />
                    添加分支
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {conditions.map((condition, index) => (
                    <div
                      key={condition.id}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                    >
                      <span className="text-xs text-muted-foreground w-8">#{index + 1}</span>
                      <Input
                        value={condition.label || ''}
                        onChange={(e) => handleConditionChange(index, { label: e.target.value })}
                        className="h-7 flex-1 text-xs"
                        placeholder="分支值（如：wechat）"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Select
                        value={condition.targetNodeNameHint || ''}
                        onValueChange={(v) => handleConditionChange(index, { targetNodeNameHint: v })}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveCondition(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'help' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border bg-muted/20">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium">快速开始</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  逻辑节点用于控制工作流的执行路径，支持条件分支、并行执行和结果合并等场景。
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
              onClick={() => setShowExamples(!showExamples)}
            >
              <span className="text-sm font-medium">表达式示例</span>
              {showExamples ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showExamples && (
              <div className="space-y-2 pl-2">
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs font-medium mb-1.5">数值比较</p>
                  <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    {'{{评分节点.得分}} > 0.8'}
                  </code>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs font-medium mb-1.5">字符串匹配</p>
                  <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    {'{{分类节点.类型}} === "图片"'}
                  </code>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs font-medium mb-1.5">包含判断</p>
                  <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    {'{{输入节点.内容}}.includes("关键词")'}
                  </code>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs font-medium mb-1.5">逻辑组合</p>
                  <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    {'{{A.x}} > 5 && {{B.y}} !== "error"'}
                  </code>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">可用引用</h4>
            {upstreamNodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">请先连接上游节点</p>
            ) : (
              <div className="space-y-1.5">
                {upstreamNodes.map((node) => (
                  <div key={node.id} className="p-2 rounded-lg border bg-card">
                    <p className="text-xs font-medium mb-1">{node.name}</p>
                    <div className="flex flex-wrap gap-1">
                      {node.type === 'INPUT' ? (
                        ((node.config?.fields as Array<{ name: string }>) || []).map((field, idx) => (
                          <code
                            key={idx}
                            className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20"
                            onClick={() => navigator.clipboard.writeText(`{{${node.name}.${field.name}}}`)}
                            title="点击复制"
                          >
                            {`{{${node.name}.${field.name}}}`}
                          </code>
                        ))
                      ) : (
                        <code
                          className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20"
                          onClick={() => navigator.clipboard.writeText(`{{${node.name}}}`)}
                          title="点击复制"
                        >
                          {`{{${node.name}}}`}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
