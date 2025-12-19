'use client'

import { useState, useEffect } from 'react'
import { X, Play, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useWorkflowStore } from '@/stores/workflow-store'
import { cn } from '@/lib/utils'

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
  const [mockInputs, setMockInputs] = useState<string>('{}')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<DebugResult | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)

  const debugNode = nodes.find(n => n.id === debugNodeId)

  const predecessorNodes = edges
    .filter(e => e.target === debugNodeId)
    .map(e => nodes.find(n => n.id === e.source))
    .filter(Boolean)

  useEffect(() => {
    if (debugNodeId && predecessorNodes.length > 0) {
      const defaultInputs: Record<string, Record<string, unknown>> = {}
      for (const predNode of predecessorNodes) {
        if (predNode) {
          defaultInputs[predNode.data.name as string] = {
            result: `[模拟数据来自: ${predNode.data.name}]`,
          }
        }
      }
      setMockInputs(JSON.stringify(defaultInputs, null, 2))
    } else {
      setMockInputs('{}')
    }
    setResult(null)
  }, [debugNodeId])

  const handleRunDebug = async () => {
    if (!workflowId || !debugNodeId) return

    setIsRunning(true)
    setResult(null)

    try {
      let parsedInputs = {}
      try {
        parsedInputs = JSON.parse(mockInputs)
      } catch {
        setResult({
          status: 'error',
          output: {},
          error: 'JSON 格式错误，请检查模拟输入',
          duration: 0,
        })
        setIsRunning(false)
        return
      }

      const response = await fetch(`/api/workflows/${workflowId}/nodes/${debugNodeId}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockInputs: parsedInputs }),
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.data)
      } else {
        setResult({
          status: 'error',
          output: {},
          error: data.error?.message || '调试失败',
          duration: 0,
        })
      }
    } catch (error) {
      setResult({
        status: 'error',
        output: {},
        error: error instanceof Error ? error.message : '调试请求失败',
        duration: 0,
      })
    } finally {
      setIsRunning(false)
    }
  }

  if (!isDebugPanelOpen || !debugNode) {
    return null
  }

  return (
    <div className="fixed right-0 top-0 h-full w-[480px] border-l bg-background shadow-lg z-50 flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">节点调试</h2>
          <Badge variant="outline">{debugNode.data.name as string}</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={closeDebugPanel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">模拟上游输入</CardTitle>
            </CardHeader>
            <CardContent>
              {predecessorNodes.length > 0 ? (
                <p className="text-xs text-muted-foreground mb-2">
                  上游节点: {predecessorNodes.map(n => n?.data.name as string).join(', ')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mb-2">
                  此节点没有上游输入
                </p>
              )}
              <Textarea
                value={mockInputs}
                onChange={(e) => setMockInputs(e.target.value)}
                placeholder='{"nodeName": {"field": "value"}}'
                className="font-mono text-xs min-h-[120px]"
              />
            </CardContent>
          </Card>

          <Button
            onClick={handleRunDebug}
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                运行调试
              </>
            )}
          </Button>

          {result && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">执行结果</CardTitle>
                  <div className="flex items-center gap-2">
                    {result.status === 'success' ? (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        成功
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        失败
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {result.duration}ms
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {result.error}
                  </div>
                )}

                {result.output && Object.keys(result.output).length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">输出数据:</p>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-[200px]">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  </div>
                )}

                {result.tokenUsage && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Prompt: {result.tokenUsage.promptTokens}</span>
                    <span>Completion: {result.tokenUsage.completionTokens}</span>
                    <span>Total: {result.tokenUsage.totalTokens}</span>
                  </div>
                )}

                {result.logs && result.logs.length > 0 && (
                  <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-start">
                        {logsOpen ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                        执行日志 ({result.logs.length})
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-[200px] mt-2">
                        {result.logs.join('\n')}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
