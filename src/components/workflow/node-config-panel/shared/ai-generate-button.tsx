'use client'

import { useState, useCallback } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/stores/workflow-store'
import { AIGeneratePreviewDialog } from './ai-generate-preview-dialog'

interface AIGenerateButtonProps {
  /** 字段类型标识 */
  fieldType: string
  /** 当前文本框内容 */
  currentContent: string
  /** 确认使用生成内容后的回调 */
  onConfirm: (content: string) => void
  /** 可用的节点引用列表（可选，会自动从工作流中获取） */
  availableReferences?: string[]
  /** 字段显示名称（用于弹窗标题） */
  fieldLabel?: string
  /** 按钮大小 */
  size?: 'sm' | 'default'
  /** 额外的类名 */
  className?: string
}

export function AIGenerateButton({
  fieldType,
  currentContent,
  onConfirm,
  availableReferences: propReferences,
  fieldLabel,
  size = 'sm',
  className,
}: AIGenerateButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')
  const [isOptimization, setIsOptimization] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { nodes, edges, name, description, selectedNodeId } = useWorkflowStore()

  // 获取当前节点信息
  const currentNode = nodes.find(n => n.id === selectedNodeId)
  const currentNodeData = currentNode?.data as { name?: string; type?: string } | undefined

  // 构建可用引用列表
  const buildAvailableReferences = useCallback(() => {
    if (propReferences) return propReferences

    const references: string[] = []

    // 找到当前节点的前置节点
    const predecessorIds = new Set<string>()

    // 递归获取所有前置节点
    const getPredecessors = (nodeId: string) => {
      const incoming = edges.filter(e => e.target === nodeId)
      incoming.forEach(edge => {
        if (!predecessorIds.has(edge.source)) {
          predecessorIds.add(edge.source)
          getPredecessors(edge.source)
        }
      })
    }

    if (selectedNodeId) {
      getPredecessors(selectedNodeId)
    }

    // 为每个前置节点生成引用
    nodes.forEach(node => {
      if (!predecessorIds.has(node.id)) return

      const nodeData = node.data as { name?: string; type?: string; config?: Record<string, unknown> }
      const nodeName = nodeData?.name || node.id
      const nodeType = nodeData?.type?.toUpperCase()

      if (nodeType === 'INPUT') {
        // 输入节点：列出所有字段
        const fields = nodeData?.config?.fields as Array<{ name: string }> | undefined
        if (fields) {
          fields.forEach(field => {
            references.push(`- {{${nodeName}.${field.name}}}`)
          })
        }
      } else {
        // 其他节点：输出整个节点
        references.push(`- {{${nodeName}}}`)
      }
    })

    return references
  }, [nodes, edges, selectedNodeId, propReferences])

  // 构建工作流上下文
  const buildWorkflowContext = useCallback(() => {
    const workflowNodes = nodes.map(node => {
      const nodeData = node.data as { id: string; name?: string; type?: string; config?: Record<string, unknown> }
      return {
        id: nodeData?.id || node.id,
        name: nodeData?.name || '',
        type: nodeData?.type || '',
        config: nodeData?.config,
      }
    })

    return {
      workflowName: name,
      workflowDescription: description,
      nodes: workflowNodes,
      currentNodeId: selectedNodeId,
      currentNodeName: currentNodeData?.name,
      currentNodeType: currentNodeData?.type,
    }
  }, [nodes, name, description, selectedNodeId, currentNodeData])

  // 调用 AI 生成
  const generateContent = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/generate-field-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldType,
          currentContent: currentContent?.trim() || '',
          workflowContext: buildWorkflowContext(),
          availableReferences: buildAvailableReferences(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '生成失败')
      }

      const data = await response.json()
      setGeneratedContent(data.content)
      setIsOptimization(data.isOptimization)
      setIsDialogOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
      console.error('AI generate error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [fieldType, currentContent, buildWorkflowContext, buildAvailableReferences])

  // 处理按钮点击
  const handleClick = () => {
    generateContent()
  }

  // 处理重新生成
  const handleRegenerate = () => {
    generateContent()
  }

  // 处理确认
  const handleConfirm = (content: string) => {
    onConfirm(content)
    setIsDialogOpen(false)
    setGeneratedContent('')
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={size}
              className={cn(
                "h-6 px-1.5 text-xs gap-1 text-muted-foreground hover:text-primary",
                "transition-colors",
                isLoading && "pointer-events-none",
                className
              )}
              onClick={handleClick}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">AI</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{currentContent?.trim() ? 'AI 优化内容' : 'AI 生成内容'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {error && (
        <div className="text-xs text-destructive mt-1">{error}</div>
      )}

      <AIGeneratePreviewDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        originalContent={currentContent || ''}
        generatedContent={generatedContent}
        isOptimization={isOptimization}
        isLoading={isLoading}
        onConfirm={handleConfirm}
        onRegenerate={handleRegenerate}
        fieldLabel={fieldLabel}
      />
    </>
  )
}
