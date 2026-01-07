/**
 * 通过 V1 Public API 执行工作流 + 追踪节点输入输出 + 按提示词契约校验 + (可选) 自动修复后重跑
 *
 * 运行：
 *   WORKFLOW_API_TOKEN=wf_xxx \
 *   pnpm -s workflow:trace:api -- --base-url http://127.0.0.1:3100 --workflow-id <id> --apply
 *
 * 说明：
 * - 需要 token 具备至少 scopes: ["workflows", "executions"]，否则无法拉取节点日志做对照。
 * - --apply 会通过 PUT /api/v1/workflows/[id] 写回工作流 config/draftConfig（并做版本冲突检查）。
 */

import type { WorkflowConfig, NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Agent } from 'undici'
import { PrismaClient } from '@prisma/client'
import { encryptApiKey, maskApiKey } from '@/lib/crypto'
import {
  fixExpectedOutputTypesFromPrompts,
  fixInputVariableReferences,
  inferExpectedType,
  validateNodeOutputAgainstPrompt,
  type PromptViolation,
} from '@/lib/workflow/validation'
import { SHENSUAN_DEFAULT_MODELS, getModelModality } from '@/lib/ai/types'

type JsonObject = Record<string, unknown>

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args.set(key, true)
    } else {
      args.set(key, next)
      i++
    }
  }

  const baseUrl = ((args.get('--base-url') as string | undefined) || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3100').replace(/\/$/, '')
  const workflowId = (args.get('--workflow-id') as string | undefined) || ''
  const mode = ((args.get('--mode') as string | undefined) || 'draft') as 'draft' | 'production'
  const maxIterationsRaw = (args.get('--max-iterations') as string | undefined) || '3'
  const maxIterations = Number.parseInt(maxIterationsRaw, 10)
  const apply = Boolean(args.get('--apply'))
  const inputPath = (args.get('--input') as string | undefined) || ''
  const headersTimeoutMsRaw = (args.get('--headers-timeout-ms') as string | undefined) || process.env.WORKFLOW_API_HEADERS_TIMEOUT_MS || '600000'
  const bodyTimeoutMsRaw = (args.get('--body-timeout-ms') as string | undefined) || process.env.WORKFLOW_API_BODY_TIMEOUT_MS || '3600000'
  const headersTimeoutMs = Number.parseInt(headersTimeoutMsRaw, 10)
  const bodyTimeoutMs = Number.parseInt(bodyTimeoutMsRaw, 10)
  const asyncExecution = Boolean(args.get('--async'))
  const pollIntervalMsRaw = (args.get('--poll-interval-ms') as string | undefined) || process.env.WORKFLOW_API_POLL_INTERVAL_MS || '2000'
  const pollTimeoutMsRaw = (args.get('--poll-timeout-ms') as string | undefined) || process.env.WORKFLOW_API_POLL_TIMEOUT_MS || '1800000'
  const pollIntervalMs = Number.parseInt(pollIntervalMsRaw, 10)
  const pollTimeoutMs = Number.parseInt(pollTimeoutMsRaw, 10)

  if (!workflowId) throw new Error('Missing required arg: --workflow-id <id>')
  if (mode !== 'draft' && mode !== 'production') throw new Error(`Invalid --mode: ${mode}`)
  if (!Number.isFinite(maxIterations) || maxIterations <= 0) throw new Error(`Invalid --max-iterations: ${maxIterationsRaw}`)
  if (!Number.isFinite(headersTimeoutMs) || headersTimeoutMs <= 0) throw new Error(`Invalid --headers-timeout-ms: ${headersTimeoutMsRaw}`)
  if (!Number.isFinite(bodyTimeoutMs) || bodyTimeoutMs <= 0) throw new Error(`Invalid --body-timeout-ms: ${bodyTimeoutMsRaw}`)
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new Error(`Invalid --poll-interval-ms: ${pollIntervalMsRaw}`)
  if (!Number.isFinite(pollTimeoutMs) || pollTimeoutMs <= 0) throw new Error(`Invalid --poll-timeout-ms: ${pollTimeoutMsRaw}`)

  return { baseUrl, workflowId, mode, maxIterations, apply, inputPath, headersTimeoutMs, bodyTimeoutMs, asyncExecution, pollIntervalMs, pollTimeoutMs }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function readJsonFileIfProvided(path: string): Promise<Record<string, unknown> | undefined> {
  if (!path) return undefined
  const fs = await import('node:fs/promises')
  const content = await fs.readFile(path, 'utf8')
  const parsed = JSON.parse(content) as unknown
  if (!isObject(parsed)) throw new Error(`--input file must be a JSON object: ${path}`)
  return parsed
}

async function apiFetch<T>(
  dispatcher: Agent,
  baseUrl: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    dispatcher,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const message =
      (isObject(data) && typeof data['error'] === 'string' && data['error']) ||
      (isObject(data) && typeof data['message'] === 'string' && data['message']) ||
      `HTTP ${res.status}`
    throw new Error(`${path}: ${message}`)
  }
  return data as T
}

type ApiSuccess<T> = { success: true; data: T }

const prisma = new PrismaClient()

async function getWorkflow(dispatcher: Agent, baseUrl: string, token: string, workflowId: string) {
  const res = await apiFetch<ApiSuccess<{
    id: string
    name: string
    description: string | null
    config: WorkflowConfig
    draftConfig: WorkflowConfig | null
    publishedConfig: WorkflowConfig | null
    publishStatus: string
    version: number
    updatedAt: string
  }>>(dispatcher, baseUrl, token, `/api/v1/workflows/${workflowId}`, { method: 'GET' })
  return res.data
}

async function ensureOpenAIApiKeyForTokenOrg(apiToken: string): Promise<{ id: string; defaultModel: string } | null> {
  const envKey = process.env.OPENAI_API_KEY
  if (!envKey) return null

  const tokenRow = await prisma.apiToken.findFirst({
    where: { token: apiToken, isActive: true },
    select: { organizationId: true, createdById: true },
  })
  if (!tokenRow) return null

  const existing = await prisma.apiKey.findFirst({
    where: {
      organizationId: tokenRow.organizationId,
      provider: 'OPENAI',
      isActive: true,
      name: 'AutoFix: OpenAI (env)',
    },
    select: { id: true, defaultModel: true },
  })
  if (existing) return { id: existing.id, defaultModel: existing.defaultModel || 'gpt-4o-mini' }

  const defaultModel = 'gpt-4o-mini'
  const created = await prisma.apiKey.create({
    data: {
      name: 'AutoFix: OpenAI (env)',
      provider: 'OPENAI',
      keyEncrypted: encryptApiKey(envKey),
      keyMasked: maskApiKey(envKey),
      isActive: true,
      organizationId: tokenRow.organizationId,
      defaultModel,
      isDefault: false,
      baseUrl: '',
      models: { text: [defaultModel] },
      defaultModels: { text: defaultModel },
    },
    select: { id: true, defaultModel: true },
  })

  return { id: created.id, defaultModel: created.defaultModel || defaultModel }
}

async function getTokenIdentity(apiToken: string): Promise<{ organizationId: string; createdById: string } | null> {
  const tokenRow = await prisma.apiToken.findFirst({
    where: { token: apiToken, isActive: true },
    select: { organizationId: true, createdById: true },
  })
  if (!tokenRow) return null
  return { organizationId: tokenRow.organizationId, createdById: tokenRow.createdById }
}

async function findDefaultActiveAIConfigForOrg(apiToken: string): Promise<{ id: string; defaultModel: string } | null> {
  const ident = await getTokenIdentity(apiToken)
  if (!ident) return null

  const apiKey = await prisma.apiKey.findFirst({
    where: { organizationId: ident.organizationId, isActive: true, isDefault: true },
    select: { id: true, defaultModel: true },
  })
  if (!apiKey) return null
  return { id: apiKey.id, defaultModel: apiKey.defaultModel || 'anthropic/claude-sonnet-4.5' }
}

async function fixInvalidOpenAIKeyBySwitchingToDefaultAIConfig(
  config: WorkflowConfig,
  apiToken: string,
  failedLogs: Array<{ error: string | null }>
): Promise<{ changed: boolean; changes: string[] }> {
  const changes: string[] = []
  const has401 = failedLogs.some(l => (l.error || '').includes('OpenAI API error: 401'))
  if (!has401) return { changed: false, changes }

  const fallback = await findDefaultActiveAIConfigForOrg(apiToken)
  if (!fallback) {
    changes.push('检测到 OpenAI 401（无效 API Key），但未找到组织默认 AI 配置，无法自动切换')
    return { changed: false, changes }
  }

  let changed = false
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const p = node as ProcessNodeConfig
    if (!p.config) p.config = {}

    const beforeId = typeof p.config.aiConfigId === 'string' ? p.config.aiConfigId : ''
    const beforeModel = typeof p.config.model === 'string' ? p.config.model : ''

    p.config.aiConfigId = fallback.id
    p.config.model = fallback.defaultModel
    p.config.modality = 'text'

    if (beforeId !== fallback.id || beforeModel !== fallback.defaultModel) {
      changed = true
      changes.push(`节点 "${node.name}": 检测到 OpenAI 401，已切换 aiConfigId=${fallback.id} 且 model=${fallback.defaultModel}`)
    }
  }

  return { changed, changes }
}

async function fixUndecryptableAIConfigBySwitchingToOpenAI(
  config: WorkflowConfig,
  apiToken: string,
  failedLogs: Array<{ error: string | null }>
): Promise<{ changed: boolean; changes: string[] }> {
  const changes: string[] = []

  const decryptError = failedLogs.some(l => (l.error || '').includes('无法解密 API Key'))
  if (!decryptError) return { changed: false, changes }

  const fallback = await findDefaultActiveAIConfigForOrg(apiToken)
  if (fallback) {
    let changed = false
    for (const node of config.nodes) {
      if (node.type !== 'PROCESS') continue
      const p = node as ProcessNodeConfig
      if (!p.config) p.config = {}

      const beforeConfigId = typeof p.config.aiConfigId === 'string' ? p.config.aiConfigId : ''
      const beforeModel = typeof p.config.model === 'string' ? p.config.model : ''

      p.config.aiConfigId = fallback.id
      p.config.model = fallback.defaultModel
      p.config.modality = 'text'

      if (beforeConfigId !== fallback.id || beforeModel !== fallback.defaultModel) {
        changed = true
        changes.push(`节点 "${node.name}": AI 配置解密失败，已切换到组织默认配置 aiConfigId=${fallback.id} model=${fallback.defaultModel}`)
      }
    }
    return { changed, changes }
  }

  const openAiConfig = await ensureOpenAIApiKeyForTokenOrg(apiToken)
  if (!openAiConfig) {
    changes.push('检测到 API Key 解密失败，但未找到组织默认 AI 配置，也未提供可用的 OPENAI_API_KEY，无法自动修复')
    return { changed: false, changes }
  }

  let changed = false
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const p = node as ProcessNodeConfig

    const beforeConfigId = typeof p.config?.aiConfigId === 'string' ? p.config.aiConfigId : ''
    if (!p.config) p.config = {}
    p.config.aiConfigId = openAiConfig.id

    const beforeModel = typeof p.config.model === 'string' ? p.config.model : ''
    const nextModel = openAiConfig.defaultModel
    p.config.model = nextModel

    if (beforeConfigId !== openAiConfig.id || beforeModel !== nextModel) {
      changed = true
      changes.push(`节点 "${node.name}": AI 配置解密失败，已切换 aiConfigId=${openAiConfig.id} 且 model=${nextModel}`)
    }
  }

  return { changed, changes }
}

async function updateWorkflowConfig(
  dispatcher: Agent,
  baseUrl: string,
  token: string,
  workflowId: string,
  expectedVersion: number,
  config: WorkflowConfig
): Promise<{ version: number }> {
  // Ensure monotonic version bump, otherwise the API may keep the same version and hide concurrent edits.
  config.version = expectedVersion + 1
  const res = await apiFetch<ApiSuccess<{ id: string; version: number }>>(
    dispatcher,
    baseUrl,
    token,
    `/api/v1/workflows/${workflowId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        config,
        expectedVersion,
        forceOverwrite: false,
        publish: false,
      }),
    }
  )
  return { version: res.data.version }
}

async function executeWorkflowV1(
  dispatcher: Agent,
  baseUrl: string,
  token: string,
  workflowId: string,
  mode: 'draft' | 'production',
  input: Record<string, unknown> | undefined,
  asyncExecution: boolean
) {
  const res = await apiFetch<ApiSuccess<
    | {
        // sync
        executionId: string
        status: string
        output?: Record<string, unknown>
        error?: string
        duration?: number
        totalTokens?: number
        promptTokens?: number
        completionTokens?: number
        outputFiles?: Array<{ fileName: string; format: string; size: number; url: string }>
      }
    | {
        // async
        taskId: string
        status: string
        message?: string
        pollUrl?: string
      }
  >>(dispatcher, baseUrl, token, `/api/v1/workflows/${workflowId}/execute`, {
    method: 'POST',
    body: JSON.stringify(asyncExecution ? { input, async: true, mode } : { input, mode }),
  })
  return res.data
}

async function getExecutionDetail(dispatcher: Agent, baseUrl: string, token: string, workflowId: string, executionId: string) {
  const res = await apiFetch<ApiSuccess<{
    id: string
    status: string
    input: unknown
    output: unknown
    totalTokens: number | null
    promptTokens: number | null
    completionTokens: number | null
    estimatedCost: number | null
    error: string | null
    logs: Array<{
      nodeId: string
      nodeName: string
      nodeType: string
      status: string
      input: unknown
      output: unknown
      error: string | null
      startedAt: string
      duration: number | null
      aiModel: string | null
      promptTokens: number | null
      completionTokens: number | null
    }>
  }>>(dispatcher, baseUrl, token, `/api/v1/workflows/${workflowId}/executions/${executionId}`, { method: 'GET' })
  return res.data
}

async function getTaskStatus(dispatcher: Agent, baseUrl: string, token: string, taskId: string) {
  const res = await apiFetch<ApiSuccess<{
    taskId: string
    status: string
    createdAt: string
    startedAt?: string
    completedAt?: string
    executionId?: string
    executionStatus?: string
    result?: {
      output?: unknown
      error?: unknown
      duration?: unknown
      totalTokens?: unknown
    }
  }>>(dispatcher, baseUrl, token, `/api/v1/tasks/${taskId}`, { method: 'GET' })
  return res.data
}

async function waitForTaskCompletion(
  dispatcher: Agent,
  baseUrl: string,
  token: string,
  taskId: string,
  pollIntervalMs: number,
  pollTimeoutMs: number
) {
  const start = Date.now()
  let lastStatus = ''
  let lastExecutionStatus = ''
  let consecutiveErrors = 0

  while (true) {
    let task: Awaited<ReturnType<typeof getTaskStatus>>
    try {
      task = await getTaskStatus(dispatcher, baseUrl, token, taskId)
      consecutiveErrors = 0
    } catch (err) {
      consecutiveErrors++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`任务状态查询失败(第 ${consecutiveErrors} 次): ${msg}`)
      if (consecutiveErrors >= 5) throw err
      await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs * consecutiveErrors, 10_000)))
      continue
    }
    const status = String(task.status || '')
    const execStatus = task.executionStatus ? String(task.executionStatus) : ''

    if (status !== lastStatus || execStatus !== lastExecutionStatus) {
      const extra = [
        task.executionId ? `executionId=${task.executionId}` : '',
        execStatus ? `executionStatus=${execStatus}` : '',
      ].filter(Boolean).join(' ')
      console.log(`任务状态: ${status}${extra ? ` (${extra})` : ''}`)
      lastStatus = status
      lastExecutionStatus = execStatus
    }

    if (status === 'completed' || status === 'failed') return task

    if (Date.now() - start > pollTimeoutMs) {
      throw new Error(`Task polling timed out after ${pollTimeoutMs}ms: taskId=${taskId}`)
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
}

function fixTextLikeNodeModality(config: WorkflowConfig): { changed: boolean; changes: string[] } {
  const changes: string[] = []
  let changed = false

  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const p = node as ProcessNodeConfig
    const expected = inferExpectedType(p.config?.systemPrompt, p.config?.userPrompt)
    const textLike = expected === 'text' || expected === 'json' || expected === 'markdown' || expected === 'html'
    if (!textLike) continue

    const currentModel = typeof p.config?.model === 'string' ? p.config.model : undefined
    const currentModality = typeof p.config?.modality === 'string' ? p.config.modality : undefined
    const inferredModality = currentModel ? getModelModality(currentModel) : null

    const isBadModel = inferredModality === 'image-gen' || inferredModality === 'video-gen' || inferredModality === 'audio-tts'
    const isBadModality = currentModality === 'image-gen' || currentModality === 'video-gen' || currentModality === 'audio-tts'

    if (!isBadModel && !isBadModality) continue

    p.config.modality = 'text'
    if (isBadModel) p.config.model = SHENSUAN_DEFAULT_MODELS.text

    changed = true
    changes.push(
      `节点 "${node.name}": 提示词推断为文本输出，但配置为 ${currentModality || '(未设置)'} / ${currentModel || '(未设置)'}，已修正为 text + ${p.config.model}`
    )
  }

  return { changed, changes }
}

function buildViolations(config: WorkflowConfig, logs: Array<{ nodeId: string; output: unknown }>): PromptViolation[] {
  const byId = new Map<string, unknown>()
  for (const l of logs) byId.set(l.nodeId, l.output)

  const violations: PromptViolation[] = []
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    // 仅校验本次执行实际跑到的节点，避免“未执行节点”被误判为输出缺失
    if (!byId.has(node.id)) continue
    violations.push(...validateNodeOutputAgainstPrompt(node as ProcessNodeConfig, byId.get(node.id)))
  }
  return violations
}

function prependIfMissing(text: string, prefix: string): string {
  const trimmed = text.trimStart()
  if (trimmed.startsWith(prefix.trim())) return text
  return `${prefix}\n\n${text}`.trim()
}

function fixJsonOutputStrictness(
  config: WorkflowConfig,
  violations: PromptViolation[]
): { changed: boolean; changes: string[] } {
  const changes: string[] = []
  let changed = false

  const badKinds = new Set([
    'json_parse_error',
    'json_wrapped_in_markdown',
    'json_double_encoded',
    'json_not_object',
    'json_missing_keys',
  ])

  const byId = new Map(config.nodes.map(n => [n.id, n]))
  for (const v of violations) {
    if (!badKinds.has(v.kind)) continue
    const node = byId.get(v.nodeId)
    if (!node || node.type !== 'PROCESS') continue
    const p = node as ProcessNodeConfig

    const inferred = inferExpectedType(p.config?.systemPrompt, p.config?.userPrompt)
    if (inferred !== 'json') continue

    if (!p.config) p.config = {}
    if (p.config.expectedOutputType !== 'json') {
      p.config.expectedOutputType = 'json'
      changed = true
      changes.push(`节点 "${node.name}": 设置 expectedOutputType=json 以启用 JSON 规范化输出`)
    }

    const strict = [
      '重要：你必须只输出一个 JSON 对象（以 { 开头，以 } 结尾）。',
      '不要输出 Markdown 代码块，不要使用 ```，不要输出任何解释文字、前后缀、标题。',
      '如果字段值未知，请输出空字符串或 null（按字段语义选择），但字段必须齐全。',
    ].join('\n')

    const beforeSystem = typeof p.config.systemPrompt === 'string' ? p.config.systemPrompt : ''
    const beforeUser = typeof p.config.userPrompt === 'string' ? p.config.userPrompt : ''
    const nextSystem = prependIfMissing(beforeSystem, strict)
    const nextUser = prependIfMissing(beforeUser, '请严格按上述 JSON 输出要求返回。')

    if (nextSystem !== beforeSystem) {
      p.config.systemPrompt = nextSystem
      changed = true
      changes.push(`节点 "${node.name}": 强化提示词以要求严格 JSON 输出`)
    }
    if (nextUser !== beforeUser) {
      p.config.userPrompt = nextUser
      changed = true
    }
  }

  return { changed, changes }
}

function fixFinalHtmlOutputNode(
  config: WorkflowConfig
): { changed: boolean; changes: string[] } {
  const changes: string[] = []
  let changed = false

  const node = config.nodes.find(n => n.type === 'PROCESS' && n.name === '文章排版优化')
  if (!node || node.type !== 'PROCESS') return { changed: false, changes }

  const p = node as ProcessNodeConfig
  if (!p.config) p.config = {}

  const beforeExpected = p.config.expectedOutputType
  if (beforeExpected !== 'html') {
    p.config.expectedOutputType = 'html'
    changed = true
    changes.push(`节点 "${node.name}": 设置 expectedOutputType=html（最终输出必须为 HTML）`)
  }

  const newSystem = [
    '你是一个专业的微信公众号排版设计师，擅长将文字和图片进行美观且易读的排版。',
    '',
    '输出要求（严格遵守）：',
    '- 只输出完整的 HTML（以 < 开头），不要输出 Markdown，不要输出 JSON，不要包含 ``` 代码块。',
    '- 适配移动端（375px 宽）阅读，段落留白充足，标题层级清晰。',
    '- 配图位置使用 <figure> + <img> + <figcaption>，并用占位 src（例如 https://example.com/image1.png）。',
    '',
    '排版建议：',
    '- 标题 <h1>/<h2>/<h3> 分级；关键观点 <strong>；金句 <blockquote>；要点 <ul>/<ol>。',
    '- 每段 3-5 行，段落间留白，必要时使用 <hr> 分隔。',
  ].join('\n')

  const newUser = [
    '请对以下内容进行专业的微信公众号排版优化，并直接输出最终 HTML：',
    '',
    '【文章内容】',
    '{{文章二次创作}}',
    '',
    '【配图信息】',
    '{{配图需求提取与生成}}',
    '',
    '【排版要求】',
    '1) 标题层级清晰；2) 段落优化；3) 按配图信息自然插入配图；4) 重点加粗/引用；5) 列表化；6) 首尾优化；7) 留白与呼吸感。',
  ].join('\n')

  const beforeSystem = typeof p.config.systemPrompt === 'string' ? p.config.systemPrompt : ''
  const beforeUser = typeof p.config.userPrompt === 'string' ? p.config.userPrompt : ''
  if (beforeSystem !== newSystem) {
    p.config.systemPrompt = newSystem
    changed = true
    changes.push(`节点 "${node.name}": 修正提示词为“只输出 HTML”（移除 Markdown/JSON 冲突）`)
  }
  if (beforeUser !== newUser) {
    p.config.userPrompt = newUser
    changed = true
  }

  // Ensure text modality and a sensible maxTokens.
  if (p.config.modality && p.config.modality !== 'text') {
    p.config.modality = 'text'
    changed = true
    changes.push(`节点 "${node.name}": 修正 modality=text`)
  }
  if (typeof p.config.maxTokens === 'number' && p.config.maxTokens > 16384) {
    p.config.maxTokens = 8192
    changed = true
    changes.push(`节点 "${node.name}": 将 maxTokens 降至 8192（避免超大 maxTokens 导致不稳定）`)
  }

  return { changed, changes }
}

async function saveReport(
  workflowId: string,
  executionId: string,
  payload: unknown
): Promise<string> {
  const reportDir = join(process.cwd(), 'tmp', 'workflow-traces-api', workflowId)
  await mkdir(reportDir, { recursive: true })
  const reportPath = join(reportDir, `${executionId}.json`)
  await writeFile(reportPath, JSON.stringify(payload, null, 2))
  return reportPath
}

async function main() {
  const token = process.env.WORKFLOW_API_TOKEN || process.env.API_TOKEN || ''
  if (!token) throw new Error('Missing env: WORKFLOW_API_TOKEN')

  const { baseUrl, workflowId, mode, maxIterations, apply, inputPath, headersTimeoutMs, bodyTimeoutMs, asyncExecution, pollIntervalMs, pollTimeoutMs } = parseArgs(process.argv.slice(2))
  const dispatcher = new Agent({ headersTimeout: headersTimeoutMs, bodyTimeout: bodyTimeoutMs })
  const input = await readJsonFileIfProvided(inputPath)

  console.log('='.repeat(80))
  console.log('[trace-and-fix-workflow-v1-api]')
  console.log(`baseUrl=${baseUrl} workflowId=${workflowId} mode=${mode} maxIterations=${maxIterations} apply=${apply}`)
  console.log(`timeouts: headers=${headersTimeoutMs}ms body=${bodyTimeoutMs}ms`)
  console.log(`execute: ${asyncExecution ? 'async(queue)' : 'sync'} pollInterval=${pollIntervalMs}ms pollTimeout=${pollTimeoutMs}ms`)
  console.log(`token=${token.slice(0, 8)}...`)
  console.log('='.repeat(80))

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log('')
    console.log('-'.repeat(80))
    console.log(`迭代 ${iteration}/${maxIterations}: 获取工作流配置...`)

    const wf = await getWorkflow(dispatcher, baseUrl, token, workflowId)
    const raw = mode === 'production' ? (wf.publishedConfig || wf.config) : (wf.draftConfig || wf.config)
    const workflowConfig = raw as unknown as WorkflowConfig

    console.log(`工作流: ${wf.name} version=${wf.version} publishStatus=${wf.publishStatus}`)
    console.log('执行工作流...')

    const exec = await executeWorkflowV1(dispatcher, baseUrl, token, workflowId, mode, input, asyncExecution)
    const executionId =
      'executionId' in exec
        ? exec.executionId
        : (await waitForTaskCompletion(dispatcher, baseUrl, token, exec.taskId, pollIntervalMs, pollTimeoutMs)).executionId

    if (!executionId) {
      console.log('❌ 未获取到 executionId；请确认 Token scopes 包含 "executions" 且队列服务正常。')
      return
    }

    if ('executionId' in exec) {
      console.log(`执行完成: executionId=${executionId} status=${exec.status} tokens=${exec.totalTokens ?? 0}`)
    } else {
      console.log(`队列任务完成: taskId=${exec.taskId} executionId=${executionId}`)
    }

    console.log('拉取执行详情(含节点日志)...')
    const detail = await getExecutionDetail(dispatcher, baseUrl, token, workflowId, executionId)

    const violations = buildViolations(workflowConfig, detail.logs)
    const failedLogs = detail.logs.filter(l => l.status !== 'COMPLETED' || l.error)

    const reportPath = await saveReport(workflowId, executionId, {
      workflow: {
        id: wf.id,
        name: wf.name,
        mode,
        version: wf.version,
      },
      execution: exec,
      detail,
      nodes: workflowConfig.nodes.map((n: NodeConfig) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        config: n.type === 'PROCESS' ? (n as ProcessNodeConfig).config : n.config,
      })),
      violations,
    })

    console.log(`节点失败数: ${failedLogs.length}/${detail.logs.length}`)
    console.log(`提示词契约违规数: ${violations.length}`)
    console.log(`追踪报告: ${reportPath}`)

    if (exec.status === 'success' && failedLogs.length === 0 && violations.length === 0) {
      console.log('✅ 全流程跑通且符合提示词契约')
      return
    }

    const nextConfig = cloneJson(workflowConfig)
    const authFix = await fixInvalidOpenAIKeyBySwitchingToDefaultAIConfig(
      nextConfig,
      token,
      failedLogs.map(l => ({ error: l.error }))
    )
    const fixes = [
      fixInputVariableReferences(nextConfig),
      fixExpectedOutputTypesFromPrompts(nextConfig),
      fixTextLikeNodeModality(nextConfig),
      fixFinalHtmlOutputNode(nextConfig),
      fixJsonOutputStrictness(nextConfig, violations),
      authFix,
    ].filter(r => r.changed)

    if (fixes.length === 0) {
      const envFix = await fixUndecryptableAIConfigBySwitchingToOpenAI(
        nextConfig,
        token,
        failedLogs.map(l => ({ error: l.error }))
      )
      if (!envFix.changed) {
        console.log('⚠️ 未发现可自动修复的配置项；请根据报告手动排查。')
        return
      }

      console.log('发现可自动修复项:')
      for (const msg of envFix.changes) console.log(`  - ${msg}`)

      if (!apply) {
        console.log('当前为 dry-run（未写回）；如需写回并继续重跑，请添加 --apply')
        return
      }

      console.log('写回工作流配置...')
      try {
        const updated = await updateWorkflowConfig(dispatcher, baseUrl, token, workflowId, wf.version, nextConfig)
        console.log(`✅ 写回成功，新版本: ${updated.version}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`❌ 写回失败: ${msg}`)
        console.log('提示：若是版本冲突，说明有人同时修改了该工作流；请重试或加 --max-iterations 1 并手动对齐。')
        return
      }

      continue
    }

    const fixMessages = fixes.flatMap(f => f.changes)
    console.log('发现可自动修复项:')
    for (const msg of fixMessages) console.log(`  - ${msg}`)

    if (!apply) {
      console.log('当前为 dry-run（未写回）；如需写回并继续重跑，请添加 --apply')
      return
    }

    console.log('写回工作流配置...')
    try {
      const updated = await updateWorkflowConfig(dispatcher, baseUrl, token, workflowId, wf.version, nextConfig)
      console.log(`✅ 写回成功，新版本: ${updated.version}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ 写回失败: ${msg}`)
      console.log('提示：若是版本冲突，说明有人同时修改了该工作流；请重试或加 --max-iterations 1 并手动对齐。')
      return
    }
  }

  console.log(`❌ 已达到最大迭代次数 (${maxIterations})，仍未完全跑通；请查看 tmp/workflow-traces-api 下的报告。`)
}

main()
  .catch((err) => {
    console.error('[trace-and-fix-workflow-v1-api] failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null)
  })
