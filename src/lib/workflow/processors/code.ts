/**
 * 代码节点处理器（受控执行）
 */

import type { NodeConfig, CodeNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables } from '../utils'
import { executeSandboxedCode } from '@/lib/code-execution/execute'

function isCodeExecutionEnabled(): boolean {
  return process.env.CODE_EXECUTION_ENABLED === 'true'
}

export class CodeNodeProcessor implements NodeProcessor {
  nodeType = 'CODE'

  async process(node: NodeConfig, context: ExecutionContext): Promise<NodeOutput> {
    const startedAt = new Date()
    const codeNode = node as CodeNodeConfig

    try {
      const cfg = codeNode.config || ({} as any)
      const language = (cfg.language || 'javascript') as any
      const rawCode = String(cfg.code || '')
      if (!rawCode.trim()) {
        throw new Error('代码节点缺少 code')
      }

      const code = rawCode.includes('{{') ? replaceVariables(rawCode, context) : rawCode

      const nodesByName: Record<string, unknown> = {}
      const nodesById: Record<string, unknown> = {}
      for (const [id, output] of context.nodeOutputs.entries()) {
        nodesById[id] = output.data
        if (output.nodeName) nodesByName[String(output.nodeName)] = output.data
      }

      const input = {
        globals: context.globalVariables,
        nodes: nodesByName,
        nodesById,
        executionId: context.executionId,
        workflowId: context.workflowId,
      }

      const result = await executeSandboxedCode({
        enabled: isCodeExecutionEnabled(),
        language,
        code,
        input,
        timeoutMs: cfg.timeout,
        maxOutputSize: cfg.maxOutputSize,
      })

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: result.ok ? 'success' : 'error',
        data: {
          ok: result.ok,
          result: result.result,
          logs: result.logs,
          durationMs: result.durationMs,
        },
        error: result.ok ? undefined : (result.result as any)?.error,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '处理代码节点失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }
}

export const codeNodeProcessor = new CodeNodeProcessor()

