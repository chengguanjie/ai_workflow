/**
 * 飞书多维表格（Bitable）工具执行器
 *
 * 最小可用版本：基于 Tenant Access Token 对记录进行 CRUD。
 * Token 目前从环境变量读取，避免将敏感信息持久化到工作流配置中。
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'

type BitableOperation = 'read' | 'create' | 'update' | 'delete' | 'search'

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`缺少必需参数: ${key}`)
  }
  return value.trim()
}

function requireObject(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`缺少必需参数: ${key}（必须为对象）`)
  }
  return value as Record<string, unknown>
}

function getOperation(args: Record<string, unknown>): BitableOperation {
  const op = (args.operation as string | undefined) || 'read'
  if (!['read', 'create', 'update', 'delete', 'search'].includes(op)) {
    throw new Error(`不支持的 operation: ${op}`)
  }
  return op as BitableOperation
}

function getTenantAccessToken(context: ToolExecutionContext): string {
  const fromVars = context.variables?.FEISHU_TENANT_ACCESS_TOKEN
  if (typeof fromVars === 'string' && fromVars.trim()) return fromVars.trim()

  const fromEnv = process.env.FEISHU_TENANT_ACCESS_TOKEN
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  throw new Error('缺少飞书鉴权：请设置环境变量 FEISHU_TENANT_ACCESS_TOKEN（或在工具执行上下文 variables 中提供）')
}

function withQuery(url: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    u.searchParams.set(k, String(v))
  }
  return u.toString()
}

export class FeishuBitableToolExecutor implements ToolExecutor {
  name = 'feishu_bitable'
  description = '读写飞书多维表格（Bitable）记录（CRUD）'
  category = 'data'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'data',
      parameters: [
        { name: 'operation', type: 'string', description: '操作类型：read/create/update/delete/search', required: true, enum: ['read', 'create', 'update', 'delete', 'search'] },
        { name: 'app_token', type: 'string', description: 'Bitable App Token（形如: appxxxxxxxx）', required: true },
        { name: 'table_id', type: 'string', description: '数据表 ID', required: true },
        { name: 'record_id', type: 'string', description: '记录 ID（update/delete 时必填）', required: false },
        { name: 'fields', type: 'object', description: '记录字段对象（create/update 时必填）', required: false },
        { name: 'page_size', type: 'number', description: 'read/search：每页数量（默认 20，最大 500）', required: false, default: 20 },
        { name: 'page_token', type: 'string', description: 'read/search：分页 token', required: false },
        { name: 'view_id', type: 'string', description: 'read/search：视图 ID（可选）', required: false },
        { name: 'filter', type: 'object', description: 'search：过滤条件（按飞书 Bitable API 格式）', required: false },
      ],
    }
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolCallResult> {
    const startedAt = Date.now()

    try {
      const operation = getOperation(args)
      const appToken = requireString(args, 'app_token')
      const tableId = requireString(args, 'table_id')
      const token = getTenantAccessToken(context)

      const base = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`

      const commonHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      }

      if (context.testMode) {
        return {
          toolCallId: '',
          toolName: this.name,
          success: true,
          duration: Date.now() - startedAt,
          result: {
            testMode: true,
            operation,
            appToken,
            tableId,
            note: '测试模式不会真实调用飞书 API',
          },
        }
      }

      let response: Response
      switch (operation) {
        case 'read': {
          const pageSizeRaw = typeof args.page_size === 'number' ? args.page_size : 20
          const pageSize = Math.max(1, Math.min(500, Math.floor(pageSizeRaw)))
          const pageToken = typeof args.page_token === 'string' ? args.page_token : undefined
          const viewId = typeof args.view_id === 'string' ? args.view_id : undefined

          const url = withQuery(base, { page_size: pageSize, page_token: pageToken, view_id: viewId })
          response = await fetch(url, { method: 'GET', headers: commonHeaders })
          break
        }

        case 'create': {
          const fields = requireObject(args, 'fields')
          response = await fetch(base, { method: 'POST', headers: commonHeaders, body: JSON.stringify({ fields }) })
          break
        }

        case 'update': {
          const recordId = requireString(args, 'record_id')
          const fields = requireObject(args, 'fields')
          const url = `${base}/${encodeURIComponent(recordId)}`
          response = await fetch(url, { method: 'PUT', headers: commonHeaders, body: JSON.stringify({ fields }) })
          break
        }

        case 'delete': {
          const recordId = requireString(args, 'record_id')
          const url = `${base}/${encodeURIComponent(recordId)}`
          response = await fetch(url, { method: 'DELETE', headers: commonHeaders })
          break
        }

        case 'search': {
          const pageSizeRaw = typeof args.page_size === 'number' ? args.page_size : 20
          const pageSize = Math.max(1, Math.min(500, Math.floor(pageSizeRaw)))
          const pageToken = typeof args.page_token === 'string' ? args.page_token : undefined
          const viewId = typeof args.view_id === 'string' ? args.view_id : undefined
          const filter = args.filter && typeof args.filter === 'object' && !Array.isArray(args.filter)
            ? (args.filter as Record<string, unknown>)
            : undefined

          const url = withQuery(`${base}/search`, { page_size: pageSize, page_token: pageToken, view_id: viewId })
          response = await fetch(url, { method: 'POST', headers: commonHeaders, body: JSON.stringify({ filter }) })
          break
        }
      }

      const raw = await response.text()
      let json: unknown = raw
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch {
        // keep raw text
      }

      if (!response.ok) {
        return {
          toolCallId: '',
          toolName: this.name,
          success: false,
          duration: Date.now() - startedAt,
          error: `Feishu API error: HTTP ${response.status} ${response.statusText}`,
          result: json,
        }
      }

      return {
        toolCallId: '',
        toolName: this.name,
        success: true,
        duration: Date.now() - startedAt,
        result: json,
      }
    } catch (error) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        duration: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

