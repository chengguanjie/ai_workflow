'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Save, Play, ArrowLeft, Loader2, Cloud, CloudOff, History, Link2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NodePanel } from '@/components/workflow/node-panel'
import { NodeConfigPanel } from '@/components/workflow/node-config-panel'
import { ExecutionPanel } from '@/components/workflow/execution-panel'
import { ExecutionHistoryPanel } from '@/components/workflow/execution-history-panel'
import { nodeTypes } from '@/components/workflow/nodes'
import { toast } from 'sonner'

function WorkflowEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setViewport: setReactFlowViewport } = useReactFlow()
  const params = useParams()
  const workflowId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [showExecutionPanel, setShowExecutionPanel] = useState(false)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const {
    nodes,
    edges,
    viewport,
    name,
    description,
    isDirty,
    setWorkflow,
    setName,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectedNodeId,
    getWorkflowConfig,
    markSaved,
    setViewport,
  } = useWorkflowStore()

  // 加载工作流数据
  useEffect(() => {
    const loadWorkflow = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}`)
        if (!response.ok) {
          throw new Error('加载工作流失败')
        }
        const workflow = await response.json()

        // 使用 setWorkflow 初始化 store
        setWorkflow({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description || '',
          ...workflow.config,
        })

        // 恢复 viewport
        setTimeout(() => {
          const savedViewport = useWorkflowStore.getState().viewport
          if (savedViewport && (savedViewport.x !== 0 || savedViewport.y !== 0 || savedViewport.zoom !== 1)) {
            setReactFlowViewport(savedViewport)
          }
        }, 50)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '加载工作流失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkflow()
  }, [workflowId, setWorkflow]) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动保存到数据库
  const autoSaveToDb = useCallback(async (silent = true) => {
    if (!workflowId || !name.trim() || nodes.length === 0) return

    setSaveStatus('saving')
    try {
      const config = getWorkflowConfig()
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, config }),
      })

      if (!response.ok) {
        throw new Error('保存失败')
      }

      markSaved()
      setSaveStatus('saved')
      if (!silent) {
        toast.success('工作流已保存')
      }
    } catch (error) {
      setSaveStatus('unsaved')
      if (!silent) {
        toast.error(error instanceof Error ? error.message : '保存失败')
      }
    }
  }, [workflowId, name, description, nodes, getWorkflowConfig, markSaved])

  // 监听数据变化，触发自动保存
  useEffect(() => {
    if (isLoading) return

    if (!isDirty) {
      setSaveStatus('saved')
      return
    }

    setSaveStatus('unsaved')

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // 3秒后自动保存到数据库
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveToDb(true)
    }, 3000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [isDirty, isLoading, autoSaveToDb])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error('请输入工作流名称')
      return
    }

    if (nodes.length === 0) {
      toast.error('工作流至少需要一个节点')
      return
    }

    setIsSaving(true)
    setSaveStatus('saving')
    try {
      const config = getWorkflowConfig()

      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, config }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '保存失败')
      }

      markSaved()
      setSaveStatus('saved')
      toast.success('工作流已保存')
    } catch (error) {
      setSaveStatus('unsaved')
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }, [workflowId, name, description, nodes, getWorkflowConfig, markSaved])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const nodeId = `${type}_${Date.now()}`

      addNode({
        id: nodeId,
        type: type.toUpperCase() as 'INPUT' | 'PROCESS' | 'CODE' | 'OUTPUT',
        name: getNodeName(type),
        position,
        config: getDefaultConfig(type),
      } as never)
    },
    [screenToFlowPosition, addNode]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // 复制 API 调用链接
  const copyApiUrl = useCallback(async () => {
    const apiUrl = `${window.location.origin}/api/v1/workflows/${workflowId}/execute`
    await navigator.clipboard.writeText(apiUrl)
    toast.success('已复制 API 调用链接')
  }, [workflowId])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* 左侧工具栏 */}
      <div className="flex w-14 flex-col items-center border-r bg-background py-4">
        <Link href="/workflows">
          <Button variant="ghost" size="icon" className="mb-4">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={handleSave} disabled={isSaving} className="mb-2" title="保存">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowExecutionPanel(true)}
          disabled={nodes.length === 0}
          title="执行工作流"
          className="text-green-600 hover:text-green-700 hover:bg-green-50"
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowHistoryPanel(true)}
          title="执行历史"
          className="mt-2"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={copyApiUrl}
          title="复制 API 链接"
          className="mt-2"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 编辑器主体 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部名称输入 */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64 border-none bg-transparent text-lg font-semibold focus-visible:ring-0"
            placeholder="工作流名称"
          />
          {/* 保存状态指示器 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>保存中...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Cloud className="h-4 w-4 text-green-500" />
                <span>已保存</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <CloudOff className="h-4 w-4 text-orange-500" />
                <span>未保存</span>
              </>
            )}
          </div>
        </div>

        {/* 中间区域：画布和右侧配置面板 */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 中间画布 */}
          <div ref={reactFlowWrapper} className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onViewportChange={setViewport}
              defaultViewport={viewport}
              nodeTypes={nodeTypes}
              snapToGrid
              snapGrid={[15, 15]}
            >
              <Background gap={15} />
              <Controls />
              <MiniMap />
              <Panel position="top-left" className="text-xs text-muted-foreground">
                节点: {nodes.length} | 连接: {edges.length}
              </Panel>
            </ReactFlow>
          </div>

          {/* 右侧配置面板 */}
          {selectedNodeId && <NodeConfigPanel />}
        </div>

        {/* 底部节点面板 */}
        <NodePanel />
      </div>

      {/* 执行面板 */}
      <ExecutionPanel
        workflowId={workflowId}
        isOpen={showExecutionPanel}
        onClose={() => setShowExecutionPanel(false)}
      />

      {/* 执行历史面板 */}
      <ExecutionHistoryPanel
        workflowId={workflowId}
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
      />
    </div>
  )
}

function getNodeName(type: string): string {
  const names: Record<string, string> = {
    input: '输入',
    process: '文本',
    code: '代码',
    output: '输出',
    data: '数据',
    image: '图片',
    video: '视频',
    audio: '音频',
  }
  return names[type] || '节点'
}

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'input':
      return { fields: [] }
    case 'process':
      return {
        provider: 'OPENROUTER',
        model: 'deepseek/deepseek-chat',
        knowledgeItems: [],
        systemPrompt: '',
        userPrompt: '',
        temperature: 0.7,
        maxTokens: 2048,
      }
    case 'code':
      return {
        provider: 'OPENROUTER',
        model: 'deepseek/deepseek-coder',
        prompt: '',
        language: 'javascript',
        generatedCode: '',
      }
    case 'output':
      return {
        provider: 'OPENROUTER',
        model: 'deepseek/deepseek-chat',
        prompt: '',
        format: 'text',
        templateName: '',
      }
    default:
      return {}
  }
}

export default function WorkflowDetailPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  )
}
