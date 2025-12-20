'use client'

/**
 * AI助手面板
 * 提供AI对话功能，支持工作流配置指导和自动生成节点
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  X,
  Send,
  Loader2,
  Bot,
  User,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  AlertCircle,
  Settings,
  GripVertical,
  History,
  MessageSquarePlus,
  ChevronLeft,
  Clock,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useAIAssistantStore, type AIMessage, type NodeAction } from '@/stores/ai-assistant-store'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { NodeConfig } from '@/types/workflow'
import { cn } from '@/lib/utils'

interface AIAssistantPanelProps {
  workflowId: string
}

// 生成画布上下文信息
function generateWorkflowContext(
  nodes: ReturnType<typeof useWorkflowStore.getState>['nodes'],
  edges: ReturnType<typeof useWorkflowStore.getState>['edges']
): string {
  if (nodes.length === 0) {
    return '当前画布为空，没有任何节点。'
  }

  const nodeDescriptions = nodes.map((node) => {
    const data = node.data as NodeConfig
    const config = data.config || {}

    let configSummary = ''
    switch (data.type) {
      case 'INPUT':
        const fields = (config as { fields?: { name: string; value: string }[] }).fields || []
        configSummary = `输入字段: ${fields.map((f) => f.name).join(', ') || '无'}`
        break
      case 'PROCESS':
        const proc = config as { systemPrompt?: string; userPrompt?: string; model?: string }
        configSummary = `模型: ${proc.model || '未设置'}, 系统提示词: ${proc.systemPrompt ? '已设置' : '未设置'}, 用户提示词: ${proc.userPrompt ? '已设置' : '未设置'}`
        break
      case 'OUTPUT':
        const out = config as { format?: string; prompt?: string }
        configSummary = `输出格式: ${out.format || 'text'}, 输出提示词: ${out.prompt ? '已设置' : '未设置'}`
        break
      case 'CODE':
        const code = config as { language?: string; code?: string }
        configSummary = `语言: ${code.language || 'javascript'}, 代码: ${code.code ? '已设置' : '未设置'}`
        break
      case 'CONDITION':
        const cond = config as { conditions?: unknown[] }
        configSummary = `条件数量: ${cond.conditions?.length || 0}`
        break
      case 'LOOP':
        const loop = config as { loopType?: string; maxIterations?: number }
        configSummary = `循环类型: ${loop.loopType || 'FOR'}, 最大迭代: ${loop.maxIterations || 1000}`
        break
      case 'HTTP':
        const http = config as { method?: string; url?: string }
        configSummary = `方法: ${http.method || 'GET'}, URL: ${http.url || '未设置'}`
        break
      default:
        configSummary = JSON.stringify(config).slice(0, 100)
    }

    return `- 节点 "${data.name}" (ID: ${node.id}, 类型: ${data.type})\n  位置: (${Math.round(node.position.x)}, ${Math.round(node.position.y)})\n  配置: ${configSummary}`
  }).join('\n')

  const edgeDescriptions = edges.length > 0
    ? edges.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source)
        const targetNode = nodes.find((n) => n.id === edge.target)
        return `- ${sourceNode?.data?.name || edge.source} → ${targetNode?.data?.name || edge.target}`
      }).join('\n')
    : '无连接'

  return `当前工作流状态：
节点数量: ${nodes.length}
连接数量: ${edges.length}

节点详情:
${nodeDescriptions}

连接关系:
${edgeDescriptions}`
}

// 节点类型名称映射
const nodeTypeNames: Record<string, string> = {
  INPUT: '输入节点',
  PROCESS: '文本处理节点',
  CODE: '代码节点',
  OUTPUT: '输出节点',
  DATA: '数据节点',
  IMAGE: '图片节点',
  VIDEO: '视频节点',
  AUDIO: '音频节点',
  CONDITION: '条件节点',
  LOOP: '循环节点',
  SWITCH: '分支节点',
  HTTP: 'HTTP请求节点',
  MERGE: '合并节点',
  IMAGE_GEN: '图片生成节点',
  NOTIFICATION: '通知节点',
  TRIGGER: '触发器节点',
}

// API返回的服务商配置类型
interface AIProviderConfig {
  id: string
  name: string
  provider: string
  baseUrl: string
  defaultModel: string | null
  models: string[]
  isDefault: boolean
  displayName: string
}

export function AIAssistantPanel({ workflowId }: AIAssistantPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const [showContext, setShowContext] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [providerConfigs, setProviderConfigs] = useState<AIProviderConfig[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 拖动相关状态
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    isOpen,
    closePanel,
    messages,
    isLoading,
    selectedModel,
    availableModels,
    addMessage,
    clearMessages,
    setLoading,
    setSelectedModel,
    setAvailableModels,
    showHistory,
    toggleHistory,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
  } = useAIAssistantStore()

  const { nodes, edges, addNode, updateNode, onConnect } = useWorkflowStore()

  // 获取企业AI服务商配置
  useEffect(() => {
    if (isOpen) {
      fetchProviderConfigs()
    }
  }, [isOpen])

  const fetchProviderConfigs = async () => {
    setIsLoadingModels(true)
    try {
      const response = await fetch('/api/ai/providers')
      if (!response.ok) {
        throw new Error('获取服务商配置失败')
      }
      const data = await response.json()
      const providers: AIProviderConfig[] = data.providers || []
      setProviderConfigs(providers)

      if (providers.length > 0) {
        // 构建模型列表
        const models: { id: string; name: string; provider: string; configId: string }[] = []
        providers.forEach((config) => {
          config.models.forEach((model) => {
            models.push({
              id: `${config.id}:${model}`,
              name: model,
              provider: config.displayName,
              configId: config.id,
            })
          })
        })

        setAvailableModels(models)

        // 设置默认选择
        const defaultProvider = data.defaultProvider as AIProviderConfig | null
        if (defaultProvider && defaultProvider.models.length > 0) {
          const defaultModel = defaultProvider.defaultModel || defaultProvider.models[0]
          setSelectedConfigId(defaultProvider.id)
          setSelectedModel(`${defaultProvider.id}:${defaultModel}`)
        } else if (providers[0]?.models?.length > 0) {
          const firstModel = providers[0].models[0]
          setSelectedConfigId(providers[0].id)
          setSelectedModel(`${providers[0].id}:${firstModel}`)
        }
      } else {
        setAvailableModels([])
      }
    } catch (error) {
      console.error('Failed to fetch AI providers:', error)
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        toast.error('网络请求失败，请检查网络连接或禁用可能干扰请求的浏览器扩展')
      } else {
        toast.error(`获取AI服务商配置失败: ${errorMsg}`)
      }
    } finally {
      setIsLoadingModels(false)
    }
  }

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 打开面板时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // 拖动事件处理
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return
    e.preventDefault()

    const rect = panelRef.current.getBoundingClientRect()
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffsetRef.current.x
      const newY = e.clientY - dragOffsetRef.current.y

      // 限制在窗口范围内
      const maxX = window.innerWidth - 420
      const maxY = window.innerHeight - 600

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // 计算面板样式
  const panelStyle = useMemo(() => {
    if (position) {
      return {
        left: position.x,
        top: position.y,
        right: 'auto',
        bottom: 'auto',
      }
    }
    return {}
  }, [position])

  // 生成上下文
  const workflowContext = generateWorkflowContext(nodes, edges)

  // 应用节点操作
  const applyNodeActions = useCallback((actions: NodeAction[]) => {
    const addedNodes: string[] = []

    actions.forEach((action) => {
      if (action.action === 'add' && action.nodeType && action.nodeName) {
        const nodeId = `${action.nodeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
        const position = action.position || {
          x: 100 + Math.random() * 200,
          y: 100 + nodes.length * 150,
        }

        addNode({
          id: nodeId,
          type: action.nodeType as NodeConfig['type'],
          name: action.nodeName,
          position,
          config: action.config || getDefaultConfig(action.nodeType),
        } as NodeConfig)

        addedNodes.push(nodeId)
        toast.success(`已添加节点: ${action.nodeName}`)
      } else if (action.action === 'connect' && action.source && action.target) {
        // 使用添加的节点ID或原始ID
        const sourceId = action.source.startsWith('new_')
          ? addedNodes[parseInt(action.source.replace('new_', '')) - 1]
          : action.source
        const targetId = action.target.startsWith('new_')
          ? addedNodes[parseInt(action.target.replace('new_', '')) - 1]
          : action.target

        if (sourceId && targetId) {
          onConnect({
            source: sourceId,
            target: targetId,
            sourceHandle: null,
            targetHandle: null,
          })
        }
      } else if (action.action === 'update' && action.nodeId && action.config) {
        // 更新现有节点的配置
        const targetNode = nodes.find((n) => n.id === action.nodeId)
        if (targetNode) {
          const currentConfig = (targetNode.data as NodeConfig).config || {}
          // 合并现有配置和新配置
          const mergedConfig = { ...currentConfig, ...action.config }
          updateNode(action.nodeId, { config: mergedConfig } as Partial<NodeConfig>)
          const nodeName = action.nodeName || (targetNode.data as NodeConfig).name || action.nodeId
          toast.success(`已更新节点: ${nodeName}`)
        } else {
          toast.error(`未找到节点: ${action.nodeId}`)
        }
      }
    })
  }, [nodes, addNode, updateNode, onConnect])

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || isLoading) return

    // 添加用户消息
    addMessage({ role: 'user', content: trimmedInput })
    setInputValue('')
    setLoading(true)

    try {
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          model: selectedModel,
          workflowContext,
          workflowId,
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '请求失败')
      }

      const data = await response.json()

      // 添加AI响应
      addMessage({
        role: 'assistant',
        content: data.content,
        nodeActions: data.nodeActions,
      })

      // 如果有节点操作，询问用户是否应用
      if (data.nodeActions && data.nodeActions.length > 0) {
        // 节点操作会在消息中显示，用户可以选择应用
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI请求失败'
      toast.error(errorMessage)
      addMessage({
        role: 'assistant',
        content: `抱歉，请求出错了：${errorMessage}\n\n请检查：\n1. AI服务商配置是否正确\n2. 模型名称是否有效\n3. API Key是否有效`,
      })
    } finally {
      setLoading(false)
    }
  }, [inputValue, isLoading, selectedModel, workflowContext, workflowId, messages, addMessage, setLoading])

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 新建对话
  const handleNewConversation = useCallback(() => {
    createConversation(workflowId)
  }, [createConversation, workflowId])

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return '昨天'
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  }

  // 当前工作流的对话
  const workflowConversations = conversations.filter(c => c.workflowId === workflowId)

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 flex h-[600px] w-[420px] flex-col rounded-xl border bg-background shadow-2xl",
        !position && "bottom-4 right-4"
      )}
      style={panelStyle}
    >
      {/* 头部 - 可拖动区域 */}
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 py-3",
          "cursor-move select-none",
          isDragging && "cursor-grabbing"
        )}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI 助手</h3>
            <p className="text-xs text-muted-foreground">工作流配置助手</p>
          </div>
        </div>
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewConversation}
            title="新建对话"
            className="h-8 w-8"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="icon"
            onClick={toggleHistory}
            title="历史记录"
            className="h-8 w-8"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={clearMessages} title="清空对话" className="h-8 w-8">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={closePanel} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 模型选择 */}
      <div className="border-b px-4 py-2">
        {isLoadingModels ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>加载模型配置...</span>
          </div>
        ) : availableModels.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertCircle className="h-3 w-3" />
            <span>未配置AI服务商</span>
            <Link
              href="/settings/ai-config"
              className="ml-auto flex items-center gap-1 text-primary hover:underline"
            >
              <Settings className="h-3 w-3" />
              前往设置
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">模型:</span>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {providerConfigs.map((config) => (
                  <div key={config.id}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {config.displayName}
                      {config.isDefault && (
                        <span className="ml-1 text-primary">(默认)</span>
                      )}
                    </div>
                    {config.models.map((model) => (
                      <SelectItem
                        key={`${config.id}:${model}`}
                        value={`${config.id}:${model}`}
                        className="text-xs pl-4"
                      >
                        {model}
                        {config.defaultModel === model && (
                          <span className="ml-1 text-muted-foreground">(默认)</span>
                        )}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 历史记录视图 */}
      {showHistory ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={toggleHistory}
            >
              <ChevronLeft className="h-3 w-3" />
              返回对话
            </button>
            <span className="text-xs text-muted-foreground">
              {workflowConversations.length} 条对话
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {workflowConversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                <History className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无历史对话</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  点击新建对话开始
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {workflowConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50",
                      currentConversationId === conv.id && "bg-muted/50"
                    )}
                    onClick={() => selectConversation(conv.id)}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-purple-100">
                      <Bot className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-sm font-medium">{conv.title}</h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteConversation(conv.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(conv.updatedAt)}</span>
                        <span>·</span>
                        <span>{conv.messages.length} 条消息</span>
                      </div>
                      {conv.messages.length > 0 && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {conv.messages[conv.messages.length - 1]?.content.slice(0, 50)}
                          {(conv.messages[conv.messages.length - 1]?.content.length || 0) > 50 ? '...' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 上下文展示 */}
          <div className="border-b">
            <button
              className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowContext(!showContext)}
            >
              <span>画布上下文信息</span>
              {showContext ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showContext && (
              <div className="max-h-40 overflow-auto border-t bg-muted/30 px-4 py-2">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {workflowContext}
                </pre>
              </div>
            )}
          </div>

          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100">
                  <Bot className="h-8 w-8 text-violet-600" />
                </div>
                <h4 className="mb-2 font-medium">你好！我是工作流AI助手</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  我可以帮助你配置节点、设计工作流，<br />
                  或者根据你的需求自动生成节点。
                </p>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>试试问我：</p>
                  <div className="space-y-1">
                    <button
                      className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => setInputValue('帮我创建一个简单的文本处理工作流')}
                    >
                      帮我创建一个简单的文本处理工作流
                    </button>
                    <button
                      className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => setInputValue('如何配置输入节点的字段？')}
                    >
                      如何配置输入节点的字段？
                    </button>
                    <button
                      className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => setInputValue('我想做一个数据处理然后发送通知的流程')}
                    >
                      我想做一个数据处理然后发送通知的流程
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onApplyActions={applyNodeActions}
                  />
                ))}
                {isLoading && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">思考中...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={availableModels.length === 0 ? "请先配置AI服务商..." : "输入你的问题或需求..."}
                className="min-h-[60px] resize-none"
                disabled={isLoading || availableModels.length === 0}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || !selectedModel}
                className="h-auto px-4"
                title={!selectedModel ? "请先选择AI模型" : ""}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {availableModels.length === 0 ? "请先在设置中配置AI服务商" : "按 Enter 发送，Shift + Enter 换行"}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// 消息气泡组件
function MessageBubble({
  message,
  onApplyActions,
}: {
  message: AIMessage
  onApplyActions: (actions: NodeAction[]) => void
}) {
  const [applied, setApplied] = useState(false)
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleApply = () => {
    if (message.nodeActions) {
      onApplyActions(message.nodeActions)
      setApplied(true)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败')
    }
  }

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-br from-violet-500 to-purple-600'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div
        className={cn(
          'group relative max-w-[85%] rounded-lg px-4 py-3',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>

        {/* 复制按钮 - 仅AI消息显示，位于右下角 */}
        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-1 -bottom-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 bg-background border shadow-sm"
            onClick={handleCopy}
            title="复制内容"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}

        {/* 节点操作按钮 */}
        {!isUser && message.nodeActions && message.nodeActions.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 text-xs font-medium">建议的节点操作：</div>
            <div className="space-y-1 text-xs">
              {message.nodeActions.map((action, index) => (
                <div key={index} className="flex items-center gap-2 text-muted-foreground">
                  <Plus className="h-3 w-3" />
                  <span>
                    {action.action === 'add' && `添加 ${nodeTypeNames[action.nodeType || ''] || action.nodeType}: "${action.nodeName}"`}
                    {action.action === 'connect' && `连接 ${action.source} → ${action.target}`}
                  </span>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant={applied ? 'outline' : 'default'}
              className="mt-2 h-7 text-xs"
              onClick={handleApply}
              disabled={applied}
            >
              {applied ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  已应用
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  应用到画布
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// 获取默认节点配置
function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type.toUpperCase()) {
    case 'INPUT':
      return { fields: [] }
    case 'PROCESS':
      return {
        provider: 'OPENROUTER',
        model: 'deepseek/deepseek-chat',
        knowledgeItems: [],
        systemPrompt: '',
        userPrompt: '',
        temperature: 0.7,
        maxTokens: 2048,
      }
    case 'CODE':
      return {
        provider: 'OPENROUTER',
        model: 'deepseek/deepseek-coder',
        prompt: '',
        language: 'javascript',
        code: '',
      }
    case 'OUTPUT':
      return {
        provider: 'OPENROUTER',
        model: 'deepseek/deepseek-chat',
        prompt: '',
        format: 'text',
        templateName: '',
      }
    case 'CONDITION':
      return { conditions: [], evaluationMode: 'all' }
    case 'LOOP':
      return { loopType: 'FOR', maxIterations: 100 }
    case 'HTTP':
      return { method: 'GET', url: '', headers: {}, timeout: 30000 }
    case 'MERGE':
      return { mergeStrategy: 'all', errorStrategy: 'fail_fast' }
    case 'NOTIFICATION':
      return { platform: 'feishu', webhookUrl: '', messageType: 'text', content: '' }
    default:
      return {}
  }
}
