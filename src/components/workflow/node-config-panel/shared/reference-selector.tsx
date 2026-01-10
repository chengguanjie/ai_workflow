'use client'

import { useState, useEffect, useRef } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AtSign, ChevronRight } from 'lucide-react'
import type { InputField, KnowledgeItem } from '@/types/workflow'
import type { NodeReferenceOption } from './types'

interface ReferenceSelectorProps {
  knowledgeItems: KnowledgeItem[]
  onInsert: (reference: string, options?: { bypassAutoBind?: boolean }) => void
  buttonLabel?: string
  onOpen?: () => void
}

export function ReferenceSelector({
  knowledgeItems,
  onInsert,
  buttonLabel = '插入引用',
  onOpen,
}: ReferenceSelectorProps) {
  const { nodes, selectedNodeId, edges, nodeExecutionResults } = useWorkflowStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<NodeReferenceOption | null>(null)
  const [searchText, setSearchText] = useState('')
  const [showAllFields, setShowAllFields] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const STANDARD_OUTPUT_FIELD_KEYS = [
    '结果',
    'result',
    'model',
    'images',
    'imageUrls', // 虚拟字段：由 images 派生，支持 {{节点.imageUrls}}
    'videos',
    'audio',
    'text',
    'taskId',
    'toolCalls',
    'toolCallRounds',
    '_meta',
  ] as const

  const OUTPUT_FIELD_LABELS: Partial<Record<(typeof STANDARD_OUTPUT_FIELD_KEYS)[number], string>> = {
    结果: '结果（推荐）',
    result: 'result（兼容）',
    imageUrls: '图片URL列表',
    images: '图片详情（原始）',
    videos: '视频列表',
    audio: '音频',
    text: '文本（工具输出）',
    model: '模型',
    _meta: '元信息',
    taskId: '任务ID',
    toolCalls: '工具调用记录',
    toolCallRounds: '工具调用轮次',
  }

  const getExpectedOutputHint = (nodeName: string): { expected?: string } => {
    const node = nodes.find(n => (n.data as Record<string, unknown>)?.name === nodeName)
    const nodeConfig = (node?.data as Record<string, unknown>)?.config as Record<string, unknown> | undefined
    const expected = nodeConfig?.expectedOutputType
    return { expected: typeof expected === 'string' ? expected : undefined }
  }

  const getOutputCapabilities = (
    nodeId: string,
    nodeName: string
  ): {
    hasResult: boolean
    hasImages: boolean
    hasVideos: boolean
    hasAudio: boolean
    hasText: boolean
  } => {
    const output = nodeExecutionResults?.[nodeId]?.output
    const obj = output && typeof output === 'object' && !Array.isArray(output) ? (output as Record<string, unknown>) : null

    const hasResult =
      obj ? (obj['结果'] !== undefined || obj['result'] !== undefined) : true

    const hasImages = (() => {
      if (!obj) return false
      const images = obj['images']
      const imageUrls = obj['imageUrls']
      return (Array.isArray(images) && images.length > 0) || (Array.isArray(imageUrls) && imageUrls.length > 0)
    })()

    const hasVideos =
      obj ? (Array.isArray(obj.videos) && obj.videos.length > 0) : false

    const hasAudio =
      obj ? obj.audio !== undefined && obj.audio !== null : false

    const hasText =
      obj ? typeof obj.text === 'string' && obj.text.trim().length > 0 : false

    // 如果没有真实执行输出，用 expectedOutputType 做“可能存在”的兜底提示
    if (!obj) {
      const { expected } = getExpectedOutputHint(nodeName)
      return {
        hasResult,
        hasImages: expected === 'image',
        hasVideos: expected === 'video',
        hasAudio: expected === 'audio',
        hasText: expected === 'audio', // audio-tts 常会同时产出 text
      }
    }

    return { hasResult, hasImages, hasVideos, hasAudio, hasText }
  }

  const isCommonField = (nodeId: string, nodeName: string, field: NodeReferenceOption['fields'][0]): boolean => {
    if (field.type !== 'output') return true
    if (field.reference === `{{${nodeName}}}`) return true

    const caps = getOutputCapabilities(nodeId, nodeName)

    if (field.reference === `{{${nodeName}.结果}}`) return caps.hasResult
    if (field.reference === `{{${nodeName}.result}}`) return false // 兼容字段默认不展示为常用
    if (field.reference === `{{${nodeName}.imageUrls}}`) return caps.hasImages
    if (field.reference === `{{${nodeName}.videos}}`) return caps.hasVideos
    if (field.reference === `{{${nodeName}.audio}}`) return caps.hasAudio
    if (field.reference === `{{${nodeName}.text}}`) return caps.hasText

    return false
  }

  const stripMarkdownCodeFence = (text: string): string => {
    const trimmed = text.trim()
    if (!trimmed.startsWith('```')) return trimmed
    const lines = trimmed.split('\n')
    if (lines.length < 3) return trimmed
    if (!lines[0].startsWith('```')) return trimmed
    if (!lines[lines.length - 1].startsWith('```')) return trimmed
    return lines.slice(1, -1).join('\n').trim()
  }

  const tryParseJsonLike = (text: string): unknown | null => {
    const candidate = stripMarkdownCodeFence(text)
    if (!candidate) return null
    try {
      return JSON.parse(candidate)
    } catch {
      const start = candidate.indexOf('{')
      const end = candidate.lastIndexOf('}')
      if (start === -1 || end === -1 || end <= start) return null
      const slice = candidate.slice(start, end + 1)
      try {
        return JSON.parse(slice)
      } catch {
        return null
      }
    }
  }

  const flattenObjectPaths = (
    value: unknown,
    prefix: string,
    maxDepth: number,
    currentDepth: number = 0
  ): string[] => {
    if (currentDepth >= maxDepth) return []
    if (!value || typeof value !== 'object') return []

    if (Array.isArray(value)) {
      // 对数组：只暴露数组本身；若首元素为对象，额外暴露 images.0.xxx 这种便捷路径
      const paths: string[] = [prefix]
      const first = value[0]
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        for (const k of Object.keys(first as Record<string, unknown>)) {
          paths.push(`${prefix}.0.${k}`)
        }
      }
      return paths
    }

    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    const paths: string[] = []
    for (const k of keys) {
      const next = prefix ? `${prefix}.${k}` : k
      paths.push(next)
      paths.push(...flattenObjectPaths(obj[k], next, maxDepth, currentDepth + 1))
    }
    return paths
  }

  const buildOutputFields = (nodeId: string, nodeName: string): NodeReferenceOption['fields'] => {
    const fields: NodeReferenceOption['fields'] = []

    // 1) 始终提供整节点输出
    fields.push({
      id: `${nodeId}_output_all`,
      name: '全部输出内容',
      type: 'output',
      reference: `{{${nodeName}}}`,
    })

    // 2) 基础（标准）输出字段
    for (const key of STANDARD_OUTPUT_FIELD_KEYS) {
      fields.push({
        id: `${nodeId}_output_${key}`,
        name: OUTPUT_FIELD_LABELS[key] || key,
        type: 'output',
        reference: `{{${nodeName}.${key}}}`,
      })
    }

    // 3) 若有最近一次执行结果，基于真实输出展开字段
    const latest = nodeExecutionResults?.[nodeId]?.output
    if (latest && typeof latest === 'object' && !Array.isArray(latest)) {
      const outputObj = latest as Record<string, unknown>

      // 顶层字段 + 二级字段（如 _meta.xxx、images.0.url）
      const dynamicPaths = new Set<string>()
      for (const k of Object.keys(outputObj)) {
        dynamicPaths.add(k)
        const v = outputObj[k]
        for (const p of flattenObjectPaths(v, k, 2)) {
          dynamicPaths.add(p)
        }
      }

      // 解析 result/结果 内的 JSON（常见：AI 输出为 JSON 字符串，但支持 {{节点.xxx}} 直接取字段）
      const rawText =
        (typeof outputObj['结果'] === 'string' && (outputObj['结果'] as string)) ||
        (typeof outputObj['result'] === 'string' && (outputObj['result'] as string)) ||
        ''
      if (rawText) {
        const parsed = tryParseJsonLike(rawText)
        if (parsed && typeof parsed === 'object') {
          for (const p of flattenObjectPaths(parsed, '', 2)) {
            // flattenObjectPaths 会返回诸如 "a"、"a.b"，这些路径应直接作为 {{节点.a}} 使用
            dynamicPaths.add(p)
          }
        }
      }

      // 写入字段（去重：按 reference）
      const existing = new Set(fields.map(f => f.reference))
      for (const path of Array.from(dynamicPaths)) {
        if (!path) continue
        const ref = `{{${nodeName}.${path}}}`
        if (existing.has(ref)) continue
        existing.add(ref)
        fields.push({
          id: `${nodeId}_output_dynamic_${path}`,
          name: `输出: ${path}`,
          type: 'output',
          reference: ref,
        })
      }
    }

    // 最终去重（按 reference），避免同名/重复项
    const seen = new Set<string>()
    return fields.filter(f => {
      if (seen.has(f.reference)) return false
      seen.add(f.reference)
      return true
    })
  }

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
      // 防止循环引用
      if (visitedNodeIds.has(nodeId)) return
      visitedNodeIds.add(nodeId)

      const targetNode = nodes.find(n => n.id === nodeId)

      // 查找直接指向当前节点的边
      const incoming = edges.filter(e => e.target === nodeId)
      for (const edge of incoming) {
        if (!predecessorIds.has(edge.source)) {
          predecessorIds.add(edge.source)
          findPredecessors(edge.source, visitedNodeIds)
        }
      }

      // 如果当前节点是组内子节点，还需要检查指向父组节点的边
      // 因为当组折叠时，边的target会被映射到组节点，原始目标保存在_originalTarget
      // 同时，即使组展开，边也可能直接连接到组节点（而不是组内特定子节点）
      if (targetNode?.parentId) {
        const parentGroupId = targetNode.parentId
        // 查找指向父组节点的边
        const groupIncoming = edges.filter(e => {
          if (e.target === parentGroupId) {
            const originalTarget = e.data?._originalTarget as string | undefined
            // 情况1：折叠状态下映射的边，原始目标是当前节点
            if (originalTarget === nodeId) return true
            // 情况2：直接连接到组节点的边（没有原始目标），组内所有子节点都可以引用
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

        // 同时递归查找父组的前置节点（处理嵌套组的情况）
        findPredecessors(parentGroupId, visitedNodeIds)
      }
    }
    findPredecessors(selectedNodeId!)

    // 如果前置节点是组节点，将组内的子节点也添加到 predecessorIds
    const groupIds = new Set<string>()
    for (const nodeId of predecessorIds) {
      const node = nodes.find(n => n.id === nodeId)
      const nodeData = node?.data as Record<string, unknown>
      const nodeType = (nodeData?.type as string)?.toLowerCase()
      if (nodeType === 'group') {
        groupIds.add(nodeId)
      }
    }
    // 查找所有属于这些组的子节点
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

      // 跳过组节点本身，组节点没有可引用的字段（但组内子节点已经被添加）
      if (nodeType === 'group') continue

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
        fields.push(...buildOutputFields(node.id, nodeName))
      } else if (nodeType === 'code') {
        fields.push(...buildOutputFields(node.id, nodeName))
      } else {
        fields.push(...buildOutputFields(node.id, nodeName))
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
    setSearchText('')
    setShowAllFields(false)
  }

  const handleSelectField = (
    field: NodeReferenceOption['fields'][0],
    options?: { bypassAutoBind?: boolean }
  ) => {
    onInsert(field.reference, options)
    setIsOpen(false)
    setSelectedNode(null)
    setSearchText('')
    setShowAllFields(false)
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

  const filterFields = (fields: NodeReferenceOption['fields']) => {
    const q = searchText.trim().toLowerCase()
    if (!q) return fields
    return fields.filter(f => {
      const name = (f.name || '').toLowerCase()
      const ref = (f.reference || '').toLowerCase()
      return name.includes(q) || ref.includes(q)
    })
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onMouseDown={(e) => {
          // Preserve editor selection/caret when clicking the trigger button.
          // Also capture the caret *before* focus potentially changes.
          if (!isOpen) onOpen?.()
          e.preventDefault()
        }}
        onClick={() => {
          setIsOpen(!isOpen)
          setSelectedNode(null)
          setSearchText('')
          setShowAllFields(false)
        }}
      >
        <AtSign className="mr-1 h-3 w-3" />
        {buttonLabel}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-[300px] min-w-[200px] flex flex-col overflow-hidden">
          {/* 未选择节点时：显示节点列表 */}
          {!selectedNode ? (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b bg-popover flex-shrink-0">
                选择节点 (共{nodeOptions.length}个)
              </div>
              <div className="py-1 overflow-y-auto flex-1">
                {nodeOptions.map((option) => {
                  const hasFields = option.fields.length > 0
                  const commonCount = option.fields.filter(f => isCommonField(option.nodeId, option.nodeName, f)).length
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
                        <span className="text-xs text-muted-foreground">
                          ({commonCount})
                        </span>
                        {hasFields && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            /* 已选择节点时：显示字段列表 */
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b bg-popover flex items-center gap-2 flex-shrink-0">
                <button
                  className="hover:bg-accent rounded p-0.5 transition-colors"
                  onClick={() => setSelectedNode(null)}
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                </button>
                <span>{selectedNode.nodeName}</span>
              </div>
              <div className="p-2 border-b bg-popover flex items-center gap-2 flex-shrink-0">
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="搜索字段（支持输入 result、imageUrls…）"
                  className="h-7 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowAllFields(v => !v)}
                >
                  {showAllFields ? '收起' : '更多'}
                </Button>
              </div>

              {(() => {
                const filtered = filterFields(selectedNode.fields)
                const commonFields = filtered.filter(f => isCommonField(selectedNode.nodeId, selectedNode.nodeName, f))
                const advancedFields = filtered.filter(f => !isCommonField(selectedNode.nodeId, selectedNode.nodeName, f))
                const visibleAdvanced = showAllFields ? advancedFields : []
                const showReferenceHint = showAllFields || searchText.trim().length > 0

                return (
                  <div className="py-1 overflow-y-auto flex-1">
                    <div className="px-2 py-1 text-[11px] text-muted-foreground">
                      常用引用
                    </div>
                    {commonFields.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        无匹配结果
                      </div>
                    ) : (
                      commonFields.map((field) => (
                        <button
                          key={field.id}
                          className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                          onClick={(e) =>
                            handleSelectField(field, { bypassAutoBind: e.altKey })
                          }
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{getFieldIcon(field.type)}</span>
                            <span className="truncate">{field.name}</span>
                          </span>
                          {showReferenceHint && (
                            <div className="pl-5 text-xs text-muted-foreground truncate">
                              {field.reference}
                            </div>
                          )}
                        </button>
                      ))
                    )}

                    {!showAllFields && advancedFields.length > 0 && (
                      <button
                        className="w-full px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors text-left"
                        onClick={() => setShowAllFields(true)}
                      >
                        显示更多字段（{advancedFields.length}）
                      </button>
                    )}

                    {showAllFields && (
                      <>
                        <div className="px-2 py-1 mt-1 text-[11px] text-muted-foreground">
                          高级字段（可精确引用）
                        </div>
                        {visibleAdvanced.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            无匹配结果
                          </div>
                        ) : (
                          visibleAdvanced.map((field) => (
                            <button
                              key={field.id}
                              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                              onClick={(e) =>
                                handleSelectField(field, { bypassAutoBind: e.altKey })
                              }
                            >
                              <span className="flex items-center gap-1.5">
                                <span>{getFieldIcon(field.type)}</span>
                                <span className="truncate">{field.name}</span>
                              </span>
                              <div className="pl-5 text-xs text-muted-foreground truncate">
                                {field.reference}
                              </div>
                            </button>
                          ))
                        )}
                      </>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}
