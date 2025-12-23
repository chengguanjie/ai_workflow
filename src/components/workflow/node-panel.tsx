'use client'

import { DragEvent, useState, useEffect, useRef } from 'react'
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
  GitBranch,
  Repeat,
  Globe,
  GitMerge,
  Sparkles,
  Bell,
  Zap,
  Route,
} from 'lucide-react'

export interface NodeType {
  type: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

// 主要节点（直接显示）：输入、文本、输出
export const primaryNodes: NodeType[] = [
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

// 多媒体节点：代码、数据、图片、视频、音频
export const mediaNodes: NodeType[] = [
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
    description: '结构化数据输入/输出',
    icon: Database,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    type: 'image',
    name: '图片',
    description: '图片输入/输出处理',
    icon: Image,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  {
    type: 'video',
    name: '视频',
    description: '视频输入/输出处理',
    icon: Video,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    type: 'audio',
    name: '音频',
    description: '音频输入/输出处理',
    icon: Music,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
]

// 逻辑类节点：条件、循环、分支、合并
export const logicNodes: NodeType[] = [
  {
    type: 'condition',
    name: '条件',
    description: '根据条件执行不同分支',
    icon: GitBranch,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  {
    type: 'loop',
    name: '循环',
    description: '循环执行节点',
    icon: Repeat,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  {
    type: 'switch',
    name: '分支',
    description: '多路分支路由',
    icon: Route,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    type: 'merge',
    name: '合并',
    description: '合并多个分支结果',
    icon: GitMerge,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
  },
]

// 连接类节点：触发器、通知、HTTP
export const connectionNodes: NodeType[] = [
  {
    type: 'trigger',
    name: '触发器',
    description: '定义工作流触发方式',
    icon: Zap,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    type: 'notification',
    name: '通知',
    description: '发送通知消息',
    icon: Bell,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
  },
  {
    type: 'http',
    name: 'HTTP',
    description: '发送 HTTP 请求',
    icon: Globe,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
]

// 图像生成节点（保留但暂时不在面板显示）
export const imageGenNode: NodeType = {
  type: 'image_gen',
  name: '图像生成',
  description: 'AI 生成图像',
  icon: Sparkles,
  color: 'text-violet-500',
  bgColor: 'bg-violet-500/10',
}

// 兼容旧的导出名称
export const moreNodes: NodeType[] = [...mediaNodes]
export const advancedNodes: NodeType[] = [...logicNodes, ...connectionNodes]
export const mediaDataNodes: NodeType[] = [...mediaNodes]

// 合并所有更多节点（用于测试和外部引用）
export const allMoreNodes: NodeType[] = [...mediaNodes, ...logicNodes, ...connectionNodes]

// 所有节点类型（用于测试完整性验证）
export const allNodeTypes: NodeType[] = [...primaryNodes, ...mediaNodes, ...logicNodes, ...connectionNodes, imageGenNode]

import { memo } from 'react'

export const NodePanel = memo(function NodePanel() {
  const [mediaExpanded, setMediaExpanded] = useState(false)
  const [logicExpanded, setLogicExpanded] = useState(false)
  const [connectionExpanded, setConnectionExpanded] = useState(false)

  const mediaRef = useRef<HTMLDivElement>(null)
  const logicRef = useRef<HTMLDivElement>(null)
  const connectionRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mediaRef.current &&
        !mediaRef.current.contains(event.target as Node) &&
        mediaExpanded
      ) {
        setMediaExpanded(false)
      }
      if (
        logicRef.current &&
        !logicRef.current.contains(event.target as Node) &&
        logicExpanded
      ) {
        setLogicExpanded(false)
      }
      if (
        connectionRef.current &&
        !connectionRef.current.contains(event.target as Node) &&
        connectionExpanded
      ) {
        setConnectionExpanded(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mediaExpanded, logicExpanded, connectionExpanded])

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

      {/* 主要节点：输入、文本、输出 */}
      {primaryNodes.map(renderNode)}

      {/* 多媒体节点按钮 */}
      <div className="relative" ref={mediaRef}>
        <button
          onClick={() => setMediaExpanded(!mediaExpanded)}
          className="flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          多媒体
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              mediaExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
        {/* 展开的多媒体节点：代码、数据、图片、视频、音频 */}
        <div
          className={`absolute bottom-full left-0 z-10 mb-2 min-w-[160px] rounded-lg border bg-background p-2 shadow-lg transition-all duration-200 ease-out ${
            mediaExpanded
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0'
          }`}
        >
          <div className="flex flex-col gap-2">
            {mediaNodes.map(renderNode)}
          </div>
        </div>
      </div>

      {/* 逻辑类节点按钮 */}
      <div className="relative" ref={logicRef}>
        <button
          onClick={() => setLogicExpanded(!logicExpanded)}
          className="flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          逻辑类
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              logicExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
        {/* 展开的逻辑类节点：条件、循环、分支、合并 */}
        <div
          className={`absolute bottom-full left-0 z-10 mb-2 min-w-[160px] rounded-lg border bg-background p-2 shadow-lg transition-all duration-200 ease-out ${
            logicExpanded
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0'
          }`}
        >
          <div className="flex flex-col gap-2">
            {logicNodes.map(renderNode)}
          </div>
        </div>
      </div>

      {/* 连接类节点按钮 */}
      <div className="relative" ref={connectionRef}>
        <button
          onClick={() => setConnectionExpanded(!connectionExpanded)}
          className="flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          连接类
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              connectionExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
        {/* 展开的连接类节点：触发器、通知、HTTP */}
        <div
          className={`absolute bottom-full left-0 z-10 mb-2 min-w-[160px] rounded-lg border bg-background p-2 shadow-lg transition-all duration-200 ease-out ${
            connectionExpanded
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0'
          }`}
        >
          <div className="flex flex-col gap-2">
            {connectionNodes.map(renderNode)}
          </div>
        </div>
      </div>
    </div>
  )
})
