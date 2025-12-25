/**
 * Native Task Runner
 * 使用原生 Node.js 功能执行代码（主要用于 SQL）
 *
 * 特性：
 * - 轻量级，无需额外依赖
 * - 适用于 SQL 等需要数据库连接的场景
 * - 使用内存数据库进行安全执行
 */

import type {
  ExecutionLanguage,
  ExecutionContext,
  ExecutionResult,
  ResourceLimits,
} from './types'
import { BaseTaskRunner, LogCollector } from './base-runner'
import type { RunnerType } from './types'
import type { Database } from 'better-sqlite3'

// 动态加载 better-sqlite3
let Database: typeof import('better-sqlite3') | null = null
let dbLoadError: Error | null = null

async function loadBetterSqlite3(): Promise<typeof import('better-sqlite3') | null> {
  if (Database) return Database
  if (dbLoadError) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require('better-sqlite3')
    return Database
  } catch (error) {
    dbLoadError = error instanceof Error ? error : new Error(String(error))
    return null
  }
}

/**
 * Native Task Runner
 */
export class NativeRunner extends BaseTaskRunner {
  readonly type: RunnerType = 'native'
  readonly supportedLanguages: ExecutionLanguage[] = ['sql']

  /**
   * 检查是否可用
   */
  async isAvailable(): Promise<boolean> {
    const db = await loadBetterSqlite3()
    return db !== null
  }

  /**
   * 执行代码
   */
  async execute(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>
  ): Promise<ExecutionResult> {
    if (!this.supportedLanguages.includes(language)) {
      return this.createErrorResult(
        `NativeRunner 不支持 ${language} 语言`,
        new Date()
      )
    }

    return this.executeWithTracking(code, language, context, limits)
  }

  /**
   * 内部执行实现
   */
  protected async executeInternal(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits: ResourceLimits
  ): Promise<ExecutionResult> {
    const startedAt = new Date()
    const logCollector = new LogCollector()

    if (language === 'sql') {
      return this.executeSQL(code, context.inputs, limits, logCollector, startedAt)
    }

    return this.createErrorResult(`不支持的语言: ${language}`, startedAt)
  }

  /**
   * 执行 SQL
   */
  private async executeSQL(
    code: string,
    inputs: Record<string, unknown>,
    limits: ResourceLimits,
    logCollector: LogCollector,
    startedAt: Date
  ): Promise<ExecutionResult> {
    const BetterSqlite3 = await loadBetterSqlite3()

    if (!BetterSqlite3) {
      return this.createErrorResult(
        'SQL 执行需要安装 better-sqlite3 依赖。请运行: pnpm add better-sqlite3',
        startedAt
      )
    }

    let db: Database | null = null

    try {
      // 创建内存数据库
      db = new BetterSqlite3(':memory:')

      // 设置超时
      db.pragma(`busy_timeout = ${Math.min(limits.maxExecutionTime, 60000)}`)

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

          logCollector.add('info', `已创建表 "${tableName}"，共 ${tableData.length} 行`)
        }
      }

      // 执行 SQL 语句
      const statements = code.split(';').filter(s => s.trim())
      const results: string[] = []
      const maxOutputSize = limits.maxOutputSize ?? 1024 * 1024

      for (const stmt of statements) {
        const trimmedStmt = stmt.trim()
        if (!trimmedStmt) continue

        const upperStmt = trimmedStmt.toUpperCase()

        if (upperStmt.startsWith('SELECT') || upperStmt.startsWith('PRAGMA') || upperStmt.startsWith('EXPLAIN')) {
          const rows = db.prepare(trimmedStmt).all()

          if (rows.length > 0) {
            const columns = Object.keys(rows[0] as object)
            const header = columns.join(' | ')
            const separator = columns.map(c => '-'.repeat(Math.max(c.length, 4))).join('-+-')

            const dataRows = (rows as Array<Record<string, unknown>>).slice(0, 100).map((row) =>
              columns.map(col => {
                const val = row[col]
                return val === null ? 'NULL' : String(val).slice(0, 50)
              }).join(' | ')
            )

            results.push(`${header}\n${separator}\n${dataRows.join('\n')}`)

            if (rows.length > 100) {
              results.push(`... (共 ${rows.length} 行，仅显示前 100 行)`)
            }

            logCollector.add('log', `查询返回 ${rows.length} 行`)
          } else {
            results.push('(无结果)')
          }
        } else {
          const info = db.prepare(trimmedStmt).run()
          results.push(`执行成功，影响 ${info.changes} 行`)
          logCollector.add('log', `执行成功，影响 ${info.changes} 行`)
        }

        // 检查输出大小
        if (results.join('\n\n').length > maxOutputSize) {
          results.push('... (输出已截断)')
          break
        }
      }

      const output = results.join('\n\n')

      return {
        success: true,
        output,
        formattedOutput: output.slice(0, maxOutputSize),
        outputType: 'string',
        logs: logCollector.getLogs(),
        metrics: {
          executionTime: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return this.createErrorResult(
        errorMessage,
        startedAt,
        error instanceof Error ? error.stack : undefined,
        logCollector.getLogs()
      )
    } finally {
      if (db) {
        try {
          db.close()
        } catch {
          // 忽略关闭错误
        }
      }
    }
  }
}

// 导出单例
let defaultRunner: NativeRunner | null = null

export function getNativeRunner(): NativeRunner {
  if (!defaultRunner) {
    defaultRunner = new NativeRunner()
  }
  return defaultRunner
}
