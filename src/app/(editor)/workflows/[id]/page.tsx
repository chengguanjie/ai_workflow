'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Save, Play, ArrowLeft, Loader2, Cloud, CloudOff, History, Link2, Group, Sparkles, Trash2, LayoutGrid, BarChart3, FileJson, MessageSquare, BookOpen, Share2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NodePanel } from '@/components/workflow/node-panel'
import { NodeConfigPanel } from '@/components/workflow/node-config-panel'
import { ExecutionPanel } from '@/components/workflow/execution-panel'
import { ExecutionHistoryPanel } from '@/components/workflow/execution-history-panel'
import { NodeDebugPanel } from '@/components/workflow/node-debug-panel'
import { AIAssistantPanel } from '@/components/workflow/ai-assistant-panel'
import { VersionManagement } from '@/components/workflow/version-management'
import { WorkflowImportExportDialog } from '@/components/workflow/workflow-import-export-dialog'
import { NodeCommentDialog } from '@/components/workflow/node-comment-dialog'
import { WorkflowManualDialog } from '@/components/workflow/workflow-manual-dialog'
import { ShareFormDialog } from '@/components/workflow/share-form-dialog'
import { nodeTypes } from '@/components/workflow/nodes'
import { useAIAssistantStore } from '@/stores/ai-assistant-store'
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
  const [showImportExportDialog, setShowImportExportDialog] = useState(false)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 选区右键菜单状态
  const [selectionContextMenu, setSelectionContextMenu] = useState<{ x: number; y: number } | null>(null)
  const selectionMenuRef = useRef<HTMLDivElement>(null)

  // Edge 右键菜单状态
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null)
  const edgeMenuRef = useRef<HTMLDivElement>(null)

  // 节点右键菜单状态
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; nodeId: string; nodeName: string; nodeType: string; comment?: string } | null>(null)
  const nodeMenuRef = useRef<HTMLDivElement>(null)

  // 节点注释弹窗状态
  const [commentDialogNode, setCommentDialogNode] = useState<{ nodeId: string; nodeName: string; nodeType: string; comment?: string } | null>(null)

  // 说明手册弹窗状态
  const [showManualDialog, setShowManualDialog] = useState(false)

  // 分享表单弹窗状态
  const [showShareFormDialog, setShowShareFormDialog] = useState(false)

  // AI助手
  const { openPanel: openAIPanel } = useAIAssistantStore()

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
    groupNodes,
    getSelectedNodeIds,
    autoLayout,
  } = useWorkflowStore()

  // 加载工作流数据
  useEffect(() => {
    const loadWorkflow = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}`)
        if (!response.ok) {
          throw new Error('加载工作流失败')
        }
        const result = await response.json()
        const workflow = result.data

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

  // 监听立即保存请求事件
  useEffect(() => {
    const handleRequestSave = () => {
      // 清除自动保存定时器，立即保存
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      // 延迟 100ms 确保状态已更新
      setTimeout(() => {
        autoSaveToDb(true)
      }, 100)
    }

    window.addEventListener('workflow-request-save', handleRequestSave)
    return () => {
      window.removeEventListener('workflow-request-save', handleRequestSave)
    }
  }, [autoSaveToDb])

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
    setSelectionContextMenu(null)
    setEdgeContextMenu(null)
    setNodeContextMenu(null)
  }, [selectNode])

  // 点击外部关闭选区右键菜单
  useEffect(() => {
    if (!selectionContextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as globalThis.Node)) {
        setSelectionContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [selectionContextMenu])

  // 处理选区右键菜单
  const onSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const selectedIds = getSelectedNodeIds()
    // 只有选中多个节点时才显示组合菜单
    if (selectedIds.length >= 2) {
      setSelectionContextMenu({ x: e.clientX, y: e.clientY })
    }
  }, [getSelectedNodeIds])

  // 处理组合节点
  const handleGroupNodes = useCallback(() => {
    const selectedIds = getSelectedNodeIds()
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds)
      toast.success('节点已组合')
    }
    setSelectionContextMenu(null)
  }, [getSelectedNodeIds, groupNodes])

  // 点击外部关闭 Edge 右键菜单
  useEffect(() => {
    if (!edgeContextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (edgeMenuRef.current && !edgeMenuRef.current.contains(e.target as globalThis.Node)) {
        setEdgeContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [edgeContextMenu])

  // 处理 Edge 右键菜单
  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: { id: string }) => {
    e.preventDefault()
    setEdgeContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
  }, [])

  // 删除 Edge
  const handleDeleteEdge = useCallback(() => {
    if (edgeContextMenu) {
      onEdgesChange([{ type: 'remove', id: edgeContextMenu.edgeId }])
      toast.success('连线已删除')
      setEdgeContextMenu(null)
    }
  }, [edgeContextMenu, onEdgesChange])

  // 点击外部关闭节点右键菜单
  useEffect(() => {
    if (!nodeContextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (nodeMenuRef.current && !nodeMenuRef.current.contains(e.target as globalThis.Node)) {
        setNodeContextMenu(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [nodeContextMenu])

  // 处理节点右键菜单
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: { id: string; data?: { name?: string; type?: string; comment?: string } }) => {
    e.preventDefault()
    setNodeContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      nodeName: node.data?.name || '未命名节点',
      nodeType: node.data?.type || 'UNKNOWN',
      comment: node.data?.comment,
    })
  }, [])

  // 打开节点注释弹窗
  const handleOpenCommentDialog = useCallback(() => {
    if (nodeContextMenu) {
      setCommentDialogNode({
        nodeId: nodeContextMenu.nodeId,
        nodeName: nodeContextMenu.nodeName,
        nodeType: nodeContextMenu.nodeType,
        comment: nodeContextMenu.comment,
      })
      setNodeContextMenu(null)
    }
  }, [nodeContextMenu])

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
      <TooltipProvider delayDuration={100}>
        <div className="flex w-14 flex-col items-center border-r bg-background py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/workflows">
                <Button variant="ghost" size="icon" className="mb-4">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">返回工作流列表</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleSave} disabled={isSaving} className="mb-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">保存工作流</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowExecutionPanel(true)}
                disabled={nodes.length === 0}
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">执行工作流</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistoryPanel(true)}
                className="mt-2"
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">执行历史</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyApiUrl}
                className="mt-2"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">复制 API 链接</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowImportExportDialog(true)}
                className="mt-2"
              >
                <FileJson className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">导入/导出</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowManualDialog(true)}
                className="mt-2"
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">说明手册</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowShareFormDialog(true)}
                className="mt-2"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">分享表单</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

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
          {/* 右侧工具区 */}
          <div className="flex items-center gap-4">
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

            {/* 版本管理 */}
            <VersionManagement
              workflowId={workflowId}
              onVersionChange={() => {
                // 版本变更后可以刷新页面或重新加载数据
                window.location.reload()
              }}
            />

            {/* 统计分析按钮 */}
            <Link href={`/workflows/${workflowId}/analytics`}>
              <Button variant="outline" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                统计分析
              </Button>
            </Link>
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
              selectionOnDrag={false}
              selectionMode={SelectionMode.Partial}
              selectionKeyCode="Shift"
              multiSelectionKeyCode="Shift"
              panOnScroll
              onSelectionContextMenu={onSelectionContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onNodeContextMenu={onNodeContextMenu}
            >
              <Background gap={15} />
              <Controls>
                <ControlButton onClick={() => autoLayout('LR')} title="自动布局">
                  <LayoutGrid className="h-4 w-4" />
                </ControlButton>
              </Controls>
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

      {/* 导入/导出对话框 */}
      <WorkflowImportExportDialog
        isOpen={showImportExportDialog}
        onClose={() => setShowImportExportDialog(false)}
        workflowName={name}
      />

      {/* 节点调试面板 */}
      <NodeDebugPanel />

      {/* AI助手面板 */}
      <AIAssistantPanel workflowId={workflowId} />

      {/* AI助手悬浮按钮 - 右下角 */}
      <Button
        onClick={openAIPanel}
        title="AI 助手"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg hover:from-violet-600 hover:to-purple-700 hover:shadow-xl transition-all"
      >
        <Sparkles className="h-5 w-5 text-white" />
      </Button>

      {/* 选区右键菜单 - 使用 Portal 渲染到 body */}
      {selectionContextMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={selectionMenuRef}
          className="min-w-[120px] rounded-md border bg-popover p-1 shadow-lg"
          style={{
            position: 'fixed',
            left: selectionContextMenu.x,
            top: selectionContextMenu.y,
            zIndex: 9999,
          }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleGroupNodes}
          >
            <Group className="h-4 w-4" />
            组合节点
          </button>
        </div>,
        document.body
      )}

      {/* Edge 右键菜单 - 使用 Portal 渲染到 body */}
      {edgeContextMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={edgeMenuRef}
          className="min-w-[100px] rounded-md border bg-popover p-1 shadow-lg"
          style={{
            position: 'fixed',
            left: edgeContextMenu.x,
            top: edgeContextMenu.y,
            zIndex: 9999,
          }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            onClick={handleDeleteEdge}
          >
            <Trash2 className="h-4 w-4" />
            删除连线
          </button>
        </div>,
        document.body
      )}

      {/* 节点右键菜单 - 使用 Portal 渲染到 body */}
      {nodeContextMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={nodeMenuRef}
          className="min-w-[120px] rounded-md border bg-popover p-1 shadow-lg"
          style={{
            position: 'fixed',
            left: nodeContextMenu.x,
            top: nodeContextMenu.y,
            zIndex: 9999,
          }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={handleOpenCommentDialog}
          >
            <MessageSquare className="h-4 w-4" />
            {nodeContextMenu.comment ? '编辑注释' : '添加注释'}
          </button>
        </div>,
        document.body
      )}

      {/* 节点注释弹窗 */}
      {commentDialogNode && (
        <NodeCommentDialog
          isOpen={!!commentDialogNode}
          onClose={() => setCommentDialogNode(null)}
          nodeId={commentDialogNode.nodeId}
          nodeName={commentDialogNode.nodeName}
          nodeType={commentDialogNode.nodeType}
          currentComment={commentDialogNode.comment}
        />
      )}

      {/* 工作流说明手册弹窗 */}
      <WorkflowManualDialog
        isOpen={showManualDialog}
        onClose={() => setShowManualDialog(false)}
        workflowId={workflowId}
      />

      {/* 分享表单弹窗 */}
      <ShareFormDialog
        workflowId={workflowId}
        isOpen={showShareFormDialog}
        onClose={() => setShowShareFormDialog(false)}
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
