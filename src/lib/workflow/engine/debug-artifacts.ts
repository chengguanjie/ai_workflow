/**
 * 节点调试过程持久化（运行时）
 *
 * - 采集 processors 通过 context.addLog 写入的结构化日志
 * - 在节点结束时落地为 OutputFile(JSON) 以便查询/下载
 */

import { storageService } from '@/lib/storage'
import type { NodeConfig } from '@/types/workflow'
import type { ExecutionLogEntry, ExecutionLogType, NodeOutput } from '../types'
import { redactDeep } from '@/lib/observability/redaction'

type PersistedDebugPayload = {
  version: 1
  executionId: string
  node: { id: string; name: string; type: string }
  status: NodeOutput['status']
  startedAt?: string
  completedAt?: string
  duration?: number
  tokenUsage?: NodeOutput['tokenUsage']
  error?: string
  /** 完整的节点输出数据（不截断） */
  output?: Record<string, unknown>
  logs: Array<{
    type: ExecutionLogType
    message: string
    timestamp: string
    step?: string
    data?: unknown
  }>
  legacyLogs: string[]
}

const LIMITS = {
  MAX_LOG_ENTRIES: 500,
  MAX_STRING_LENGTH: 4000,
  MAX_JSON_STRING_LENGTH: 20_000,
  MAX_OBJECT_DEPTH: 8,  // 增加深度限制，避免工具调用结果被过度截断
}

function truncateString(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input
  return input.slice(0, maxLen) + `…[truncated ${input.length - maxLen} chars]`
}

function truncateUnknown(value: unknown, depth: number = 0): unknown {
  if (depth > LIMITS.MAX_OBJECT_DEPTH) return '[truncated: max depth]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateString(value, LIMITS.MAX_STRING_LENGTH)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const sliced = value.slice(0, 50).map((v) => truncateUnknown(v, depth + 1))
    if (value.length > 50) sliced.push(`[... ${value.length - 50} more items]`)
    return sliced
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const entries = Object.entries(obj).slice(0, 100)
    for (const [k, v] of entries) out[k] = truncateUnknown(v, depth + 1)
    if (Object.keys(obj).length > 100) out._truncatedKeys = Object.keys(obj).length - 100
    return out
  }
  return String(value)
}

function toLegacyLogLine(entry: ExecutionLogEntry): string[] {
  const timeStr = entry.timestamp.toLocaleTimeString('zh-CN', { hour12: false })
  let icon = '🔹'
  if (entry.type === 'step') icon = '⚡'
  if (entry.type === 'success') icon = '✅'
  if (entry.type === 'warning') icon = '⚠️'
  if (entry.type === 'error') icon = '❌'

  let first = `[${timeStr}] ${icon} ${entry.message}`
  if (entry.step) first = `[${timeStr}] ${icon} [${entry.step}] ${entry.message}`
  const lines = [first]

  if (entry.data !== undefined) {
    try {
      const truncated = truncateUnknown(entry.data)
      const json = JSON.stringify(truncated, null, 2)
      const safe = truncateString(json, LIMITS.MAX_JSON_STRING_LENGTH)
      lines.push(`  ${safe.split('\n').join('\n  ')}`)
    } catch {
      lines.push(`  [Data] ${truncateString(String(entry.data), LIMITS.MAX_STRING_LENGTH)}`)
    }
  }

  return lines
}

export class NodeDebugArtifactCollector {
  private executionId: string
  private organizationId: string
  private nodeLogs: Map<string, ExecutionLogEntry[]> = new Map()
  private nodeLegacyLogs: Map<string, string[]> = new Map()

  constructor(executionId: string, organizationId: string) {
    this.executionId = executionId
    this.organizationId = organizationId
  }

  /**
   * 返回一个绑定到当前节点的 addLog，用于注入到 ExecutionContext。
   */
  createNodeScopedAddLog(node: NodeConfig) {
    return (type: ExecutionLogType, message: string, step?: string, data?: unknown) => {
      const entry: ExecutionLogEntry = {
        type,
        message: truncateString(message, LIMITS.MAX_STRING_LENGTH),
        step: step ? truncateString(step, 200) : undefined,
        data: data === undefined ? undefined : truncateUnknown(redactDeep(data)),
        timestamp: new Date(),
      }

      const list = this.nodeLogs.get(node.id) ?? []
      if (list.length < LIMITS.MAX_LOG_ENTRIES) {
        list.push(entry)
        this.nodeLogs.set(node.id, list)
      }

      const legacy = this.nodeLegacyLogs.get(node.id) ?? []
      for (const line of toLegacyLogLine(entry)) {
        if (legacy.length >= LIMITS.MAX_LOG_ENTRIES * 2) break
        legacy.push(line)
      }
      this.nodeLegacyLogs.set(node.id, legacy)
    }
  }

  /**
   * 节点结束时，落地一份 JSON 作为 OutputFile（本地 + 数据库记录）。
   *
   * 说明：
   * - 使用固定 fileName，便于按 executionId+nodeId 查询最新的一份。
   * - 该文件也会出现在“输出文件”列表中，支持下载。
   */
  async persistNodeDebugFile(node: NodeConfig, result: NodeOutput): Promise<void> {
    const logs = this.nodeLogs.get(node.id) ?? []
    const legacyLogs = this.nodeLegacyLogs.get(node.id) ?? []

    const shouldRedact = process.env.PERSIST_NODE_DEBUG_REDACT !== 'false'

    const payload: PersistedDebugPayload = {
      version: 1,
      executionId: this.executionId,
      node: { id: node.id, name: node.name, type: node.type },
      status: result.status,
      startedAt: result.startedAt ? result.startedAt.toISOString() : undefined,
      completedAt: result.completedAt ? result.completedAt.toISOString() : undefined,
      duration: result.duration,
      tokenUsage: result.tokenUsage,
      error: shouldRedact && result.error ? String(redactDeep(result.error)) : result.error,
      // 保存完整的输出数据（不截断），用于用户查看完整内容
      output: (shouldRedact ? redactDeep(result.data) : result.data) as Record<string, unknown>,
      logs: logs.map((l) => ({
        type: l.type,
        message: l.message,
        step: l.step,
        data: shouldRedact ? redactDeep(l.data) : l.data,
        timestamp: l.timestamp.toISOString(),
      })),
      legacyLogs,
    }

    const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8')

    await storageService.uploadAndSave({
      file: buffer,
      fileName: `__debug__${node.id}.json`,
      mimeType: 'application/json',
      format: 'json',
      organizationId: this.organizationId,
      executionId: this.executionId,
      nodeId: node.id,
      metadata: {
        kind: 'node_debug',
        nodeName: node.name,
        nodeType: node.type,
        version: 1,
      },
    })
  }
}
