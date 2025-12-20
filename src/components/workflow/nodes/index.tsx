'use client'

import React, { memo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Code2,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
  Database,
  Image,
  Video,
  Music,
  Bug,
  GitBranch,
  Repeat,
  Globe,
  GitMerge,
  Sparkles,
  Bell,
  Zap,
  Route,
  Group,
  Ungroup,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { InputField, KnowledgeItem } from '@/types/workflow'

export const nodeStyles: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  trigger: { icon: Zap, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  input: { icon: ArrowDownToLine, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  process: { icon: Bot, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  code: { icon: Code2, color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
  output: { icon: ArrowUpFromLine, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
  data: { icon: Database, color: 'text-cyan-600', bgColor: 'bg-cyan-50 border-cyan-200' },
  image: { icon: Image, color: 'text-pink-600', bgColor: 'bg-pink-50 border-pink-200' },
  video: { icon: Video, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
  audio: { icon: Music, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  // Advanced nodes
  condition: { icon: GitBranch, color: 'text-yellow-600', bgColor: 'bg-yellow-50 border-yellow-200' },
  loop: { icon: Repeat, color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200' },
  switch: { icon: Route, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200' },
  http: { icon: Globe, color: 'text-teal-600', bgColor: 'bg-teal-50 border-teal-200' },
  merge: { icon: GitMerge, color: 'text-slate-600', bgColor: 'bg-slate-50 border-slate-200' },
  image_gen: { icon: Sparkles, color: 'text-violet-600', bgColor: 'bg-violet-50 border-violet-200' },
  notification: { icon: Bell, color: 'text-rose-600', bgColor: 'bg-rose-50 border-rose-200' },
  // Group node
  group: { icon: Group, color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-300' },
}

interface NodeData {
  name: string
  type: string
  config?: {
    fields?: InputField[]
    knowledgeItems?: KnowledgeItem[]
    prompt?: string
    userPrompt?: string
    format?: string
    mode?: 'input' | 'output'
  }
  [key: string]: unknown // Index signature for compatibility
}

type ExecutionStatus = 'idle' | 'running' | 'success' | 'error'

function BaseNode({ data, selected, id }: NodeProps & { data: NodeData }) {
  const style = nodeStyles[data.type.toLowerCase()] || nodeStyles.input
  const Icon = style.icon
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { deleteNode, duplicateNode, openDebugPanel, groupNodes, nodes } = useWorkflowStore()

  // 获取当前选中的节点数量
  const selectedNodes = nodes.filter((n) => n.selected)
  const hasMultipleSelected = selectedNodes.length >= 2

  // 点击外部关闭菜单
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    // 使用 setTimeout 确保监听器在下一个事件循环中添加，避免被当前事件立即触发
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleDuplicate = () => {
    duplicateNode(id)
    setContextMenu(null)
  }

  const handleDelete = () => {
    deleteNode(id)
    setContextMenu(null)
  }

  const handleDebug = () => {
    openDebugPanel(id)
    setContextMenu(null)
  }

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id)
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds)
    }
    setContextMenu(null)
  }

  const handleExecute = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (executionStatus === 'running') return

    setExecutionStatus('running')

    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() > 0.2) {
            resolve(true)
          } else {
            reject(new Error('执行失败'))
          }
        }, 1500)
      })

      setExecutionStatus('success')
      setTimeout(() => setExecutionStatus('idle'), 3000)
    } catch {
      setExecutionStatus('error')
      setTimeout(() => setExecutionStatus('idle'), 3000)
    }
  }

  const getStatusIcon = () => {
    switch (executionStatus) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin" />
      case 'success':
        return <CheckCircle2 className="h-3 w-3 text-green-600" />
      case 'error':
        return <XCircle className="h-3 w-3 text-red-600" />
      default:
        return <Play className="h-3 w-3" />
    }
  }

  const getStatusTooltip = () => {
    switch (executionStatus) {
      case 'running':
        return '执行中...'
      case 'success':
        return '执行成功'
      case 'error':
        return '执行失败'
      default:
        return '执行此节点'
    }
  }

  // 获取节点摘要信息
  const getSummary = () => {
    const config = data.config
    if (!config) return null

    switch (data.type.toLowerCase()) {
      case 'trigger': {
        const triggerType = (config as { triggerType?: string }).triggerType
        const triggerLabels: Record<string, string> = {
          MANUAL: '手动触发',
          WEBHOOK: 'Webhook',
          SCHEDULE: '定时任务',
        }
        return triggerLabels[triggerType || 'MANUAL'] || '手动触发'
      }
      case 'input':
        if (config.fields && config.fields.length > 0) {
          return `${config.fields.length} 个输入字段`
        }
        return null
      case 'process':
        if (config.knowledgeItems && config.knowledgeItems.length > 0) {
          return `${config.knowledgeItems.length} 个知识库`
        }
        return null
      case 'code':
        if (config.prompt) {
          return config.prompt.slice(0, 20) + (config.prompt.length > 20 ? '...' : '')
        }
        return null
      case 'output':
        if (config.format) {
          const formatLabels: Record<string, string> = {
            text: '文本',
            json: 'JSON',
            word: 'Word',
            excel: 'Excel',
            image: '图片',
          }
          return `输出: ${formatLabels[config.format] || config.format}`
        }
        return null
      default:
        return null
    }
  }

  const summary = getSummary()

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'min-w-[180px] rounded-lg border-2 shadow-sm transition-shadow',
          style.bgColor,
          selected && data.type.toLowerCase() !== 'input' && data.type.toLowerCase() !== 'output' && 'ring-2 ring-primary ring-offset-2'
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 输入连接点 - 触发器和输入节点没有输入连接点 */}
        {data.type.toLowerCase() !== 'input' && data.type.toLowerCase() !== 'trigger' && (
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
          />
        )}

        {/* 节点内容 */}
        <div className="flex items-center gap-3 p-3">
          <div className={cn('rounded-md bg-white/80 p-2', style.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              {getTypeLabel(data.type)}
            </p>
          </div>

          {/* 执行按钮 - 触发器和输入节点不显示 */}
          {data.type.toLowerCase() !== 'input' && data.type.toLowerCase() !== 'trigger' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0',
                    executionStatus === 'running' && 'cursor-not-allowed opacity-70',
                    executionStatus === 'success' && 'bg-green-100',
                    executionStatus === 'error' && 'bg-red-100'
                  )}
                  onClick={handleExecute}
                  disabled={executionStatus === 'running'}
                >
                  {getStatusIcon()}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{getStatusTooltip()}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 摘要信息 */}
        {summary && (
          <div className="border-t border-current/10 px-3 py-2">
            <p className="text-xs text-muted-foreground truncate">
              {summary}
            </p>
          </div>
        )}

        {/* 输出连接点 */}
        {data.type.toLowerCase() !== 'output' && (
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
          />
        )}

        {/* 右键菜单 - 使用 Portal 渲染到 body */}
        {contextMenu && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            className="min-w-[100px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDebug}
            >
              <Bug className="h-4 w-4" />
              调试
            </button>
            {hasMultipleSelected && (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={handleGroup}
              >
                <Group className="h-4 w-4" />
                组合
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4" />
              复制
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>,
          document.body
        )}
      </div>
    </TooltipProvider>
  )
}

export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    TRIGGER: '触发器',
    INPUT: '输入节点',
    PROCESS: '处理节点',
    CODE: '代码节点',
    OUTPUT: '输出节点',
    DATA: '数据节点',
    IMAGE: '图片节点',
    VIDEO: '视频节点',
    AUDIO: '音频节点',
    // Advanced nodes
    CONDITION: '条件节点',
    LOOP: '循环节点',
    SWITCH: '分支节点',
    HTTP: 'HTTP 节点',
    MERGE: '合并节点',
    IMAGE_GEN: '图像生成',
    NOTIFICATION: '通知节点',
    // Group node
    GROUP: '节点组',
  }
  return labels[type.toUpperCase()] || type
}

// 导出自定义节点类型
export const TriggerNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
TriggerNode.displayName = 'TriggerNode'

export const InputNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
InputNode.displayName = 'InputNode'

export const ProcessNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
ProcessNode.displayName = 'ProcessNode'

export const CodeNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
CodeNode.displayName = 'CodeNode'

export const OutputNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
OutputNode.displayName = 'OutputNode'

export const DataNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
DataNode.displayName = 'DataNode'

export const ImageNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
ImageNode.displayName = 'ImageNode'

export const VideoNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
VideoNode.displayName = 'VideoNode'

export const AudioNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
AudioNode.displayName = 'AudioNode'

// Advanced node components
export const LoopNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
LoopNode.displayName = 'LoopNode'

export const HttpNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
HttpNode.displayName = 'HttpNode'

export const MergeNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
MergeNode.displayName = 'MergeNode'

export const ImageGenNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
ImageGenNode.displayName = 'ImageGenNode'

export const NotificationNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
NotificationNode.displayName = 'NotificationNode'

// Condition node with dual output handles (true/false branches)
function ConditionNodeBase({ data, selected, id }: NodeProps & { data: NodeData }) {
  const style = nodeStyles.condition
  const Icon = style.icon
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { deleteNode, duplicateNode, openDebugPanel, groupNodes, nodes } = useWorkflowStore()

  const selectedNodes = nodes.filter((n) => n.selected)
  const hasMultipleSelected = selectedNodes.length >= 2

  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleDuplicate = () => {
    duplicateNode(id)
    setContextMenu(null)
  }

  const handleDelete = () => {
    deleteNode(id)
    setContextMenu(null)
  }

  const handleDebug = () => {
    openDebugPanel(id)
    setContextMenu(null)
  }

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id)
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds)
    }
    setContextMenu(null)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'min-w-[180px] rounded-lg border-2 shadow-sm transition-shadow',
          style.bgColor,
          selected && 'ring-2 ring-primary ring-offset-2'
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 输入连接点 */}
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        />

        {/* 节点内容 */}
        <div className="flex items-center gap-3 p-3">
          <div className={cn('rounded-md bg-white/80 p-2', style.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              {getTypeLabel(data.type)}
            </p>
          </div>
        </div>

        {/* 分支标签 */}
        <div className="border-t border-current/10 px-3 py-2">
          <div className="flex justify-between text-xs">
            <span className="text-green-600 font-medium">✓ True</span>
            <span className="text-red-600 font-medium">✗ False</span>
          </div>
        </div>

        {/* 双输出连接点 - true/false 分支 */}
        <Handle
          type="source"
          position={Position.Right}
          id="true"
          style={{ top: '30%' }}
          className="!h-3 !w-3 !border-2 !border-background !bg-green-500"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="false"
          style={{ top: '70%' }}
          className="!h-3 !w-3 !border-2 !border-background !bg-red-500"
        />

        {/* 右键菜单 */}
        {contextMenu && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            className="min-w-[100px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDebug}
            >
              <Bug className="h-4 w-4" />
              调试
            </button>
            {hasMultipleSelected && (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={handleGroup}
              >
                <Group className="h-4 w-4" />
                组合
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4" />
              复制
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>,
          document.body
        )}
      </div>
    </TooltipProvider>
  )
}

export const ConditionNode = memo((props: NodeProps) => <ConditionNodeBase {...props} data={props.data as NodeData} />)
ConditionNode.displayName = 'ConditionNode'

// Switch node with multiple output handles (one per case)
interface SwitchCase {
  id: string
  label: string
  value: string | number | boolean
  isDefault?: boolean
}

function SwitchNodeBase({ data, selected, id }: NodeProps & { data: NodeData }) {
  const style = nodeStyles.switch
  const Icon = style.icon
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { deleteNode, duplicateNode, openDebugPanel, groupNodes, nodes } = useWorkflowStore()

  const selectedNodes = nodes.filter((n) => n.selected)
  const hasMultipleSelected = selectedNodes.length >= 2

  // Get cases from config, provide default cases if not configured
  const cases: SwitchCase[] = (data.config as { cases?: SwitchCase[] })?.cases || [
    { id: 'case-1', label: 'Case 1', value: 'value1' },
    { id: 'default', label: 'Default', value: '', isDefault: true },
  ]

  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleDuplicate = () => {
    duplicateNode(id)
    setContextMenu(null)
  }

  const handleDelete = () => {
    deleteNode(id)
    setContextMenu(null)
  }

  const handleDebug = () => {
    openDebugPanel(id)
    setContextMenu(null)
  }

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id)
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds)
    }
    setContextMenu(null)
  }

  // Calculate handle positions based on number of cases
  const getHandlePosition = (index: number, total: number): string => {
    const startPercent = 25
    const endPercent = 75
    const range = endPercent - startPercent
    const step = total > 1 ? range / (total - 1) : 0
    return `${startPercent + step * index}%`
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'min-w-[180px] rounded-lg border-2 shadow-sm transition-shadow',
          style.bgColor,
          selected && 'ring-2 ring-primary ring-offset-2'
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 输入连接点 */}
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        />

        {/* 节点内容 */}
        <div className="flex items-center gap-3 p-3">
          <div className={cn('rounded-md bg-white/80 p-2', style.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              {getTypeLabel(data.type)}
            </p>
          </div>
        </div>

        {/* 分支标签列表 */}
        <div className="border-t border-current/10 px-3 py-2">
          <div className="flex flex-col gap-1 text-xs">
            {cases.slice(0, 4).map((c, idx) => (
              <div key={c.id || `case-${idx}`} className="flex items-center gap-1">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    c.isDefault ? 'bg-gray-400' : 'bg-emerald-500'
                  )}
                />
                <span className={cn(
                  'truncate',
                  c.isDefault ? 'text-muted-foreground italic' : 'font-medium'
                )}>
                  {c.label}
                </span>
              </div>
            ))}
            {cases.length > 4 && (
              <span className="text-muted-foreground">+{cases.length - 4} more...</span>
            )}
          </div>
        </div>

        {/* 多输出连接点 - 每个 case 一个 */}
        {cases.map((c, index) => (
          <Handle
            key={c.id}
            type="source"
            position={Position.Right}
            id={c.id}
            style={{ top: getHandlePosition(index, cases.length) }}
            className={cn(
              '!h-3 !w-3 !border-2 !border-background',
              c.isDefault ? '!bg-gray-400' : '!bg-emerald-500'
            )}
          />
        ))}

        {/* 右键菜单 */}
        {contextMenu && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            className="min-w-[100px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDebug}
            >
              <Bug className="h-4 w-4" />
              调试
            </button>
            {hasMultipleSelected && (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={handleGroup}
              >
                <Group className="h-4 w-4" />
                组合
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4" />
              复制
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>,
          document.body
        )}
      </div>
    </TooltipProvider>
  )
}

export const SwitchNode = memo((props: NodeProps) => <SwitchNodeBase {...props} data={props.data as NodeData} />)
SwitchNode.displayName = 'SwitchNode'

// Media/Data node with mode indicator (input/output)
function MediaDataNodeBase({ data, selected, id }: NodeProps & { data: NodeData }) {
  const style = nodeStyles[data.type.toLowerCase()] || nodeStyles.data
  const Icon = style.icon
  const mode = data.config?.mode || 'input'
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { deleteNode, duplicateNode, openDebugPanel, groupNodes, nodes } = useWorkflowStore()

  const selectedNodes = nodes.filter((n) => n.selected)
  const hasMultipleSelected = selectedNodes.length >= 2

  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleDuplicate = () => {
    duplicateNode(id)
    setContextMenu(null)
  }

  const handleDelete = () => {
    deleteNode(id)
    setContextMenu(null)
  }

  const handleDebug = () => {
    openDebugPanel(id)
    setContextMenu(null)
  }

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id)
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds)
    }
    setContextMenu(null)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'min-w-[180px] rounded-lg border-2 shadow-sm transition-shadow',
          style.bgColor,
          selected && 'ring-2 ring-primary ring-offset-2'
        )}
        onContextMenu={handleContextMenu}
        data-testid={`media-data-node-${data.type.toLowerCase()}`}
      >
        {/* 输入连接点 */}
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        />

        {/* 节点内容 */}
        <div className="flex items-center gap-3 p-3">
          <div className={cn('rounded-md bg-white/80 p-2', style.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              {getTypeLabel(data.type)}
            </p>
          </div>
        </div>

        {/* 模式指示器 */}
        <div className="border-t border-current/10 px-3 py-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              mode === 'input'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            )}
            data-testid="mode-indicator"
          >
            {mode === 'input' ? '输入' : '输出'}
          </span>
        </div>

        {/* 输出连接点 */}
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        />

        {/* 右键菜单 */}
        {contextMenu && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            className="min-w-[100px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDebug}
            >
              <Bug className="h-4 w-4" />
              调试
            </button>
            {hasMultipleSelected && (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={handleGroup}
              >
                <Group className="h-4 w-4" />
                组合
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4" />
              复制
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>,
          document.body
        )}
      </div>
    </TooltipProvider>
  )
}

// Media/Data node exports with mode indicator
export const MediaDataImageNode = memo((props: NodeProps) => <MediaDataNodeBase {...props} data={props.data as NodeData} />)
MediaDataImageNode.displayName = 'MediaDataImageNode'

export const MediaDataAudioNode = memo((props: NodeProps) => <MediaDataNodeBase {...props} data={props.data as NodeData} />)
MediaDataAudioNode.displayName = 'MediaDataAudioNode'

export const MediaDataVideoNode = memo((props: NodeProps) => <MediaDataNodeBase {...props} data={props.data as NodeData} />)
MediaDataVideoNode.displayName = 'MediaDataVideoNode'

export const MediaDataDataNode = memo((props: NodeProps) => <MediaDataNodeBase {...props} data={props.data as NodeData} />)
MediaDataDataNode.displayName = 'MediaDataDataNode'

// Group node component - container for grouped nodes
interface GroupNodeData {
  name: string
  type: string
  config?: {
    childNodeIds?: string[]
    label?: string
    collapsed?: boolean
    color?: string
  }
  [key: string]: unknown
}

// 颜色映射
const groupColorStyles: Record<string, { bgClass: string; borderClass: string; headerBg: string }> = {
  gray: { bgClass: 'bg-gray-50', borderClass: 'border-gray-300', headerBg: 'bg-gray-100/80' },
  blue: { bgClass: 'bg-blue-50', borderClass: 'border-blue-300', headerBg: 'bg-blue-100/80' },
  green: { bgClass: 'bg-green-50', borderClass: 'border-green-300', headerBg: 'bg-green-100/80' },
  yellow: { bgClass: 'bg-yellow-50', borderClass: 'border-yellow-300', headerBg: 'bg-yellow-100/80' },
  red: { bgClass: 'bg-red-50', borderClass: 'border-red-300', headerBg: 'bg-red-100/80' },
  purple: { bgClass: 'bg-purple-50', borderClass: 'border-purple-300', headerBg: 'bg-purple-100/80' },
  pink: { bgClass: 'bg-pink-50', borderClass: 'border-pink-300', headerBg: 'bg-pink-100/80' },
  cyan: { bgClass: 'bg-cyan-50', borderClass: 'border-cyan-300', headerBg: 'bg-cyan-100/80' },
}

function GroupNodeBase({ data, selected, id }: NodeProps & { data: GroupNodeData }) {
  const Icon = Group
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { ungroupNodes, deleteNode, toggleGroupCollapse } = useWorkflowStore()

  const childCount = data.config?.childNodeIds?.length || 0
  const label = data.name || '节点组'
  const colorKey = data.config?.color || 'gray'
  const colorStyle = groupColorStyles[colorKey] || groupColorStyles.gray
  const isCollapsed = data.config?.collapsed || false

  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleUngroup = () => {
    ungroupNodes(id)
    setContextMenu(null)
  }

  const handleDelete = () => {
    deleteNode(id)
    setContextMenu(null)
  }

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleGroupCollapse(id)
  }

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed shadow-sm transition-all',
        colorStyle.bgClass,
        colorStyle.borderClass,
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      onContextMenu={handleContextMenu}
      style={{ width: '100%', height: '100%', minWidth: isCollapsed ? 180 : 200, minHeight: isCollapsed ? 60 : 80 }}
    >
      {/* 连接点 - 始终显示 */}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-gray-400" />

      {/* 组标题栏 */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2',
        !isCollapsed && 'border-b rounded-t-lg',
        isCollapsed && 'rounded-lg',
        colorStyle.headerBg,
        !isCollapsed && colorStyle.borderClass
      )}>
        {/* 折叠/展开按钮 */}
        <button
          onClick={handleToggleCollapse}
          className="rounded p-0.5 hover:bg-white/50 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
        <div className="rounded-md bg-white/80 p-1.5 text-gray-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium text-gray-700 truncate">{label}</span>
          <span className="text-xs text-gray-500">{childCount} 个节点</span>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="min-w-[120px] rounded-md border bg-popover p-1 shadow-lg"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
          }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleUngroup}
          >
            <Ungroup className="h-4 w-4" />
            拆散组合
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            删除组
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

export const GroupNode = memo((props: NodeProps) => <GroupNodeBase {...props} data={props.data as GroupNodeData} />)
GroupNode.displayName = 'GroupNode'

// 节点类型映射
export const nodeTypes = {
  trigger: TriggerNode,
  input: InputNode,
  process: ProcessNode,
  code: CodeNode,
  output: OutputNode,
  // Media/Data nodes with mode indicator
  data: MediaDataDataNode,
  image: MediaDataImageNode,
  video: MediaDataVideoNode,
  audio: MediaDataAudioNode,
  // Advanced nodes
  condition: ConditionNode,
  loop: LoopNode,
  switch: SwitchNode,
  http: HttpNode,
  merge: MergeNode,
  image_gen: ImageGenNode,
  notification: NotificationNode,
  // Group node
  group: GroupNode,
}
