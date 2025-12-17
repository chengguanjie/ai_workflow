'use client'

import { memo, useState, useEffect, useRef } from 'react'
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

const nodeStyles: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  input: { icon: ArrowDownToLine, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  process: { icon: Bot, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  code: { icon: Code2, color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
  output: { icon: ArrowUpFromLine, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
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
  const { deleteNode, duplicateNode } = useWorkflowStore()

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
        {/* 输入连接点 */}
        {data.type.toLowerCase() !== 'input' && (
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

          {/* 执行按钮 - 输入节点不显示 */}
          {data.type.toLowerCase() !== 'input' && (
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

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    INPUT: '输入节点',
    PROCESS: '处理节点',
    CODE: '代码节点',
    OUTPUT: '输出节点',
  }
  return labels[type.toUpperCase()] || type
}

// 导出自定义节点类型
export const InputNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
InputNode.displayName = 'InputNode'

export const ProcessNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
ProcessNode.displayName = 'ProcessNode'

export const CodeNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
CodeNode.displayName = 'CodeNode'

export const OutputNode = memo((props: NodeProps) => <BaseNode {...props} data={props.data as NodeData} />)
OutputNode.displayName = 'OutputNode'

// 节点类型映射
export const nodeTypes = {
  input: InputNode,
  process: ProcessNode,
  code: CodeNode,
  output: OutputNode,
}
