/**
 * 代码节点处理器
 * 支持 JavaScript/TypeScript、Python、SQL 执行
 */

import type { NodeConfig, CodeNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables } from '../utils'

const EXECUTION_TIMEOUT = 10000
const MAX_OUTPUT_LENGTH = 50000
const MAX_LOG_ENTRIES = 100

type OutputType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined' | 'function' | 'error'
type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'sql'

interface CodeExecutionResult {
  success: boolean
  result?: unknown
  output?: string
  error?: string
  logs: string[]
  executionTime: number
  outputType: OutputType
  formattedOutput: string
}

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
      const language = (codeNode.config?.language || 'javascript') as SupportedLanguage

      if (!code.trim()) {
        throw new Error('代码不能为空')
      }

      code = replaceVariables(code, context)

      const inputs: Record<string, unknown> = {}
      for (const [, output] of context.nodeOutputs) {
        if (output.status === 'success') {
          inputs[output.nodeName] = output.data
        }
      }

      let result: CodeExecutionResult

      // 根据语言类型选择执行方式
      if (language === 'python' || language === 'sql') {
        // Python 和 SQL 使用服务端 API 执行
        result = await this.executeViaAPI(code, language, inputs)
      } else {
        // JavaScript/TypeScript 使用沙箱执行
        result = await this.executeCode(code, inputs)
      }

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
          type: result.outputType,
          formattedOutput: result.formattedOutput,
          logs: result.logs,
          logCount: result.logs.length,
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

  // 通过服务端 API 执行代码（Python / SQL）
  private async executeViaAPI(
    code: string,
    language: SupportedLanguage,
    inputs: Record<string, unknown>
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now()

    try {
      // 在服务端环境直接调用执行逻辑
      const { spawn } = await import('child_process')
      const { writeFile, unlink, mkdir } = await import('fs/promises')
      const { join } = await import('path')
      const { tmpdir } = await import('os')
      const { randomUUID } = await import('crypto')

      if (language === 'python') {
        return await this.executePython(code, inputs, { spawn, writeFile, unlink, mkdir, join, tmpdir, randomUUID })
      } else if (language === 'sql') {
        return await this.executeSQL(code, inputs)
      }

      return {
        success: false,
        error: `不支持的语言: ${language}`,
        logs: [],
        executionTime: Date.now() - startTime,
        outputType: 'error',
        formattedOutput: `Error: 不支持的语言: ${language}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: [],
        executionTime: Date.now() - startTime,
        outputType: 'error',
        formattedOutput: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // Python 执行器
  private async executePython(
    code: string,
    inputs: Record<string, unknown>,
    deps: {
      spawn: typeof import('child_process').spawn
      writeFile: typeof import('fs/promises').writeFile
      unlink: typeof import('fs/promises').unlink
      mkdir: typeof import('fs/promises').mkdir
      join: typeof import('path').join
      tmpdir: typeof import('os').tmpdir
      randomUUID: typeof import('crypto').randomUUID
    }
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now()
    const { spawn, writeFile, unlink, mkdir, join, tmpdir, randomUUID } = deps
    const tempDir = join(tmpdir(), 'ai-workflow-python')
    const fileId = randomUUID()
    const filePath = join(tempDir, `${fileId}.py`)

    try {
      await mkdir(tempDir, { recursive: true })

      const inputsJson = JSON.stringify(inputs).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const wrappedCode = `
import json
import sys

# 注入输入数据
inputs = json.loads('${inputsJson}')

# 用户代码
${code}
`
      await writeFile(filePath, wrappedCode, 'utf-8')

      const output = await new Promise<string>((resolve, reject) => {
        let stdout = ''
        let stderr = ''
        let killed = false

        const proc = spawn('python3', [filePath], {
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        })

        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        proc.on('close', (exitCode: number | null) => {
          if (killed) {
            reject(new Error(`执行超时 (${EXECUTION_TIMEOUT / 1000}秒)`))
          } else if (exitCode === 0) {
            resolve(stdout)
          } else {
            reject(new Error(stderr || `Python 进程退出码: ${exitCode}`))
          }
        })

        proc.on('error', (err: Error) => {
          if (err.message.includes('ENOENT')) {
            reject(new Error('未找到 Python3，请确保服务器已安装 Python3'))
          } else {
            reject(err)
          }
        })

        setTimeout(() => {
          killed = true
          proc.kill('SIGTERM')
        }, EXECUTION_TIMEOUT)
      })

      return {
        success: true,
        result: output,
        output: output.slice(0, MAX_OUTPUT_LENGTH),
        logs: [],
        executionTime: Date.now() - startTime,
        outputType: 'string',
        formattedOutput: output.slice(0, MAX_OUTPUT_LENGTH),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: [],
        executionTime: Date.now() - startTime,
        outputType: 'error',
        formattedOutput: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }
    } finally {
      try {
        await unlink(filePath)
      } catch {
        // 忽略清理错误
      }
    }
  }

  // SQL 执行器
  private async executeSQL(
    code: string,
    inputs: Record<string, unknown>
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now()

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3')
      const db = new Database(':memory:')

      // 如果 inputs 中有表数据，创建表并插入数据
      for (const [tableName, tableData] of Object.entries(inputs)) {
        if (Array.isArray(tableData) && tableData.length > 0 && typeof tableData[0] === 'object') {
          const columns = Object.keys(tableData[0] as object)
          const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ')

          db.exec(`CREATE TABLE "${tableName}" (${columnDefs})`)

          const placeholders = columns.map(() => '?').join(', ')
          const insertStmt = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`)

          for (const row of tableData) {
            const values = columns.map(col => {
              const val = (row as Record<string, unknown>)[col]
              return val === null || val === undefined ? null : String(val)
            })
            insertStmt.run(...values)
          }
        }
      }

      const statements = code.split(';').filter(s => s.trim())
      const results: string[] = []

      for (const stmt of statements) {
        const trimmedStmt = stmt.trim()
        if (!trimmedStmt) continue

        const upperStmt = trimmedStmt.toUpperCase()

        if (upperStmt.startsWith('SELECT') || upperStmt.startsWith('PRAGMA') || upperStmt.startsWith('EXPLAIN')) {
          const rows = db.prepare(trimmedStmt).all()
          if (rows.length > 0) {
            const columns = Object.keys(rows[0] as object)
            const header = columns.join(' | ')
            const separator = columns.map(c => '-'.repeat(c.length)).join('-+-')
            const dataRows = rows.slice(0, 100).map((row: Record<string, unknown>) =>
              columns.map(col => String(row[col] ?? 'NULL')).join(' | ')
            )
            results.push(`${header}\n${separator}\n${dataRows.join('\n')}`)
            if (rows.length > 100) {
              results.push(`... (共 ${rows.length} 行，仅显示前 100 行)`)
            }
          } else {
            results.push('(无结果)')
          }
        } else {
          const info = db.prepare(trimmedStmt).run()
          results.push(`执行成功，影响 ${info.changes} 行`)
        }
      }

      db.close()

      const output = results.join('\n\n')
      return {
        success: true,
        result: output,
        output: output.slice(0, MAX_OUTPUT_LENGTH),
        logs: [],
        executionTime: Date.now() - startTime,
        outputType: 'string',
        formattedOutput: output.slice(0, MAX_OUTPUT_LENGTH),
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      // 如果是模块未找到错误，给出更友好的提示
      if (errorMsg.includes('Cannot find module') || errorMsg.includes('MODULE_NOT_FOUND')) {
        return {
          success: false,
          error: 'SQL 执行需要安装 better-sqlite3 依赖。请运行: pnpm add better-sqlite3',
          logs: [],
          executionTime: Date.now() - startTime,
          outputType: 'error',
          formattedOutput: 'Error: SQL 执行需要安装 better-sqlite3 依赖',
        }
      }
      return {
        success: false,
        error: errorMsg,
        logs: [],
        executionTime: Date.now() - startTime,
        outputType: 'error',
        formattedOutput: `Error: ${errorMsg}`,
      }
    }
  }

  // JavaScript/TypeScript 沙箱执行器
  private async executeCode(
    code: string,
    inputs: Record<string, unknown>
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now()
    const logs: string[] = []

    const addLog = (level: string, ...args: unknown[]) => {
      if (logs.length < MAX_LOG_ENTRIES) {
        const formattedArgs = args.map(a => this.formatValue(a, 2)).join(' ')
        logs.push(`[${level}] ${formattedArgs}`)
      }
    }

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
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      atob: typeof atob !== 'undefined' ? atob : undefined,
      btoa: typeof btoa !== 'undefined' ? btoa : undefined,
      inputs,
      console: {
        log: (...args: unknown[]) => addLog('LOG', ...args),
        error: (...args: unknown[]) => addLog('ERROR', ...args),
        warn: (...args: unknown[]) => addLog('WARN', ...args),
        info: (...args: unknown[]) => addLog('INFO', ...args),
        debug: (...args: unknown[]) => addLog('DEBUG', ...args),
        table: (data: unknown) => addLog('TABLE', data),
      },
    }

    const forbidden = [
      'require', 'process', 'global', '__dirname', '__filename',
      'module', 'exports', 'Buffer', 'fetch', 'XMLHttpRequest',
      'WebSocket', 'eval', 'Function', 'Proxy', 'Reflect',
      'importScripts', 'Worker', 'SharedWorker',
    ]

    try {
      const wrappedCode = `
        "use strict";
        ${forbidden.map(f => `const ${f} = undefined;`).join('\n')}

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

      const fn = new Function(...Object.keys(safeGlobals), wrappedCode)

      const result = await Promise.race([
        Promise.resolve(fn(...Object.values(safeGlobals))),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`代码执行超时 (${EXECUTION_TIMEOUT / 1000}秒)`)), EXECUTION_TIMEOUT)
        ),
      ])

      const executionTime = Date.now() - startTime
      const outputType = this.getOutputType(result)
      const formattedOutput = this.formatValue(result, 4)

      return {
        success: true,
        result,
        output: logs.join('\n').slice(0, MAX_OUTPUT_LENGTH),
        logs,
        executionTime,
        outputType,
        formattedOutput,
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        success: false,
        error: errorMessage,
        logs,
        executionTime,
        outputType: 'error',
        formattedOutput: `Error: ${errorMessage}`,
      }
    }
  }

  private getOutputType(value: unknown): OutputType {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (Array.isArray(value)) return 'array'
    if (typeof value === 'function') return 'function'
    if (value instanceof Error) return 'error'
    return typeof value as OutputType
  }

  private formatValue(value: unknown, maxDepth: number = 2, currentDepth: number = 0): string {
    if (currentDepth > maxDepth) {
      return '[...]'
    }

    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'function') return '[Function]'
    if (value instanceof Error) return `Error: ${value.message}`
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return value.toString()
    if (value instanceof Map) {
      const entries = Array.from(value.entries())
      return `Map(${entries.length}) { ${entries.slice(0, 5).map(([k, v]) => 
        `${this.formatValue(k, maxDepth, currentDepth + 1)} => ${this.formatValue(v, maxDepth, currentDepth + 1)}`
      ).join(', ')}${entries.length > 5 ? ', ...' : ''} }`
    }
    if (value instanceof Set) {
      const items = Array.from(value)
      return `Set(${items.length}) { ${items.slice(0, 5).map(v => 
        this.formatValue(v, maxDepth, currentDepth + 1)
      ).join(', ')}${items.length > 5 ? ', ...' : ''} }`
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]'
      if (currentDepth >= maxDepth) return `[Array(${value.length})]`
      
      const items = value.slice(0, 10).map(v => 
        this.formatValue(v, maxDepth, currentDepth + 1)
      )
      return `[${items.join(', ')}${value.length > 10 ? `, ... (${value.length - 10} more)` : ''}]`
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as object)
      if (keys.length === 0) return '{}'
      if (currentDepth >= maxDepth) return `{Object(${keys.length} keys)}`

      const entries = keys.slice(0, 10).map(k => 
        `${k}: ${this.formatValue((value as Record<string, unknown>)[k], maxDepth, currentDepth + 1)}`
      )
      return `{ ${entries.join(', ')}${keys.length > 10 ? `, ... (${keys.length - 10} more)` : ''} }`
    }

    if (typeof value === 'string') {
      if (value.length > 200) {
        return `"${value.slice(0, 200)}..." (${value.length} chars)`
      }
      return JSON.stringify(value)
    }

    return String(value)
  }
}

export const codeNodeProcessor = new CodeNodeProcessor()
