/**
 * 通过 V1 Public API 获取工作流列表（需要 API Token scopes 包含 "workflows"）
 *
 * 运行：
 *   WORKFLOW_API_TOKEN=wf_xxx pnpm -s workflow:list:api
 *
 * 可选参数：
 *   --base-url  http://127.0.0.1:3100
 *   --page      1
 *   --pageSize  20
 *   --search    关键词
 *   --category  分类
 */

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

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

  const baseUrl = ((args.get('--base-url') as string | undefined) || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3100')
    .replace(/\/$/, '')
  const page = (args.get('--page') as string | undefined) || '1'
  const pageSize = (args.get('--pageSize') as string | undefined) || '20'
  const search = (args.get('--search') as string | undefined) || ''
  const category = (args.get('--category') as string | undefined) || ''

  return { baseUrl, page, pageSize, search, category }
}

async function main() {
  const token = process.env.WORKFLOW_API_TOKEN || process.env.API_TOKEN || ''
  if (!token) throw new Error('Missing env: WORKFLOW_API_TOKEN (or API_TOKEN)')

  const { baseUrl, page, pageSize, search, category } = parseArgs(process.argv.slice(2))

  const qs = new URLSearchParams()
  if (page) qs.set('page', page)
  if (pageSize) qs.set('pageSize', pageSize)
  if (search) qs.set('search', search)
  if (category) qs.set('category', category)

  const res = await fetch(`${baseUrl}/api/v1/workflows?${qs.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const message =
      (isObject(data) && isObject(data['error']) && typeof data['error']['message'] === 'string' && data['error']['message']) ||
      (isObject(data) && typeof data['message'] === 'string' && data['message']) ||
      `HTTP ${res.status}`
    throw new Error(`/api/v1/workflows: ${message}`)
  }

  if (!isObject(data) || data['success'] !== true || !Array.isArray(data['data'])) {
    console.log(data)
    throw new Error('Unexpected response shape (expected { success: true, data: [] })')
  }

  const workflows = data['data'] as Array<{ id?: string; name?: string; description?: string; publishStatus?: string }>
  const pagination = isObject(data['pagination']) ? data['pagination'] : undefined

  console.log(`workflows: ${workflows.length}`)
  if (pagination) console.log('pagination:', pagination)
  for (const wf of workflows) {
    console.log(`- ${wf.name ?? '(no name)'} (${wf.id ?? 'no id'})${wf.publishStatus ? ` [${wf.publishStatus}]` : ''}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})

