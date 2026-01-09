'use client'

import { useState, useEffect, useRef } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Button } from '@/components/ui/button'
import { AtSign, ChevronRight } from 'lucide-react'
import type { InputField, KnowledgeItem } from '@/types/workflow'
import type { NodeReferenceOption } from './types'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CompactReferenceSelectorProps {
  onInsert: (reference: string) => void
  className?: string
}

/**
 * 紧凑型引用选择器
 * 用于工具配置面板等空间有限的场景
 */
export function CompactReferenceSelector({
  onInsert,
  className,
}: CompactReferenceSelectorProps) {
  const { nodes, selectedNodeId, edges } = useWorkflowStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<NodeReferenceOption | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSelectedNode(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 获取所有可引用的节点及其字段
  const getNodeOptions = (): NodeReferenceOption[] => {
    const options: NodeReferenceOption[] = []

    // 获取当前节点
    const currentNode = nodes.find(n => n.id === selectedNodeId)
    if (!currentNode) return options

    // 递归获取所有前置节点
    const predecessorIds = new Set<string>()
    const findPredecessors = (nodeId: string, visitedNodeIds: Set<string> = new Set()) => {
      if (visitedNodeIds.has(nodeId)) return
      visitedNodeIds.add(nodeId)

      const targetNode = nodes.find(n => n.id === nodeId)

      const incoming = edges.filter(e => e.target === nodeId)
      for (const edge of incoming) {
        if (!predecessorIds.has(edge.source)) {
          predecessorIds.add(edge.source)
          findPredecessors(edge.source, visitedNodeIds)
        }
      }

      // 处理组节点
      if (targetNode?.parentId) {
        const parentGroupId = targetNode.parentId
        const groupIncoming = edges.filter(e => {
          if (e.target === parentGroupId) {
            const originalTarget = e.data?._originalTarget as string | undefined
            if (originalTarget === nodeId) return true
            if (!originalTarget) return true
            return false
          }
          return false
        })

        for (const edge of groupIncoming) {
          if (!predecessorIds.has(edge.source)) {
            predecessorIds.add(edge.source)
            findPredecessors(edge.source, visitedNodeIds)
          }
        }

        findPredecessors(parentGroupId, visitedNodeIds)
      }
    }
    findPredecessors(selectedNodeId!)

    // 展开组节点
    const groupIds = new Set<string>()
    for (const nodeId of predecessorIds) {
      const node = nodes.find(n => n.id === nodeId)
      const nodeData = node?.data as Record<string, unknown>
      const nodeType = (nodeData?.type as string)?.toLowerCase()
      if (nodeType === 'group') {
        groupIds.add(nodeId)
      }
    }
    for (const node of nodes) {
      if (node.parentId && groupIds.has(node.parentId)) {
        predecessorIds.add(node.id)
      }
    }

    // 处理每个前置节点
    for (const node of nodes) {
      if (!predecessorIds.has(node.id)) continue

      const nodeData = node.data as Record<string, unknown>
      const nodeType = (nodeData.type as string)?.toLowerCase()

      if (nodeType === 'group') continue

      const nodeName = nodeData.name as string
      const nodeConfig = nodeData.config as Record<string, unknown> | undefined
      const fields: NodeReferenceOption['fields'] = []

      if (nodeType === 'input') {
        const inputFields = (nodeConfig?.fields as InputField[]) || []
        for (const field of inputFields) {
          fields.push({
            id: field.id,
            name: field.name,
            type: 'field',
            reference: `{{${nodeName}.${field.name}}}`,
          })
        }
      } else if (nodeType === 'process') {
        const processKnowledge = (nodeConfig?.knowledgeItems as KnowledgeItem[]) || []
        for (const kb of processKnowledge) {
          fields.push({
            id: kb.id,
            name: `知识库: ${kb.name}`,
            type: 'knowledge',
            reference: `{{${nodeName}.知识库.${kb.name}}}`,
          })
        }
        fields.push({
          id: `${node.id}_output`,
          name: '全部输出内容',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      } else {
        fields.push({
          id: `${node.id}_output`,
          name: '全部输出内容',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      }

      if (fields.length > 0) {
        options.push({
          nodeId: node.id,
          nodeName,
          nodeType: nodeType || 'unknown',
          fields,
        })
      }
    }

    return options
  }

  const nodeOptions = getNodeOptions()

  const handleSelectNode = (option: NodeReferenceOption) => {
    setSelectedNode(option)
  }

  const handleSelectField = (field: NodeReferenceOption['fields'][0]) => {
    onInsert(field.reference)
    setIsOpen(false)
    setSelectedNode(null)
  }

  // 获取节点类型图标
  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'input': return '📥'
      case 'process': return '⚙️'
      case 'code': return '💻'
      case 'output': return '📤'
      case 'knowledge': return '📚'
      default: return '📦'
    }
  }

  // 获取字段类型图标
  const getFieldIcon = (fieldType: string) => {
    switch (fieldType) {
      case 'field': return '📝'
      case 'knowledge': return '📖'
      case 'output': return '➡️'
      default: return ''
    }
  }

  const hasOptions = nodeOptions.length > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (hasOptions) {
                  setIsOpen(!isOpen)
                  setSelectedNode(null)
                }
              }}
              disabled={!hasOptions}
            >
              <AtSign className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {hasOptions ? '插入变量引用' : '无可引用的节点'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isOpen && hasOptions && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-[250px] min-w-[180px] flex flex-col overflow-hidden">
          {!selectedNode ? (
            <>
              <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-b bg-muted/50 flex-shrink-0">
                选择节点
              </div>
              <div className="py-0.5 overflow-y-auto flex-1">
                {nodeOptions.map((option) => (
                  <button
                    key={option.nodeId}
                    className="w-full px-2 py-1 text-xs text-left flex items-center justify-between hover:bg-accent transition-colors"
                    onClick={() => handleSelectNode(option)}
                  >
                    <span className="flex items-center gap-1">
                      <span className="text-[10px]">{getNodeIcon(option.nodeType)}</span>
                      <span className="truncate max-w-[100px]">{option.nodeName}</span>
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-b bg-muted/50 flex items-center gap-1 flex-shrink-0">
                <button
                  className="hover:bg-accent rounded p-0.5 transition-colors"
                  onClick={() => setSelectedNode(null)}
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                </button>
                <span className="truncate">{selectedNode.nodeName}</span>
              </div>
              <div className="py-0.5 overflow-y-auto flex-1">
                {selectedNode.fields.map((field) => (
                  <button
                    key={field.id}
                    className="w-full px-2 py-1 text-xs text-left hover:bg-accent transition-colors flex items-center gap-1"
                    onClick={() => handleSelectField(field)}
                  >
                    <span className="text-[10px]">{getFieldIcon(field.type)}</span>
                    <span className="truncate">{field.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
