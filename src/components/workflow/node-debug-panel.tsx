'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileJson,
  Workflow,
  ArrowRightFromLine,
  Clock,
  Cpu
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/stores/workflow-store'

interface DebugResult {
  status: 'success' | 'error' | 'skipped'
  output: Record<string, unknown>
  error?: string
  duration: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  logs?: string[]
}

export function NodeDebugPanel() {
  const { debugNodeId, isDebugPanelOpen, closeDebugPanel, nodes, edges, id: workflowId } = useWorkflowStore()
  const [mockInputs, setMockInputs] = useState<Record<string, Record<string, any>>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<DebugResult | null>(null)

  // Section visibility states
  const [isInputOpen, setIsInputOpen] = useState(true)
  const [isProcessOpen, setIsProcessOpen] = useState(true)
  const [isOutputOpen, setIsOutputOpen] = useState(true)

  const debugNode = nodes.find(n => n.id === debugNodeId)

  const predecessorNodes = useMemo(() => edges
    .filter(e => e.target === debugNodeId)
    .map(e => nodes.find(n => n.id === e.source))
    .filter(Boolean), [edges, nodes, debugNodeId])

  // Reset state when node changes
  useEffect(() => {
    if (debugNodeId && predecessorNodes.length > 0) {
      const defaultInputs: Record<string, Record<string, unknown>> = {}
      for (const predNode of predecessorNodes) {
        if (predNode) {
          defaultInputs[predNode.data.name as string] = {
            result: `[数据来自: ${predNode.data.name}]`,
          }
        }
      }
      setMockInputs(defaultInputs)
    } else {
      setMockInputs({})
    }
    setResult(null)
    setIsInputOpen(true)
    setIsProcessOpen(true)
    setIsOutputOpen(false)
  }, [debugNodeId, predecessorNodes])

  const handleRunDebug = async () => {
    if (!workflowId || !debugNodeId) return

    setIsRunning(true)
    setResult(null)
    setIsProcessOpen(true)
    setIsOutputOpen(false)

    try {
      // Inputs are already an object, no need to parse
      const parsedInputs = mockInputs

      const response = await fetch(`/api/workflows/${workflowId}/nodes/${debugNodeId}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockInputs: parsedInputs }),
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.data)
        setIsOutputOpen(true)
      } else {
        setResult({
          status: 'error',
          output: {},
          error: data.error?.message || '调试失败',
          duration: 0,
          logs: ['[ERROR] 请求失败']
        })
        setIsOutputOpen(true)
      }
    } catch (error) {
      setResult({
        status: 'error',
        output: {},
        error: error instanceof Error ? error.message : '调试请求失败',
        duration: 0,
        logs: [`[ERROR] ${error instanceof Error ? error.message : '未知错误'}`]
      })
      setIsOutputOpen(true)
    } finally {
      setIsRunning(false)
    }
  }

  const updateMockInput = (nodeName: string, field: string, value: string) => {
    setMockInputs(prev => ({
      ...prev,
      [nodeName]: {
        ...prev[nodeName],
        [field]: value
      }
    }))
  }

  if (!isDebugPanelOpen || !debugNode) {
    return null
  }

  return <div className="fixed right-0 top-0 h-full w-[500px] border-l bg-background shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
    {/* Header */}
    <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/10">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Workflow className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">节点调试</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{debugNode.data.name as string}</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={closeDebugPanel} className="h-8 w-8 rounded-full hover:bg-muted">
        <X className="h-4 w-4" />
      </Button>
    </div>

    <div
      className="flex-1 bg-slate-50/50 overflow-y-auto"
      style={{
        height: 'calc(100% - 73px)',
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 transparent'
      }}
    >
      <div className="p-6 space-y-6 pb-12">

        {/* 1. Input Section */}
        <Section
          title="输入数据"
          icon={ArrowRightFromLine}
          isOpen={isInputOpen}
          onOpenChange={setIsInputOpen}
          description={predecessorNodes.length > 0 ? `来自 ${predecessorNodes.length} 个上游节点` : '无上游节点'}
        >
          <div className="space-y-4 pt-2">
            {predecessorNodes.length > 0 ? (
              <div className="space-y-4">
                {predecessorNodes.map((node, index) => {
                  const nodeName = node?.data.name as string || `节点 ${index + 1}`
                  const nodeInputs = mockInputs[nodeName] || {}

                  return (
                    <div key={node?.id || index} className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                        <span className="text-xs font-medium">{nodeName}</span>
                        <Badge variant="outline" className="text-[10px] h-4 ml-auto px-1 bg-white/50">
                          {node?.type || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="p-3 space-y-3 bg-white/50">
                        {Object.keys(nodeInputs).length > 0 ? (
                          Object.entries(nodeInputs).map(([key, value]) => (
                            <div key={key} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{key}</label>
                              </div>
                              <Textarea
                                value={value as string}
                                onChange={(e) => updateMockInput(nodeName, key, e.target.value)}
                                className="min-h-[60px] text-xs resize-y bg-white font-mono"
                                placeholder={`输入 ${key} 的值...`}
                              />
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-muted-foreground py-2 text-center italic">
                            暂无输入字段
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed text-xs">
                当前节点没有上游输入
              </div>
            )}
          </div>
        </Section>

        {/* 2. Processing Section */}
        <Section
          title="处理过程"
          icon={Terminal}
          isOpen={isProcessOpen}
          onOpenChange={setIsProcessOpen}
          status={isRunning ? 'running' : (result ? 'completed' : 'idle')}
        >
          <div className="space-y-4 pt-2">
            <Button
              onClick={handleRunDebug}
              disabled={isRunning}
              className={cn(
                "w-full transition-all duration-300",
                isRunning ? "bg-primary/80" : "hover:scale-[1.02]"
              )}
              size="lg"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  正在执行...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  开始调试
                </>
              )}
            </Button>

            {/* Logs / Terminal View */}
            <div className="rounded-lg border bg-zinc-950 p-4 font-mono text-xs text-zinc-300 min-h-[120px] max-h-[300px] overflow-y-auto shadow-inner scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              {result?.logs && result.logs.length > 0 ? (
                <div className="space-y-1.5">
                  {result.logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-zinc-600 select-none">{'>'}</span>
                      <span className="break-all whitespace-pre-wrap">{log}</span>
                    </div>
                  ))}
                  {result?.status === 'success' && (
                    <div className="flex gap-2 text-green-400 mt-2">
                      <span className="text-zinc-600 select-none">{'>'}</span>
                      <span>Execution completed successfully.</span>
                    </div>
                  )}
                  {result?.status === 'error' && (
                    <div className="flex gap-2 text-red-400 mt-2">
                      <span className="text-zinc-600 select-none">{'>'}</span>
                      <span>Execution failed.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic gap-2 min-h-[80px]">
                  <Terminal className="h-8 w-8 opacity-20" />
                  <span>等待执行...</span>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* 3. Output Section */}
        <Section
          title="输出结果"
          icon={FileJson}
          isOpen={isOutputOpen}
          onOpenChange={setIsOutputOpen}
          disabled={!result}
          status={result?.status === 'success' ? 'success' : (result?.status === 'error' ? 'error' : undefined)}
        >
          {result ? (
            <div className="space-y-4 pt-2">
              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg border p-3 flex items-center gap-3 shadow-sm">
                  <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">耗时</p>
                    <p className="text-sm font-semibold text-foreground">{result.duration}ms</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg border p-3 flex items-center gap-3 shadow-sm">
                  <div className="h-8 w-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Tokens</p>
                    <p className="text-sm font-semibold text-foreground">{result.tokenUsage?.totalTokens || 0}</p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {result.error && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-600 flex items-start gap-3">
                  <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">执行出错</p>
                    <p className="opacity-90">{result.error}</p>
                  </div>
                </div>
              )}

              {/* JSON Output */}
              <div className="relative">
                <pre className="rounded-lg border bg-white p-4 text-xs overflow-auto max-h-[400px] shadow-sm font-mono leading-relaxed scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                  {JSON.stringify(result.output, null, 2)}
                </pre>
                <div className="absolute top-3 right-3">
                  <Badge variant="secondary" className="text-[10px] opacity-70">JSON</Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground bg-white/50 rounded-lg border border-dashed border-slate-200">
              暂无输出结果
            </div>
          )}
        </Section>

      </div>
    </div>
  </div>
}

// Reusable Section Component
function Section({
  title,
  icon: Icon,
  children,
  isOpen,
  onOpenChange,
  description,
  status,
  disabled = false
}: {
  title: string
  icon: any
  children: React.ReactNode
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  description?: string
  status?: 'idle' | 'running' | 'success' | 'completed' | 'error'
  disabled?: boolean
}) {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className={cn(
        "bg-white rounded-xl border transition-all duration-200 shadow-sm",
        isOpen ? "ring-1 ring-primary/5 border-primary/20" : "hover:border-primary/20",
        disabled && "opacity-50 pointer-events-none grayscale"
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 cursor-pointer group select-none">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
            isOpen ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-left">
            <h3 className={cn("font-medium text-sm transition-colors", isOpen ? "text-foreground" : "text-muted-foreground")}>
              {title}
            </h3>
            {description && !isOpen && (
              <p className="text-xs text-muted-foreground/60 truncate max-w-[200px] animate-in fade-in slide-in-from-left-2">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            !isOpen && "-rotate-90"
          )} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="pt-2 border-t border-slate-100">
            {children}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
