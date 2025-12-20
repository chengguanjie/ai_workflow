'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  Play,
  RefreshCw,
  Zap,
  Target,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Square,
  Shield,
  Activity,
  Lightbulb,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useAIAssistantStore, type AIMessage, type NodeAction, type ConversationPhase, type TestResult, type AESReport } from '@/stores/ai-assistant-store'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { NodeConfig } from '@/types/workflow'
import { cn } from '@/lib/utils'

interface AIAssistantPanelProps {
  workflowId: string
}

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

const phaseNames: Record<ConversationPhase, string> = {
  requirement_gathering: '需求收集',
  requirement_clarification: '需求确认',
  workflow_design: '方案设计',
  workflow_generation: '生成工作流',
  testing: '测试验证',
  optimization: '智能优化',
  completed: '已完成',
}

const phaseColors: Record<ConversationPhase, string> = {
  requirement_gathering: 'bg-blue-500',
  requirement_clarification: 'bg-indigo-500',
  workflow_design: 'bg-purple-500',
  workflow_generation: 'bg-violet-500',
  testing: 'bg-amber-500',
  optimization: 'bg-orange-500',
  completed: 'bg-green-500',
}

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
  const [providerConfigs, setProviderConfigs] = useState<AIProviderConfig[]>([])
  const [showTestInput, setShowTestInput] = useState(false)
  const [testInputFields, setTestInputFields] = useState<Record<string, string>>({})
  const [isTesting, setIsTesting] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [targetCriteria, setTargetCriteria] = useState('')
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null)
  const [lastAESReport, setLastAESReport] = useState<AESReport | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
    currentPhase,
    setPhase,
    autoOptimization,
    startAutoOptimization,
    stopAutoOptimization,
    addOptimizationIteration,
    isAutoMode,
    setAutoMode,
  } = useAIAssistantStore()

  const { nodes, edges, addNode, updateNode, onConnect } = useWorkflowStore()

  useEffect(() => {
    if (isOpen) {
      fetchProviderConfigs()
    }
  }, [isOpen])

  const fetchProviderConfigs = async () => {
    setIsLoadingModels(true)
    try {
      // AI 助手使用文本模态
      const response = await fetch('/api/ai/providers?modality=text')
      if (!response.ok) {
        throw new Error('获取服务商配置失败')
      }
      const data = await response.json()
      const providers: AIProviderConfig[] = data.providers || []
      setProviderConfigs(providers)

      if (providers.length > 0) {
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

        const defaultProvider = data.defaultProvider as AIProviderConfig | null
        if (defaultProvider && defaultProvider.models.length > 0) {
          const defaultModel = defaultProvider.defaultModel || defaultProvider.models[0]
          setSelectedModel(`${defaultProvider.id}:${defaultModel}`)
        } else if (providers[0]?.models?.length > 0) {
          const firstModel = providers[0].models[0]
          setSelectedModel(`${providers[0].id}:${firstModel}`)
        }
      } else {
        setAvailableModels([])
      }
    } catch (error) {
      console.error('Failed to fetch AI providers:', error)
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        toast.error('网络请求失败，请检查网络连接')
      } else {
        toast.error(`获取AI服务商配置失败: ${errorMsg}`)
      }
    } finally {
      setIsLoadingModels(false)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

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

      const maxX = window.innerWidth - 450
      const maxY = window.innerHeight - 700

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

  const workflowContext = generateWorkflowContext(nodes, edges)

  const inputNodeFields = useMemo(() => {
    const fields: Array<{ nodeName: string; fieldName: string; required?: boolean }> = []
    nodes.forEach((node) => {
      const data = node.data as NodeConfig
      if (data.type === 'INPUT') {
        const nodeFields = (data.config as { fields?: Array<{ name: string; required?: boolean }> })?.fields || []
        nodeFields.forEach((f) => {
          fields.push({ nodeName: data.name, fieldName: f.name, required: f.required })
        })
      }
    })
    return fields
  }, [nodes])

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
            sourceHandle: action.sourceHandle || null,
            targetHandle: action.targetHandle || null,
          })
        }
      } else if (action.action === 'update' && action.nodeId && action.config) {
        const targetNode = nodes.find((n) => n.id === action.nodeId)
        if (targetNode) {
          const currentConfig = (targetNode.data as NodeConfig).config || {}
          const mergedConfig = { ...currentConfig, ...action.config }
          updateNode(action.nodeId, { config: mergedConfig } as Partial<NodeConfig>)
          const nodeName = action.nodeName || (targetNode.data as NodeConfig).name || action.nodeId
          toast.success(`已更新节点: ${nodeName}`)
        } else {
          toast.error(`未找到节点: ${action.nodeId}`)
        }
      }
    })

    if (addedNodes.length > 0 || actions.some(a => a.action === 'update')) {
      setPhase('testing')
    }
  }, [nodes, addNode, updateNode, onConnect, setPhase])

  const handleSend = useCallback(async (messageContent?: string) => {
    const trimmedInput = (messageContent || inputValue).trim()
    if (!trimmedInput || isLoading) return

    addMessage({ role: 'user', content: trimmedInput })
    if (!messageContent) {
      setInputValue('')
    }
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

      addMessage({
        role: 'assistant',
        content: data.content,
        nodeActions: data.nodeActions,
        questionOptions: data.questionOptions,
        messageType: data.phase === 'workflow_generation' ? 'workflow_generated' : 'normal',
      })

      if (data.phase === 'workflow_generation') {
        setPhase('workflow_generation')
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
  }, [inputValue, isLoading, selectedModel, workflowContext, workflowId, messages, addMessage, setLoading, setPhase])

  const handleTest = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error('工作流为空，请先添加节点')
      return
    }

    setIsTesting(true)
    setPhase('testing')

    const testInput: Record<string, unknown> = {}
    inputNodeFields.forEach((field) => {
      const key = field.fieldName
      if (testInputFields[key]) {
        testInput[key] = testInputFields[key]
      }
    })

    addMessage({
      role: 'system',
      content: `正在执行工作流测试...\n测试输入: ${JSON.stringify(testInput, null, 2)}`,
      messageType: 'test_result',
    })

    try {
      const response = await fetch('/api/ai-assistant/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          testInput,
          timeout: 120,
        }),
      })

      const result = await response.json()
      setLastTestResult(result)

      const statusIcon = result.success ? '✅' : '❌'
      let resultMessage = `${statusIcon} 测试${result.success ? '成功' : '失败'}\n\n`
      
      if (result.duration) {
        resultMessage += `执行时间: ${(result.duration / 1000).toFixed(2)}秒\n`
      }
      
      if (result.totalTokens) {
        resultMessage += `Token消耗: ${result.totalTokens}\n`
      }

      if (result.error) {
        resultMessage += `\n错误信息: ${result.error}\n`
      }

      if (result.analysis) {
        resultMessage += `\n分析:\n${result.analysis}`
      }

      if (result.output && Object.keys(result.output).length > 0) {
        resultMessage += `\n\n输出结果:\n\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\``
      }

      addMessage({
        role: 'assistant',
        content: resultMessage,
        testResult: result,
        messageType: 'test_result',
      })

      if (result.success) {
        toast.success('测试执行成功')
        if (isAutoMode && targetCriteria) {
          handleAutoOptimize(result)
        }
      } else {
        toast.error('测试执行失败')
        if (isAutoMode) {
          handleAutoOptimize(result)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '测试失败'
      toast.error(errorMessage)
      addMessage({
        role: 'assistant',
        content: `测试执行出错: ${errorMessage}`,
        messageType: 'test_result',
      })
    } finally {
      setIsTesting(false)
    }
  }, [nodes, workflowId, testInputFields, inputNodeFields, addMessage, setPhase, isAutoMode, targetCriteria])

  const handleAESEvaluate = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error('工作流为空，请先添加节点')
      return
    }

    setIsEvaluating(true)
    // 评估是一个分析过程，不一定要切换 phase，但为了 UI 一致性，可以设为 optimization
    setPhase('optimization')

    addMessage({
      role: 'system',
      content: '正在进行 AES 全维评估 (Logic, Agentic, Context, Prompt, Robustness)...',
      messageType: 'aes_evaluation',
    })

    try {
      const response = await fetch('/api/ai-assistant/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowContext,
          model: selectedModel,
        }),
      })

      const data = await response.json()
      
      if (data.success && data.evaluation) {
        const report = data.evaluation as AESReport
        setLastAESReport(report)
        
        let reportContent = `## 🛡️ AES 评估报告\n\n`
        reportContent += `**总分**: ${report.scores.total}/100\n\n`
        reportContent += `### 维度得分\n`
        reportContent += `- **L (Logic)**: ${report.scores.L}/30\n`
        reportContent += `- **A (Agentic)**: ${report.scores.A}/25\n`
        reportContent += `- **C (Context)**: ${report.scores.C}/20\n`
        reportContent += `- **P (Prompt)**: ${report.scores.P}/15\n`
        reportContent += `- **R (Robustness)**: ${report.scores.R}/10\n\n`
        
        reportContent += `### 诊断详情\n${report.report}\n`

        if (report.needOptimization) {
          reportContent += `\n> ⚠️ 检测到潜在风险，建议进行优化。`
        }

        addMessage({
          role: 'assistant',
          content: reportContent,
          aesReport: report,
          messageType: 'aes_evaluation',
        })

        if (report.needOptimization) {
          toast.warning('检测到工作流存在优化空间')
        } else {
          toast.success('AES 评估完成，工作流状态良好')
        }
      } else {
         addMessage({
          role: 'assistant',
          content: `AES 评估失败: ${data.error || '未知错误'}`,
          messageType: 'aes_evaluation',
        })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '评估请求失败'
      toast.error(errorMessage)
      addMessage({
        role: 'assistant',
        content: `AES 评估出错: ${errorMessage}`,
        messageType: 'aes_evaluation',
      })
    } finally {
      setIsEvaluating(false)
    }
  }, [nodes, workflowId, workflowContext, selectedModel, addMessage, setPhase])

  const handleOptimize = useCallback(async (type: 'test' | 'aes' = 'test') => {
    if (type === 'test' && !lastTestResult) {
      toast.error('请先执行测试')
      return
    }
    if (type === 'aes' && !lastAESReport) {
      toast.error('请先执行 AES 评估')
      return
    }

    setIsOptimizing(true)
    setPhase('optimization')

    addMessage({
      role: 'system',
      content: type === 'aes' ? '正在根据 AES 评估报告生成优化方案...' : '正在分析执行结果并生成优化建议...',
      messageType: 'optimization',
    })

    try {
      const body: any = {
        workflowId,
        targetCriteria,
        model: selectedModel,
        previousOptimizations: autoOptimization?.history.map(h => h.optimization) || [],
      }

      if (type === 'aes') {
        body.aesDiagnosis = lastAESReport
      } else {
        body.testResult = lastTestResult
      }

      const response = await fetch('/api/ai-assistant/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (data.success && data.optimization) {
        const opt = data.optimization
        
        let optimizationMessage = `## 优化方案 (${type === 'aes' ? '基于AES评估' : '基于测试结果'})\n\n${opt.summary || '分析完成'}\n`

        if (opt.issues && opt.issues.length > 0) {
          optimizationMessage += '\n### 解决的问题\n'
          opt.issues.forEach((issue: { nodeName: string; issue: string; suggestion: string; priority: string }, index: number) => {
            const priorityIcon = issue.priority === 'high' ? '🔴' : issue.priority === 'medium' ? '🟡' : '🟢'
            optimizationMessage += `${index + 1}. ${priorityIcon} **${issue.nodeName}**: ${issue.issue}\n   建议: ${issue.suggestion}\n`
          })
        }

        if (opt.expectedImprovement) {
          optimizationMessage += `\n### 预期效果\n${opt.expectedImprovement}\n`
        }

        addMessage({
          role: 'assistant',
          content: optimizationMessage,
          nodeActions: opt.nodeActions,
          optimizationSuggestion: opt,
          messageType: 'optimization',
        })
        
        // 自动模式仅在基于测试的循环中生效
        if (type === 'test' && opt.nodeActions && opt.nodeActions.length > 0 && isAutoMode) {
          applyNodeActions(opt.nodeActions)
          // ... 自动循环逻辑
        }
      } else {
        addMessage({
          role: 'assistant',
          content: `优化分析失败: ${data.error || '未知错误'}`,
          messageType: 'optimization',
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '优化分析失败'
      toast.error(errorMessage)
      addMessage({
        role: 'assistant',
        content: `优化分析出错: ${errorMessage}`,
        messageType: 'optimization',
      })
    } finally {
      setIsOptimizing(false)
    }
  }, [lastTestResult, lastAESReport, workflowId, targetCriteria, selectedModel, addMessage, setPhase, isAutoMode, autoOptimization, applyNodeActions, addOptimizationIteration, stopAutoOptimization, handleTest])

  const handleAutoOptimize = useCallback(async (testResult: TestResult) => {
    if (!autoOptimization?.isRunning) {
      startAutoOptimization(targetCriteria, 5)
    }

    if (autoOptimization && autoOptimization.currentIteration >= autoOptimization.maxIterations) {
      stopAutoOptimization()
      addMessage({
        role: 'assistant',
        content: `已达到最大优化次数 (${autoOptimization.maxIterations} 次)。请检查工作流配置或调整优化目标。`,
      })
      return
    }

    setLastTestResult(testResult)
    setTimeout(() => handleOptimize(), 1000)
  }, [autoOptimization, targetCriteria, startAutoOptimization, stopAutoOptimization, addMessage, handleOptimize])

  const handleStartAutoLoop = useCallback(() => {
    if (!targetCriteria.trim()) {
      toast.error('请先输入优化目标')
      return
    }
    setAutoMode(true)
    startAutoOptimization(targetCriteria, 5)
    handleTest()
  }, [targetCriteria, setAutoMode, startAutoOptimization, handleTest])

  const handleStopAutoLoop = useCallback(() => {
    setAutoMode(false)
    stopAutoOptimization()
    toast.info('已停止自动优化')
  }, [setAutoMode, stopAutoOptimization])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleNewConversation = useCallback(() => {
    createConversation(workflowId)
    setLastTestResult(null)
  }, [createConversation, workflowId])

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

  const workflowConversations = conversations.filter(c => c.workflowId === workflowId)

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 flex h-[700px] w-[450px] flex-col rounded-xl border bg-background shadow-2xl",
        !position && "bottom-4 right-4"
      )}
      style={panelStyle}
    >
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
            <h3 className="text-sm font-semibold">AI 工作流助手</h3>
            <div className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", phaseColors[currentPhase])} />
              <span className="text-xs text-muted-foreground">{phaseNames[currentPhase]}</span>
            </div>
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
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

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
                        <Badge variant="outline" className="h-4 text-[10px]">
                          {phaseNames[conv.phase]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="border-b">
            <button
              className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowContext(!showContext)}
            >
              <span>画布上下文信息</span>
              {showContext ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showContext && (
              <div className="max-h-32 overflow-auto border-t bg-muted/30 px-4 py-2">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {workflowContext}
                </pre>
              </div>
            )}
          </div>

          {nodes.length > 0 && (
            <div className="border-b">
              <Collapsible open={showTestInput} onOpenChange={setShowTestInput}>
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-amber-500" />
                    <span className="font-medium">测试与优化</span>
                  </div>
                  {showTestInput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t bg-muted/20 px-4 py-3 space-y-3">
                  {inputNodeFields.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">测试输入</Label>
                      {inputNodeFields.map((field, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-24 truncate" title={`${field.nodeName}.${field.fieldName}`}>
                            {field.fieldName}
                            {field.required && <span className="text-red-500">*</span>}
                          </span>
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder={`输入 ${field.fieldName}`}
                            value={testInputFields[field.fieldName] || ''}
                            onChange={(e) => setTestInputFields(prev => ({ ...prev, [field.fieldName]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">优化目标（可选）</Label>
                    <Textarea
                      className="min-h-[60px] text-xs resize-none"
                      placeholder="描述期望的输出效果，例如：输出应该更加专业、格式需要是Markdown表格..."
                      value={targetCriteria}
                      onChange={(e) => setTargetCriteria(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="auto-mode"
                        checked={isAutoMode}
                        onCheckedChange={setAutoMode}
                        disabled={autoOptimization?.isRunning}
                      />
                      <Label htmlFor="auto-mode" className="text-xs cursor-pointer">
                        自动优化模式
                      </Label>
                    </div>
                    {autoOptimization?.isRunning && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs text-muted-foreground">
                          第 {autoOptimization.currentIteration}/{autoOptimization.maxIterations} 轮
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={handleTest}
                      disabled={isTesting || isOptimizing || isEvaluating}
                    >
                      {isTesting ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />测试中</>
                      ) : (
                        <><Play className="mr-1 h-3 w-3" />执行测试</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={handleAESEvaluate}
                      disabled={isTesting || isOptimizing || isEvaluating}
                    >
                      {isEvaluating ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />评估中</>
                      ) : (
                        <><Shield className="mr-1 h-3 w-3" />AES 评估</>
                      )}
                    </Button>
                    {lastTestResult && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        onClick={() => handleOptimize('test')}
                        disabled={isTesting || isOptimizing || isEvaluating}
                      >
                        {isOptimizing ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" />分析中</>
                        ) : (
                          <><RefreshCw className="mr-1 h-3 w-3" />智能优化</>
                        )}
                      </Button>
                    )}
                  </div>

                  {isAutoMode && !autoOptimization?.isRunning && (
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                      onClick={handleStartAutoLoop}
                      disabled={isTesting || isOptimizing}
                    >
                      <Target className="mr-1 h-3 w-3" />
                      启动自动优化循环
                    </Button>
                  )}

                  {autoOptimization?.isRunning && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full h-8 text-xs"
                      onClick={handleStopAutoLoop}
                    >
                      <Square className="mr-1 h-3 w-3" />
                      停止自动优化
                    </Button>
                  )}

                  {autoOptimization && autoOptimization.history.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">优化历史</Label>
                      <div className="max-h-20 overflow-y-auto space-y-1">
                        {autoOptimization.history.map((item, index) => (
                          <div key={index} className="flex items-center gap-2 text-xs">
                            {item.testResult.success ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-500" />
                            )}
                            <span>第 {item.iteration} 轮</span>
                            {item.applied && <Badge variant="secondary" className="h-4 text-[10px]">已应用</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100">
                  <Bot className="h-8 w-8 text-violet-600" />
                </div>
                <h4 className="mb-2 font-medium">你好！我是AI工作流助手</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  告诉我你想要实现什么，我会引导你<br />
                  完成需求分析并自动生成工作流
                </p>
                <div className="space-y-2 text-xs text-muted-foreground w-full px-4">
                  <p>试试描述你的需求：</p>
                  <div className="space-y-1">
                    <button
                      className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => setInputValue('我想做一个客服问答系统，可以自动回复用户的问题')}
                    >
                      我想做一个客服问答系统
                    </button>
                    <button
                      className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => setInputValue('帮我创建一个文档自动生成的工作流')}
                    >
                      帮我创建一个文档自动生成的工作流
                    </button>
                    <button
                      className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => setInputValue('我需要一个数据分析报告生成器')}
                    >
                      我需要一个数据分析报告生成器
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
                    onSelectOption={handleSend}
                    onOptimize={handleOptimize}
                    isLoading={isLoading}
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

          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={availableModels.length === 0 ? "请先配置AI服务商..." : "描述你的需求或提问..."}
                className="min-h-[60px] resize-none"
                disabled={isLoading || availableModels.length === 0}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isLoading || !selectedModel}
                className="h-auto px-4"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              按 Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  onApplyActions,
  onSelectOption,
  onOptimize,
  isLoading,
}: {
  message: AIMessage
  onApplyActions: (actions: NodeAction[]) => void
  onSelectOption: (answer: string) => void
  onOptimize?: (type: 'test' | 'aes') => void
  isLoading: boolean
}) {
  const [applied, setApplied] = useState(false)
  const [copied, setCopied] = useState(false)
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

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

  const handleOptionClick = (questionId: string, optionId: string, optionLabel: string, allowInput?: boolean) => {
    if (allowInput) {
      setSelectedOptions(prev => ({ ...prev, [questionId]: optionId }))
    } else {
      setSelectedOptions(prev => ({ ...prev, [questionId]: optionId }))
    }
  }

  const handleSubmitAnswers = () => {
    if (!message.questionOptions) return
    
    const answers: string[] = []
    message.questionOptions.questions.forEach((q) => {
      const selectedId = selectedOptions[q.id]
      if (selectedId) {
        const option = q.options.find(o => o.id === selectedId)
        if (option) {
          if (option.allowInput && customInputs[q.id]) {
            answers.push(`${q.question}: ${customInputs[q.id]}`)
          } else {
            answers.push(`${q.question}: ${option.label}`)
          }
        }
      }
    })
    
    if (answers.length > 0) {
      onSelectOption(answers.join('\n'))
    }
  }

  const allQuestionsAnswered = message.questionOptions?.questions.every(q => {
    const selectedId = selectedOptions[q.id]
    if (!selectedId) return false
    const option = q.options.find(o => o.id === selectedId)
    if (option?.allowInput) {
      return !!customInputs[q.id]?.trim()
    }
    return true
  })

  const getMessageIcon = () => {
    if (isUser) return <User className="h-4 w-4" />
    if (isSystem) {
      switch (message.messageType) {
        case 'test_result':
          return <Play className="h-4 w-4" />
        case 'optimization':
          return <RefreshCw className="h-4 w-4" />
        case 'aes_evaluation':
          return <Shield className="h-4 w-4" />
        default:
          return <AlertCircle className="h-4 w-4" />
      }
    }
    return <Bot className="h-4 w-4 text-white" />
  }

  const getIconBackground = () => {
    if (isUser) return 'bg-primary text-primary-foreground'
    if (isSystem) {
      switch (message.messageType) {
        case 'test_result':
          return 'bg-amber-500'
        case 'optimization':
          return 'bg-orange-500'
        case 'aes_evaluation':
          return 'bg-blue-600'
        default:
          return 'bg-slate-500'
      }
    }
    return 'bg-gradient-to-br from-violet-500 to-purple-600'
  }

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white',
          getIconBackground()
        )}
      >
        {getMessageIcon()}
      </div>
      <div
        className={cn(
          'group relative max-w-[85%] rounded-lg px-4 py-3',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>

        {message.aesReport && (
          <div className="mt-3 border-t pt-3">
             <div className="flex items-center gap-2 mb-2">
               <Activity className="h-4 w-4 text-blue-500" />
               <span className="text-xs font-medium">评估得分: {message.aesReport.scores.total} 分</span>
             </div>
             <div className="grid grid-cols-5 gap-1 text-[10px] text-center mb-2">
               <div className="bg-muted p-1 rounded">L: {message.aesReport.scores.L}</div>
               <div className="bg-muted p-1 rounded">A: {message.aesReport.scores.A}</div>
               <div className="bg-muted p-1 rounded">C: {message.aesReport.scores.C}</div>
               <div className="bg-muted p-1 rounded">P: {message.aesReport.scores.P}</div>
               <div className="bg-muted p-1 rounded">R: {message.aesReport.scores.R}</div>
             </div>
          </div>
        )}

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

        {!isUser && message.questionOptions && message.questionOptions.questions.length > 0 && (
          <div className="mt-4 space-y-4">
            {message.questionOptions.questions.map((question) => (
              <div key={question.id} className="space-y-2">
                <div className="text-xs font-medium text-foreground">{question.question}</div>
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => {
                    const isSelected = selectedOptions[question.id] === option.id
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleOptionClick(question.id, option.id, option.label, option.allowInput)}
                        disabled={isLoading}
                        className={cn(
                          'flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950',
                          isSelected
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-950 ring-1 ring-violet-500'
                            : 'border-border bg-background',
                          isLoading && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span className="text-xs font-medium">{option.label}</span>
                        {option.description && (
                          <span className="text-[10px] text-muted-foreground">{option.description}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {selectedOptions[question.id] && 
                  question.options.find(o => o.id === selectedOptions[question.id])?.allowInput && (
                  <Input
                    className="mt-2 h-8 text-xs"
                    placeholder="请输入你的描述..."
                    value={customInputs[question.id] || ''}
                    onChange={(e) => setCustomInputs(prev => ({ ...prev, [question.id]: e.target.value }))}
                    disabled={isLoading}
                  />
                )}
              </div>
            ))}
            <Button
              size="sm"
              className="w-full h-8 text-xs bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              onClick={handleSubmitAnswers}
              disabled={!allQuestionsAnswered || isLoading}
            >
              {isLoading ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" />处理中...</>
              ) : (
                <><Send className="mr-1 h-3 w-3" />提交回答</>
              )}
            </Button>
          </div>
        )}

        {!isUser && message.nodeActions && message.nodeActions.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 text-xs font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-violet-500" />
              生成的工作流操作：
            </div>
            <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
              {message.nodeActions.map((action, index) => (
                <div key={index} className="flex items-center gap-2 text-muted-foreground">
                  {action.action === 'add' && <Plus className="h-3 w-3 text-green-500" />}
                  {action.action === 'update' && <RefreshCw className="h-3 w-3 text-blue-500" />}
                  {action.action === 'connect' && <ArrowRight className="h-3 w-3 text-purple-500" />}
                  <span>
                    {action.action === 'add' && `添加 ${nodeTypeNames[action.nodeType || ''] || action.nodeType}: "${action.nodeName}"`}
                    {action.action === 'update' && `更新 "${action.nodeName}"`}
                    {action.action === 'connect' && `连接 ${action.source} → ${action.target}`}
                  </span>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant={applied ? 'outline' : 'default'}
              className="mt-2 h-7 text-xs w-full"
              onClick={handleApply}
              disabled={applied}
            >
              {applied ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  已应用到画布
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  一键应用到画布
                </>
              )}
            </Button>
          </div>
        )}

        {message.testResult && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center gap-2 text-xs">
              {message.testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium">
                测试{message.testResult.success ? '成功' : '失败'}
              </span>
              {message.testResult.duration && (
                <span className="text-muted-foreground">
                  {(message.testResult.duration / 1000).toFixed(2)}s
                </span>
              )}
            </div>
          </div>
        )}

        {message.aesReport && message.aesReport.needOptimization && (
          <div className="mt-3 border-t pt-3">
            <Button
              size="sm"
              className="h-7 text-xs w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              onClick={() => onOptimize?.('aes')}
            >
              <Lightbulb className="mr-1 h-3 w-3" />
              生成优化方案
            </Button>
          </div>
        )}

        {message.optimizationSuggestion && message.nodeActions && message.nodeActions.length > 0 && !applied && (
          <div className="mt-3 border-t pt-3">
            <Button
              size="sm"
              className="h-7 text-xs w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              onClick={handleApply}
            >
              <Zap className="mr-1 h-3 w-3" />
              应用优化建议
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type.toUpperCase()) {
    case 'TRIGGER':
      return { triggerType: 'MANUAL', enabled: true }
    case 'INPUT':
      return { fields: [] }
    case 'PROCESS':
      return {
        systemPrompt: '',
        userPrompt: '',
        temperature: 0.7,
        maxTokens: 2048,
      }
    case 'CODE':
      return {
        prompt: '',
        language: 'javascript',
        code: '',
      }
    case 'OUTPUT':
      return {
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
    case 'IMAGE_GEN':
      return { prompt: '', size: '1024x1024', quality: 'standard', n: 1 }
    case 'SWITCH':
      return { switchVariable: '', cases: [], matchType: 'exact' }
    default:
      return {}
  }
}
