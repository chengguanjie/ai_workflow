/**
 * 代码节点处理器
 */

import type { NodeConfig, CodeNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables, getPredecessorOutputs } from '../utils'

// 沙箱执行超时时间（毫秒）
const EXECUTION_TIMEOUT = 5000

// 最大输出长度
const MAX_OUTPUT_LENGTH = 10000

export class CodeNodeProcessor implements NodeProcessor {
  nodeType = 'CODE'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const codeNode = node as CodeNodeConfig

    try {
      let code = codeNode.config?.code || ''

      if (!code.trim()) {
        throw new Error('代码不能为空')
      }

      // 替换代码中的变量引用
      code = replaceVariables(code, context)

      // 准备输入数据（来自前置节点）
      const inputs: Record<string, unknown> = {}
      for (const [, output] of context.nodeOutputs) {
        if (output.status === 'success') {
          inputs[output.nodeName] = output.data
        }
      }

      // 执行代码
      const result = await this.executeCode(code, inputs)

      if (!result.success) {
        throw new Error(result.error || '代码执行失败')
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          output: result.result,
          logs: result.logs,
          executionTime: result.executionTime,
        },
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
        error: error instanceof Error ? error.message : '代码执行失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 在沙箱中执行代码
   */
  private async executeCode(
    code: string,
    inputs: Record<string, unknown>
  ): Promise<{
    success: boolean
    result?: unknown
    output?: string
    error?: string
    logs?: string[]
    executionTime?: number
  }> {
    const startTime = Date.now()
    const logs: string[] = []

    // 创建安全的全局对象
    const safeGlobals = {
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      // 输入数据
      inputs,
      // 日志函数
      console: {
        log: (...args: unknown[]) => {
          logs.push(`[LOG] ${args.map((a) => formatValue(a)).join(' ')}`)
        },
        error: (...args: unknown[]) => {
          logs.push(`[ERROR] ${args.map((a) => formatValue(a)).join(' ')}`)
        },
        warn: (...args: unknown[]) => {
          logs.push(`[WARN] ${args.map((a) => formatValue(a)).join(' ')}`)
        },
        info: (...args: unknown[]) => {
          logs.push(`[INFO] ${args.map((a) => formatValue(a)).join(' ')}`)
        },
      },
    }

    // 禁用的全局变量
    const forbidden = [
      'require',
      'process',
      'global',
      '__dirname',
      '__filename',
      'module',
      'exports',
      'Buffer',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'eval',
      'Function',
    ]

    try {
      // 构建执行代码
      const wrappedCode = `
        "use strict";
        ${forbidden.map((f) => `const ${f} = undefined;`).join('\n')}

        let __result__;
        try {
          __result__ = (function() {
            ${code}
          })();
        } catch (e) {
          throw e;
        }
        __result__;
      `

      // 创建函数并执行
      const fn = new Function(...Object.keys(safeGlobals), wrappedCode)

      // 执行并设置超时
      const result = await Promise.race([
        Promise.resolve(fn(...Object.values(safeGlobals))),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('代码执行超时')), EXECUTION_TIMEOUT)
        ),
      ])

      const executionTime = Date.now() - startTime

      return {
        success: true,
        result,
        output: logs.join('\n').slice(0, MAX_OUTPUT_LENGTH),
        logs,
        executionTime,
      }
    } catch (error) {
      const executionTime = Date.now() - startTime

      return {
        success: false,
        error: error instanceof Error ? error.message : '代码执行失败',
        logs,
        executionTime,
      }
    }
  }
}

/**
 * 格式化值为字符串
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export const codeNodeProcessor = new CodeNodeProcessor()
