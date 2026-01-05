"use client"

import { ArrowRight, Check, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface LayoutNode {
  action: 'add'
  nodeType: string
  nodeName: string
  config?: Record<string, unknown>
}

interface LayoutPreviewProps {
  nodes: LayoutNode[]
  onConfirm: () => void
  onCancel: () => void
  className?: string
}

const NODE_TYPE_COLORS: Record<string, string> = {
  INPUT: "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
  PROCESS: "border-purple-400 bg-purple-50 dark:bg-purple-950/30",
  OUTPUT: "border-green-400 bg-green-50 dark:bg-green-950/30",
  LOGIC: "border-orange-400 bg-orange-50 dark:bg-orange-950/30",
  CONDITION: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30",
}

const NODE_TYPE_LABELS: Record<string, string> = {
  INPUT: "输入",
  PROCESS: "处理",
  OUTPUT: "输出",
  LOGIC: "逻辑",
  CONDITION: "条件",
}

export function LayoutPreview({ 
  nodes, 
  onConfirm, 
  onCancel,
  className 
}: LayoutPreviewProps) {
  if (nodes.length === 0) {
    return (
      <div className={cn("border rounded-lg bg-card p-4", className)}>
        <p className="text-sm text-muted-foreground text-center">
          没有可预览的节点
        </p>
      </div>
    )
  }

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">布局预览</span>
          <Badge variant="secondary" className="ml-auto">{nodes.length} 个节点</Badge>
        </div>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {nodes.map((node, index) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className={cn(
                  "px-3 py-2 rounded-lg border-2",
                  NODE_TYPE_COLORS[node.nodeType.toUpperCase()] || "border-gray-400 bg-gray-50"
                )}
              >
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {NODE_TYPE_LABELS[node.nodeType.toUpperCase()] || node.nodeType}
                </div>
                <div className="text-sm font-medium mt-0.5">{node.nodeName}</div>
              </div>
              
              {index < nodes.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-t bg-muted/30">
        <div className="text-xs text-muted-foreground mb-3">
          以上是根据您的需求规划的工作流节点布局。确认后将自动创建到画布中。
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            重新规划
          </Button>
          <Button size="sm" onClick={onConfirm}>
            <Check className="h-4 w-4 mr-1" />
            确认应用
          </Button>
        </div>
      </div>
    </div>
  )
}
