'use client'

import { useState, useEffect, useRef } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Button } from '@/components/ui/button'
import { AtSign, ChevronRight } from 'lucide-react'
import type { InputField, KnowledgeItem } from '@/types/workflow'
import type { NodeReferenceOption } from './types'

interface ReferenceSelectorProps {
  knowledgeItems: KnowledgeItem[]
  onInsert: (reference: string) => void
}

export function ReferenceSelector({
  knowledgeItems,
  onInsert,
}: ReferenceSelectorProps) {
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
    const findPredecessors = (nodeId: string) => {
      const incoming = edges.filter(e => e.target === nodeId)
      for (const edge of incoming) {
        if (!predecessorIds.has(edge.source)) {
          predecessorIds.add(edge.source)
          findPredecessors(edge.source)
        }
      }
    }
    findPredecessors(selectedNodeId!)

    // 处理每个前置节点
    for (const node of nodes) {
      if (!predecessorIds.has(node.id)) continue

      const nodeData = node.data as Record<string, unknown>
      const nodeType = (nodeData.type as string)?.toLowerCase()
      const nodeName = nodeData.name as string
      const nodeConfig = nodeData.config as Record<string, unknown> | undefined
      const fields: NodeReferenceOption['fields'] = []

      // 根据节点类型添加可引用字段
      if (nodeType === 'input') {
        // 输入节点：添加所有输入字段
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
        // 处理节点：添加知识库 + 输出
        const processKnowledge = (nodeConfig?.knowledgeItems as KnowledgeItem[]) || []
        for (const kb of processKnowledge) {
          fields.push({
            id: kb.id,
            name: `知识库: ${kb.name}`,
            type: 'knowledge',
            reference: `{{${nodeName}.知识库.${kb.name}}}`,
          })
        }
        // 添加节点输出选项
        fields.push({
          id: `${node.id}_output`,
          name: '节点输出',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      } else if (nodeType === 'code') {
        // 代码节点：添加输出
        fields.push({
          id: `${node.id}_output`,
          name: '节点输出',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      } else {
        // 其他节点：添加输出
        fields.push({
          id: `${node.id}_output`,
          name: '节点输出',
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

    // 添加当前节点的知识库（如果有）
    if (knowledgeItems.length > 0) {
      const currentNodeData = currentNode.data as { name: string }
      const currentNodeName = currentNodeData.name
      const kbFields: NodeReferenceOption['fields'] = knowledgeItems.map(kb => ({
        id: kb.id,
        name: kb.name,
        type: 'knowledge' as const,
        reference: `{{${currentNodeName}.知识库.${kb.name}}}`,
      }))

      options.push({
        nodeId: 'current_knowledge',
        nodeName: `${currentNodeName} 知识库`,
        nodeType: 'knowledge',
        fields: kbFields,
      })
    }

    return options
  }

  const nodeOptions = getNodeOptions()

  const handleSelectNode = (option: NodeReferenceOption) => {
    // 始终显示字段选择，让用户明确选择要引用的内容
    setSelectedNode(option)
  }

  const handleSelectField = (field: NodeReferenceOption['fields'][0]) => {
    onInsert(field.reference)
    setIsOpen(false)
    setSelectedNode(null)
  }

  if (nodeOptions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        暂无可引用的节点（请先连接前置节点）
      </div>
    )
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

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => {
          setIsOpen(!isOpen)
          setSelectedNode(null)
        }}
      >
        <AtSign className="mr-1 h-3 w-3" />
        插入引用
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-[300px] min-w-[200px]">
          {/* 未选择节点时：显示节点列表 */}
          {!selectedNode ? (
            <div className="overflow-y-auto">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b sticky top-0 bg-popover">
                选择节点 (共{nodeOptions.length}个)
              </div>
              <div className="py-1">
                {nodeOptions.map((option) => {
                  const hasFields = option.fields.length > 0
                  return (
                    <button
                      key={option.nodeId}
                      className="w-full px-3 py-1.5 text-sm text-left flex items-center justify-between hover:bg-accent transition-colors"
                      onClick={() => handleSelectNode(option)}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{getNodeIcon(option.nodeType)}</span>
                        <span className="truncate max-w-[120px]">{option.nodeName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">({option.fields.length})</span>
                        {hasFields && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* 已选择节点时：显示字段列表 */
            <div className="overflow-y-auto">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b sticky top-0 bg-popover flex items-center gap-2">
                <button
                  className="hover:bg-accent rounded p-0.5 transition-colors"
                  onClick={() => setSelectedNode(null)}
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                </button>
                <span>{selectedNode.nodeName}</span>
              </div>
              <div className="py-1">
                {selectedNode.fields.map((field) => (
                  <button
                    key={field.id}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-1.5"
                    onClick={() => handleSelectField(field)}
                  >
                    <span>{getFieldIcon(field.type)}</span>
                    <span className="truncate">{field.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
