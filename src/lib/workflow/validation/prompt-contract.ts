import type { ProcessNodeConfig, WorkflowConfig } from '@/types/workflow'

export type PromptExpectedType = 'json' | 'markdown' | 'html' | 'text'

export interface PromptContract {
  expectedType: PromptExpectedType
  expectedJsonKeys: string[]
}

export interface PromptViolation {
  nodeId: string
  nodeName: string
  kind:
    | 'missing_output'
    | 'output_not_string'
    | 'json_parse_error'
    | 'json_not_object'
    | 'json_double_encoded'
    | 'json_wrapped_in_markdown'
    | 'json_missing_keys'
    | 'html_not_detected'
    | 'html_missing_required_images'
  message: string
  details?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items))
}

function extractFirstJsonObjectLike(text: string): string | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') depth++
    if (ch === '}') depth--

    if (depth === 0) {
      return trimmed.slice(start, i + 1)
    }
  }

  return null
}

export function inferExpectedType(systemPrompt?: string, userPrompt?: string): PromptExpectedType {
  const combined = `${systemPrompt || ''}\n${userPrompt || ''}`.toLowerCase()

  // If the prompt contains a JSON object template (e.g. { "a": 1, "b": 2 }), treat it as JSON.
  // This catches prompts that show a schema without explicitly saying “JSON格式”.
  const templateKeys = extractExpectedJsonKeys(systemPrompt, userPrompt)
  if (templateKeys.length > 0) return 'json'

  const negatesJson =
    /(不要|不用|禁止|勿|不需要|不得)\s*(输出|返回|提供|给出)?\s*json/.test(combined) ||
    /(不要|不用|禁止|勿|不需要|不得)\s*json\s*(格式|format|对象)?/.test(combined)

  const wantsHtmlOnly =
    /(只|仅|务必只|必须只)\s*(输出|返回)\s*.*html/.test(combined) ||
    /(只|仅|务必只|必须只)\s*.*html\s*(输出|返回)/.test(combined)

  if (wantsHtmlOnly) return 'html'

  const wantsJsonOutput =
    !negatesJson &&
    (/(输出|返回|提供|给出)\s*(纯)?\s*json/.test(combined) ||
      /json\s*(格式|format|对象)/.test(combined) ||
      combined.includes('json format') ||
      combined.includes('json格式'))

  if (
    wantsJsonOutput
  ) {
    return 'json'
  }
  if (combined.includes('markdown') || combined.includes('md格式') || combined.includes('md 格式')) return 'markdown'
  if (combined.includes('html') || combined.includes('网页')) return 'html'
  return 'text'
}

export function extractExpectedJsonKeys(systemPrompt?: string, userPrompt?: string): string[] {
  const text = `${systemPrompt || ''}\n${userPrompt || ''}`
  const candidate = extractFirstJsonObjectLike(text)
  if (!candidate) return []

  const keys: string[] = []
  const keyRegex = /"([^"\\]+)"\s*:/g
  for (const match of candidate.matchAll(keyRegex)) {
    if (match[1]) keys.push(match[1])
  }
  return uniq(keys)
}

export function getPromptContract(node: ProcessNodeConfig): PromptContract {
  const systemPrompt = node.config?.systemPrompt
  const userPrompt = node.config?.userPrompt
  return {
    expectedType: inferExpectedType(systemPrompt, userPrompt),
    expectedJsonKeys: extractExpectedJsonKeys(systemPrompt, userPrompt),
  }
}

export function validateNodeOutputAgainstPrompt(
  node: ProcessNodeConfig,
  nodeOutput: unknown
): PromptViolation[] {
  const violations: PromptViolation[] = []
  const contract = getPromptContract(node)

  if (!isRecord(nodeOutput)) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      kind: 'missing_output',
      message: '节点输出为空或不是对象',
    })
    return violations
  }

  const raw = nodeOutput['result'] ?? nodeOutput['结果']
  if (raw == null) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      kind: 'missing_output',
      message: '节点输出缺少 result/结果 字段',
    })
    return violations
  }

  if (typeof raw !== 'string') {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      kind: 'output_not_string',
      message: '节点输出 result/结果 不是字符串',
      details: { typeof: typeof raw },
    })
    return violations
  }

  const content = raw.trim()

  if (contract.expectedType === 'json') {
    const fenced = /```\s*json[\s\S]*?```/i.test(content)
    const stripped = fenced
      ? content
          .replace(/^```\s*json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()
      : content

    let parsed: unknown
    try {
      parsed = JSON.parse(stripped)
    } catch (err) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'json_parse_error',
        message: '期望 JSON，但输出无法解析为 JSON',
        details: { error: err instanceof Error ? err.message : String(err) },
      })
      return violations
    }

    if (fenced) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'json_wrapped_in_markdown',
        message: '期望纯 JSON，但输出被 Markdown 代码块包裹',
      })
    }

    // Detect “double-encoded JSON” where the model returns a JSON string that itself contains JSON.
    if (typeof parsed === 'string') {
      try {
        const second = JSON.parse(parsed)
        parsed = second
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          kind: 'json_double_encoded',
          message: '期望 JSON 对象，但输出为 JSON 字符串（双重编码）',
        })
      } catch {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          kind: 'json_not_object',
          message: '期望 JSON 对象，但输出为字符串',
        })
        return violations
      }
    }

    if (!isRecord(parsed)) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'json_not_object',
        message: '期望 JSON 对象，但解析结果不是对象',
        details: { typeof: typeof parsed },
      })
      return violations
    }

    if (contract.expectedJsonKeys.length > 0) {
      const missing = contract.expectedJsonKeys.filter((k) => !(k in parsed))
      if (missing.length > 0) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          kind: 'json_missing_keys',
          message: 'JSON 输出缺少提示词示例中的字段',
          details: { missingKeys: missing },
        })
      }
    }
  }

  if (contract.expectedType === 'html') {
    const looksLikeHtml = content.startsWith('<') && content.includes('>')
    if (!looksLikeHtml) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: 'html_not_detected',
        message: '期望 HTML，但输出不像 HTML',
      })
    }
  }

  return violations
}

export function validateWorkflowOutputsAgainstPrompts(
  workflow: WorkflowConfig,
  nodeOutputsById: Map<string, unknown>
): PromptViolation[] {
  const violations: PromptViolation[] = []
  for (const node of workflow.nodes) {
    if (node.type !== 'PROCESS') continue
    const output = nodeOutputsById.get(node.id)
    violations.push(...validateNodeOutputAgainstPrompt(node as ProcessNodeConfig, output))
  }
  return violations
}

export function fixInputVariableReferences(config: WorkflowConfig): { changed: boolean; changes: string[] } {
  const inputNode = config.nodes.find((n) => n.type === 'INPUT')
  if (!inputNode) return { changed: false, changes: [] }

  const changes: string[] = []
  let changed = false

  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const processNode = node as ProcessNodeConfig
    const current = processNode.config?.userPrompt
    if (!current || typeof current !== 'string') continue

    if (!current.includes('{{输入.')) continue

    const next = current.replaceAll('{{输入.', `{{${inputNode.name}.`)
    if (next !== current) {
      processNode.config.userPrompt = next
      changed = true
      changes.push(`节点 "${node.name}": 修复变量引用 {{输入.*}} -> {{${inputNode.name}.*}}`)
    }
  }

  return { changed, changes }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fixPromptInputReferences(prompt: string, inputNodeName: string, inputFieldNames: Set<string>) {
  const changes: string[] = []
  let next = prompt

  // Case 1: Corrupted paste that results in `{{输入节点.字段A}}输入.字段B}}` (missing `{{` before 输入.字段B}})
  // Prefer the second field (字段B), because it is usually the intended one.
  const inputNamePattern = escapeRegExp(inputNodeName)
  const corruptedTwoField = new RegExp(`\\{\\{${inputNamePattern}\\.([^}]+)\\}\\}输入\\.([^}]+)\\}\\}`, 'g')
  next = next.replace(corruptedTwoField, (_m, _fieldA: string, fieldB: string) => {
    changes.push(`修复损坏的变量引用 "{{${inputNodeName}.*}}输入.*}}" -> "{{${inputNodeName}.${fieldB}}}"`)
    return `{{${inputNodeName}.${fieldB}}}`
  })

  // Case 2: leftover `}}输入.字段}}` suffix without the opening `{{...`
  const corruptedSuffix = new RegExp(`\\}\\}输入\\.([^}]+)\\}\\}`, 'g')
  next = next.replace(corruptedSuffix, (_m, field: string) => {
    changes.push(`修复损坏的变量引用 "}}输入.*}}" -> "{{${inputNodeName}.${field}}}"`)
    return `{{${inputNodeName}.${field}}}`
  })

  // Case 3: `标签：{{输入节点.字段}}` but 字段不存在；若标签本身是输入字段名，则用标签修复字段引用。
  const labelToField = new RegExp(
    `(^|\\n)([ \\t\\-*\\d\\.]*)([^\\n：:]{1,50})[：:](\\s*)\\{\\{${inputNamePattern}\\.([^}]+)\\}\\}`,
    'g'
  )
  next = next.replace(labelToField, (m, lineStart: string, prefix: string, label: string, spacing: string, field: string) => {
    if (inputFieldNames.has(field) || !inputFieldNames.has(label)) return m
    changes.push(`修复变量引用 "{{${inputNodeName}.${field}}}" -> "{{${inputNodeName}.${label}}}"（按标签 "${label}" 纠正字段名）`)
    return `${lineStart}${prefix}${label}：${spacing}{{${inputNodeName}.${label}}}`
  })

  return { next, changes }
}

export function fixCorruptedInputFieldReferences(config: WorkflowConfig): { changed: boolean; changes: string[] } {
  const inputNode = config.nodes.find((n) => n.type === 'INPUT')
  if (!inputNode) return { changed: false, changes: [] }

  const fields = (inputNode as any).config?.fields
  const inputFieldNames = new Set(
    Array.isArray(fields)
      ? fields.map((f: any) => (typeof f?.name === 'string' ? f.name : '')).filter(Boolean)
      : []
  )
  if (inputFieldNames.size === 0) return { changed: false, changes: [] }

  const changes: string[] = []
  let changed = false

  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const processNode = node as ProcessNodeConfig
    if (!processNode.config) continue

    const promptKeys: Array<'userPrompt' | 'systemPrompt'> = ['userPrompt', 'systemPrompt']
    for (const key of promptKeys) {
      const current = processNode.config[key]
      if (!current || typeof current !== 'string' || !current.includes('{{')) continue

      const res = fixPromptInputReferences(current, inputNode.name, inputFieldNames)
      if (res.next !== current) {
        processNode.config[key] = res.next
        changed = true
        for (const msg of res.changes) changes.push(`节点 "${node.name}": ${key} - ${msg}`)
      }
    }
  }

  return { changed, changes }
}

export function fixExpectedOutputTypesFromPrompts(config: WorkflowConfig): { changed: boolean; changes: string[] } {
  const changes: string[] = []
  let changed = false

  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const processNode = node as ProcessNodeConfig
    const inferred = inferExpectedType(processNode.config?.systemPrompt, processNode.config?.userPrompt)
    if (inferred === 'json' && processNode.config?.expectedOutputType !== 'json') {
      processNode.config.expectedOutputType = 'json'
      changed = true
      changes.push(`节点 "${node.name}": 根据提示词推断输出为 JSON，已设置 expectedOutputType=json`)
    }
    if (inferred === 'html' && processNode.config?.expectedOutputType !== 'html') {
      processNode.config.expectedOutputType = 'html'
      changed = true
      changes.push(`节点 "${node.name}": 根据提示词推断输出为 HTML，已设置 expectedOutputType=html`)
    }
    if (inferred === 'markdown' && processNode.config?.expectedOutputType !== 'markdown') {
      processNode.config.expectedOutputType = 'markdown'
      changed = true
      changes.push(`节点 "${node.name}": 根据提示词推断输出为 Markdown，已设置 expectedOutputType=markdown`)
    }
  }

  return { changed, changes }
}
