'use client'

import { DragEvent, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Code2,
  Database,
  Image,
  Video,
  Music,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface NodeType {
  type: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

// 主要节点（直接显示）
const primaryNodes: NodeType[] = [
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
    name: '文本',
    description: 'AI 文本处理，支持知识库',
    icon: Bot,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
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

// 更多节点（折叠显示）
const moreNodes: NodeType[] = [
  {
    type: 'code',
    name: '代码',
    description: 'AI 生成代码执行',
    icon: Code2,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    type: 'data',
    name: '数据',
    description: '导入 Excel/CSV 数据',
    icon: Database,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    type: 'image',
    name: '图片',
    description: '导入图片文件',
    icon: Image,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  {
    type: 'video',
    name: '视频',
    description: '导入视频或图片',
    icon: Video,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    type: 'audio',
    name: '音频',
    description: '导入音频文件',
    icon: Music,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
]

export function NodePanel() {
  const [expanded, setExpanded] = useState(false)

  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  const renderNode = (node: NodeType) => (
    <div
      key={node.type}
      className="flex cursor-grab items-center gap-2 rounded-lg border bg-card px-4 py-2 transition-colors hover:bg-muted active:cursor-grabbing"
      draggable
      onDragStart={(e) => onDragStart(e, node.type)}
      title={node.description}
    >
      <div className={`rounded-md p-1.5 ${node.bgColor} ${node.color}`}>
        <node.icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{node.name}</span>
    </div>
  )

  return (
    <div className="flex shrink-0 items-center gap-4 border-t bg-background px-6 py-3">
      <span className="text-sm font-medium text-muted-foreground">节点:</span>

      {/* 主要节点 */}
      {primaryNodes.map(renderNode)}

      {/* 更多节点按钮 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        更多
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {/* 展开的更多节点 */}
      {expanded && moreNodes.map(renderNode)}
    </div>
  )
}
