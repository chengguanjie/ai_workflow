'use client'

import { DragEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Code2,
} from 'lucide-react'

const nodeTypes = [
  {
    type: 'input',
    name: '输入',
    description: '定义工作流输入字段',
    icon: ArrowDownToLine,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    type: 'process',
    name: '处理',
    description: 'AI 处理，支持知识库',
    icon: Bot,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    type: 'code',
    name: '代码',
    description: 'AI 生成代码执行',
    icon: Code2,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    type: 'output',
    name: '输出',
    description: '定义输出格式和内容',
    icon: ArrowUpFromLine,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
]

export function NodePanel() {
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex shrink-0 items-center gap-4 border-t bg-background px-6 py-3">
      <span className="text-sm font-medium text-muted-foreground">节点:</span>
      {nodeTypes.map((node) => (
        <div
          key={node.type}
          className="flex cursor-grab items-center gap-2 rounded-lg border bg-card px-4 py-2 transition-colors hover:bg-muted active:cursor-grabbing"
          draggable
          onDragStart={(e) => onDragStart(e, node.type)}
        >
          <div className={`rounded-md p-1.5 ${node.bgColor} ${node.color}`}>
            <node.icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">{node.name}</span>
        </div>
      ))}
    </div>
  )
}
