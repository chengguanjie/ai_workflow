"use client"

import { ChevronRight, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { NodeSelectionInfo } from "@/stores/ai-assistant-store"

interface NodeConfigDisplayProps {
  nodes: NodeSelectionInfo[]
  selectedNodeId?: string
  onSelectNode: (nodeId: string) => void
  className?: string
}

const NODE_TYPE_LABELS: Record<string, string> = {
  INPUT: "输入节点",
  PROCESS: "AI处理",
  OUTPUT: "输出节点",
  LOGIC: "逻辑节点",
  CONDITION: "条件判断",
}

const NODE_TYPE_COLORS: Record<string, string> = {
  INPUT: "bg-blue-500/10 text-blue-600 border-blue-200",
  PROCESS: "bg-purple-500/10 text-purple-600 border-purple-200",
  OUTPUT: "bg-green-500/10 text-green-600 border-green-200",
  LOGIC: "bg-orange-500/10 text-orange-600 border-orange-200",
  CONDITION: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
}

export function NodeConfigDisplay({ 
  nodes, 
  selectedNodeId,
  onSelectNode,
  className 
}: NodeConfigDisplayProps) {
  if (nodes.length === 0) {
    return (
      <div className={cn("border rounded-lg bg-card p-4", className)}>
        <p className="text-sm text-muted-foreground text-center">
          当前工作流没有节点
        </p>
      </div>
    )
  }

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">选择要配置的节点</span>
        </div>
      </div>

      <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
        {nodes.map((node) => (
          <button
            key={node.nodeId}
            onClick={() => onSelectNode(node.nodeId)}
            className={cn(
              "w-full p-3 rounded-lg text-left transition-all",
              "hover:bg-muted/50",
              selectedNodeId === node.nodeId && "bg-primary/5 border border-primary/30"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{node.nodeName}</p>
                  <Badge 
                    variant="outline" 
                    className={cn("shrink-0 text-[10px]", NODE_TYPE_COLORS[node.nodeType])}
                  >
                    {NODE_TYPE_LABELS[node.nodeType] || node.nodeType}
                  </Badge>
                </div>
                {node.configSummary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {node.configSummary}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

interface NodeDetailDisplayProps {
  node: NodeSelectionInfo
  config: Record<string, unknown>
  onRequestChange: (field: string) => void
  className?: string
}

export function NodeDetailDisplay({ 
  node, 
  config,
  onRequestChange,
  className 
}: NodeDetailDisplayProps) {
  const renderConfigValue = (key: string, value: unknown): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">未设置</span>
    }
    if (typeof value === 'string') {
      if (value.length > 100) {
        return <span className="text-sm">{value.slice(0, 100)}...</span>
      }
      return <span className="text-sm">{value}</span>
    }
    if (typeof value === 'boolean') {
      return <Badge variant={value ? "default" : "secondary"}>{value ? "是" : "否"}</Badge>
    }
    if (typeof value === 'number') {
      return <span className="text-sm font-mono">{value}</span>
    }
    if (Array.isArray(value)) {
      return <span className="text-sm text-muted-foreground">[{value.length} 项]</span>
    }
    return <span className="text-sm text-muted-foreground">[对象]</span>
  }

  const importantKeys = ['systemPrompt', 'userPrompt', 'model', 'temperature', 'fields']
  const sortedEntries = Object.entries(config).sort(([a], [b]) => {
    const aImportant = importantKeys.indexOf(a)
    const bImportant = importantKeys.indexOf(b)
    if (aImportant !== -1 && bImportant !== -1) return aImportant - bImportant
    if (aImportant !== -1) return -1
    if (bImportant !== -1) return 1
    return a.localeCompare(b)
  })

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={NODE_TYPE_COLORS[node.nodeType]}>
            {NODE_TYPE_LABELS[node.nodeType] || node.nodeType}
          </Badge>
          <span className="text-sm font-medium">{node.nodeName}</span>
        </div>
      </div>

      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {sortedEntries.map(([key, value]) => (
          <div 
            key={key}
            className="group p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onRequestChange(key)}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground font-mono shrink-0">{key}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                修改
              </Button>
            </div>
            <div className="mt-1">{renderConfigValue(key, value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
