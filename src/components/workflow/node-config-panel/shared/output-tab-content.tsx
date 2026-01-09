'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Loader2, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ExecutionLog {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  startedAt: string
  completedAt: string | null
  duration: number | null
  error: string | null
}

interface ExecutionDetail {
  id: string
  status: string
  logs: ExecutionLog[]
  completedAt: string | null
}

interface OutputTabContentProps {
  nodeId: string
}

export function OutputTabContent({ nodeId }: OutputTabContentProps) {
  const { id: workflowId } = useWorkflowStore()
  const [loading, setLoading] = useState(true)
  const [nodeOutput, setNodeOutput] = useState<ExecutionLog | null>(null)
  const [executionInfo, setExecutionInfo] = useState<{
    id: string
    completedAt: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchLatestOutput = useCallback(async () => {
    if (!workflowId) {
      setLoading(false)
      setError('工作流尚未保存')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 获取最近一次执行记录
      const execRes = await fetch(`/api/executions?workflowId=${workflowId}&limit=1`)
      if (!execRes.ok) {
        throw new Error('获取执行记录失败')
      }

      const execData = await execRes.json()
      const executions = execData.executions || []

      if (executions.length === 0) {
        setLoading(false)
        setNodeOutput(null)
        return
      }

      const latestExecution = executions[0]

      // 获取执行详情（包含节点日志）
      const detailRes = await fetch(`/api/executions/${latestExecution.id}`)
      if (!detailRes.ok) {
        throw new Error('获取执行详情失败')
      }

      const detailData = await detailRes.json()
      const execution: ExecutionDetail = detailData.execution

      setExecutionInfo({
        id: execution.id,
        completedAt: execution.completedAt,
      })

      // 查找当前节点的日志
      const nodeLog = execution.logs.find((log) => log.nodeId === nodeId)
      setNodeOutput(nodeLog || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [workflowId, nodeId])

  useEffect(() => {
    fetchLatestOutput()
  }, [fetchLatestOutput])

  // 格式化时间
  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // 格式化时长
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

  const stringifyPretty = (v: unknown) => {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }

  const buildImageUrls = (output: Record<string, unknown>): string[] => {
    if (Array.isArray(output.imageUrls)) {
      return (output.imageUrls as unknown[])
        .map((x) => (typeof x === 'string' ? x : null))
        .filter((x): x is string => Boolean(x))
    }

    const images = output.images
    if (!Array.isArray(images)) return []
    return (images as Array<{ url?: unknown }>)
      .map((img) => (typeof img?.url === 'string' ? img.url : null))
      .filter((x): x is string => Boolean(x))
  }

  const getTextValue = (output: Record<string, unknown>): string | null => {
    const val = output.text
    if (typeof val !== 'string') return null
    const trimmed = val.trim()
    return trimmed ? trimmed : null
  }

  const getResultText = (output: Record<string, unknown>): string | null => {
    const val = output['结果'] ?? output['result']
    if (typeof val !== 'string') return null
    const trimmed = val.trim()
    return trimmed ? trimmed : null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        加载输出...
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLatestOutput}>
          <RefreshCw className="h-4 w-4 mr-1" />
          重试
        </Button>
      </div>
    )
  }

  if (!nodeOutput) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">暂无输出数据</p>
          <p className="text-xs text-muted-foreground mt-1">
            执行工作流后可在此查看节点输出
          </p>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={fetchLatestOutput}>
          <RefreshCw className="h-4 w-4 mr-1" />
          刷新
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 执行信息 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {nodeOutput.status === 'COMPLETED' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : nodeOutput.status === 'FAILED' ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          <span>
            {executionInfo?.completedAt
              ? `执行于 ${formatTime(executionInfo.completedAt)}`
              : '执行中...'}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={fetchLatestOutput}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* 执行时长 */}
      {nodeOutput.duration !== null && (
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/50">
          <span className="text-muted-foreground">执行时长</span>
          <span className="font-medium">{formatDuration(nodeOutput.duration)}</span>
        </div>
      )}

      {/* 错误信息 */}
      {nodeOutput.error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
          <div className="font-medium mb-1">错误</div>
          <div className="text-xs whitespace-pre-wrap break-all">{nodeOutput.error}</div>
        </div>
      )}

      {/* 输出内容 */}
      {nodeOutput.output && (
        <div className="space-y-2">
          <div className="text-sm font-medium">输出内容</div>
          {(() => {
            if (!isRecord(nodeOutput.output)) {
              return (
                <details open className="rounded-md border bg-muted/40">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">
                    点击展开/收起
                  </summary>
                  <pre className="p-3 rounded-md bg-muted text-sm overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
                    {typeof nodeOutput.output === 'string'
                      ? nodeOutput.output
                      : stringifyPretty(nodeOutput.output)}
                  </pre>
                </details>
              )
            }

            const output = nodeOutput.output
            const nodeName = nodeOutput.nodeName
            const resultText = getResultText(output)
            const textValue = getTextValue(output)
            const imageUrls = buildImageUrls(output)
            const videos = Array.isArray(output.videos) ? (output.videos as unknown[]) : []
            const audio = output.audio

            const commonItems: Array<{
              id: string
              label: string
              reference: string
              value: unknown
              valueType: 'text' | 'list' | 'json'
            }> = []

            if (resultText) {
              commonItems.push({
                id: 'result',
                label: '结果',
                reference: `{{${nodeName}.结果}}`,
                value: resultText,
                valueType: 'text',
              })
            }
            if (imageUrls.length > 0) {
              commonItems.push({
                id: 'imageUrls',
                label: '图片URL列表',
                reference: `{{${nodeName}.imageUrls}}`,
                value: imageUrls,
                valueType: 'list',
              })
            }
            if (videos.length > 0) {
              commonItems.push({
                id: 'videos',
                label: '视频列表',
                reference: `{{${nodeName}.videos}}`,
                value: videos,
                valueType: 'json',
              })
            }
            if (audio !== undefined && audio !== null) {
              commonItems.push({
                id: 'audio',
                label: '音频',
                reference: `{{${nodeName}.audio}}`,
                value: audio,
                valueType: 'json',
              })
            }
            if (textValue) {
              commonItems.push({
                id: 'text',
                label: '文本（工具输出）',
                reference: `{{${nodeName}.text}}`,
                value: textValue,
                valueType: 'text',
              })
            }

            if (commonItems.length === 0) {
              return (
                <details className="rounded-md border bg-muted/40">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">
                    全部输出内容（原始 JSON，可用于引用 {`{{${nodeName}}}`}）
                  </summary>
                  <pre className="p-3 text-sm overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
                    {stringifyPretty(output)}
                  </pre>
                </details>
              )
            }

            return (
              <div className="space-y-2">
                {commonItems.map((item) => (
                  <div key={item.id} className="rounded-md border bg-background">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {item.reference}
                      </div>
                    </div>
                    {item.valueType === 'text' ? (
                      <details open className="border-t">
                        <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">
                          点击展开/收起
                        </summary>
                        <pre className="p-3 text-sm overflow-auto max-h-[220px] whitespace-pre-wrap break-all">
                          {String(item.value)}
                        </pre>
                      </details>
                    ) : item.valueType === 'list' ? (
                      <div className="p-3 text-sm space-y-1">
                        {(item.value as unknown[]).map((v, idx) => (
                          <div key={idx} className="font-mono text-xs break-all">
                            {String(v)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <details open className="border-t">
                        <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">
                          点击展开/收起
                        </summary>
                        <pre className="p-3 text-sm overflow-auto max-h-[220px] whitespace-pre-wrap break-all">
                          {stringifyPretty(item.value)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}

                <details className="rounded-md border bg-muted/40">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">
                    全部输出内容（原始 JSON，可用于引用 {`{{${nodeName}}}`}）
                  </summary>
                  <pre className="p-3 text-sm overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
                    {stringifyPretty(output)}
                  </pre>
                </details>
              </div>
            )
          })()}
        </div>
      )}

      {/* 输入内容（折叠显示） */}
      {nodeOutput.input && Object.keys(nodeOutput.input).length > 0 && (
        <details className="group">
          <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            查看输入
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted/50 text-xs overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
            {JSON.stringify(nodeOutput.input, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
