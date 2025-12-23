
import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { toast } from 'sonner'

export interface DebugResult {
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

export function useNodeDebug() {
                  const { id: workflowId, nodes, edges, updateNodeExecutionStatus } = useWorkflowStore()
                  const [isRunning, setIsRunning] = useState(false)
                  const [result, setResult] = useState<DebugResult | null>(null)

                  const runNode = async (nodeId: string, inputs: Record<string, Record<string, any>> = {}) => {
                                    if (!workflowId || !nodeId) return

                                    setIsRunning(true)
                                    setResult(null)
                                    updateNodeExecutionStatus(nodeId, 'running')

                                    try {
                                                      const response = await fetch(`/api/workflows/${workflowId}/nodes/${nodeId}/debug`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ mockInputs: inputs }),
                                                      })

                                                      const data = await response.json()

                                                      if (data.success) {
                                                                        setResult(data.data)
                                                                        updateNodeExecutionStatus(nodeId, 'completed')
                                                                        // toast.success('执行成功')
                                                      } else {
                                                                        const errorMsg = data.error?.message || '调试失败'
                                                                        setResult({
                                                                                          status: 'error',
                                                                                          output: {},
                                                                                          error: errorMsg,
                                                                                          duration: 0,
                                                                                          logs: ['[ERROR] 请求失败']
                                                                        })
                                                                        updateNodeExecutionStatus(nodeId, 'failed')
                                                                        toast.error(errorMsg)
                                                      }
                                    } catch (error) {
                                                      const errorMsg = error instanceof Error ? error.message : '调试请求失败'
                                                      setResult({
                                                                        status: 'error',
                                                                        output: {},
                                                                        error: errorMsg,
                                                                        duration: 0,
                                                                        logs: [`[ERROR] ${errorMsg}`]
                                                      })
                                                      updateNodeExecutionStatus(nodeId, 'failed')
                                                      toast.error(errorMsg)
                                    } finally {
                                                      setIsRunning(false)
                                    }
                  }

                  // Helper to generate default mock inputs for a node
                  const getDefaultInputs = (nodeId: string) => {
                                    const predecessorEdges = edges.filter(e => e.target === nodeId)
                                    const inputs: Record<string, Record<string, unknown>> = {}

                                    for (const edge of predecessorEdges) {
                                                      const sourceNode = nodes.find(n => n.id === edge.source)
                                                      if (sourceNode) {
                                                                        inputs[sourceNode.data.name as string] = {
                                                                                          result: `[数据来自: ${sourceNode.data.name}]`,
                                                                        }
                                                      }
                                    }
                                    return inputs
                  }

                  return {
                                    runNode,
                                    getDefaultInputs,
                                    isRunning,
                                    result
                  }
}
