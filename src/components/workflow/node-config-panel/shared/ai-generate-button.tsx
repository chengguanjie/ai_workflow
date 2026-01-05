'use client'

import { useState, useCallback, useMemo } from 'react'
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
  fieldType: string
  currentContent: string
  onConfirm: (content: string) => void
  availableReferences?: string[]
  fieldLabel?: string
  size?: 'sm' | 'default'
  className?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  NO_AI_CONFIG: '请先在设置中配置 AI 服务',
  CONTEXT_LIMIT_EXCEEDED: '上下文过大，已自动精简，请重试',
  GENERATION_FAILED: '生成失败，请稍后重试',
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3)
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `~${(tokens / 1000).toFixed(1)}k`
  }
  return `~${tokens}`
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

  const currentNode = nodes.find(n => n.id === selectedNodeId)
  const currentNodeData = currentNode?.data as { name?: string; type?: string } | undefined

  const directPredecessorIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    const ids = new Set<string>()
    edges.forEach(edge => {
      if (edge.target === selectedNodeId) {
        ids.add(edge.source)
      }
    })
    return ids
  }, [edges, selectedNodeId])

  const buildAvailableReferences = useCallback(() => {
    if (propReferences) return propReferences

    const references: string[] = []
    const maxReferences = 20

    for (const node of nodes) {
      if (!directPredecessorIds.has(node.id)) continue
      if (references.length >= maxReferences) break

      const nodeData = node.data as { name?: string; type?: string; config?: Record<string, unknown> }
      const nodeName = nodeData?.name || node.id
      const nodeType = nodeData?.type?.toUpperCase()

      if (nodeType === 'INPUT') {
        const fields = nodeData?.config?.fields as Array<{ name: string }> | undefined
        if (fields) {
          for (const field of fields.slice(0, 5)) {
            references.push(`- {{${nodeName}.${field.name}}}`)
            if (references.length >= maxReferences) break
          }
        }
      } else {
        references.push(`- {{${nodeName}}}`)
      }
    }

    return references
  }, [nodes, directPredecessorIds, propReferences])

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

  const estimatedTokens = useMemo(() => {
    let total = 0
    total += estimateTokens(name || '')
    total += estimateTokens(description || '')
    
    const currentNodeIndex = nodes.findIndex(n => n.id === selectedNodeId)
    const predecessorNodes = nodes.slice(0, Math.max(0, currentNodeIndex))
    
    predecessorNodes.forEach(node => {
      const nodeData = node.data as { name?: string; type?: string; config?: Record<string, unknown> }
      total += estimateTokens(nodeData?.name || '')
      total += 20
      
      if (nodeData?.type?.toUpperCase() === 'PROCESS') {
        const sp = nodeData?.config?.systemPrompt
        const up = nodeData?.config?.userPrompt
        if (sp) total += Math.min(estimateTokens(String(sp)), 35)
        if (up) total += Math.min(estimateTokens(String(up)), 35)
      }
    })
    
    total += estimateTokens(currentContent || '')
    total += 500
    
    return total
  }, [nodes, selectedNodeId, name, description, currentContent])

  const contextStatus = useMemo(() => {
    if (estimatedTokens < 2000) return 'normal'
    if (estimatedTokens < 4000) return 'medium'
    return 'large'
  }, [estimatedTokens])

  const tooltipText = useMemo(() => {
    const action = currentContent?.trim() ? 'AI 优化内容' : 'AI 生成内容'
    const tokenInfo = formatTokenCount(estimatedTokens)
    
    if (contextStatus === 'large') {
      return `${action}（${tokenInfo} tokens，将自动精简）`
    }
    return `${action}（${tokenInfo} tokens）`
  }, [currentContent, estimatedTokens, contextStatus])

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

      const resData = await response.json()
      
      if (!response.ok) {
        const errorCode = resData.error?.details?.code || 'GENERATION_FAILED'
        const errorMessage = ERROR_MESSAGES[errorCode] || resData.error?.message || '生成失败'
        throw new Error(errorMessage)
      }

      const data = resData.success ? resData.data : {}
      setGeneratedContent(data.content || '')
      setIsOptimization(data.isOptimization || false)
      setIsDialogOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
      console.error('AI generate error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [fieldType, currentContent, buildWorkflowContext, buildAvailableReferences])

  const handleClick = () => {
    generateContent()
  }

  const handleRegenerate = () => {
    generateContent()
  }

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
                contextStatus === 'large' && "text-amber-500 hover:text-amber-600",
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
            <p>{tooltipText}</p>
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
