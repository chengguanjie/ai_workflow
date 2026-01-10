const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'authorization',
  'auth',
  'cookie',
  'set-cookie',
  'session',
  'key',
  'signature',
  'sig',
  'webhook',
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some((k) => lower.includes(k))
}

export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    for (const [k] of parsed.searchParams) {
      if (shouldRedactKey(k)) {
        parsed.searchParams.set(k, '[REDACTED]')
      }
    }
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (shouldRedactKey(k)) {
      out[k] = '[REDACTED]'
      continue
    }
    out[k] = v
  }
  return out
}

export function redactDeep(value: unknown, options?: { maxDepth?: number }): unknown {
  const maxDepth = options?.maxDepth ?? 10

  const walk = (v: unknown, depth: number): unknown => {
    if (depth > maxDepth) return '[TRUNCATED]'
    if (v === null || v === undefined) return v

    if (typeof v === 'string') {
      // Best-effort URL query redaction.
      if (v.startsWith('http://') || v.startsWith('https://')) return redactUrl(v)
      return v
    }

    if (Array.isArray(v)) {
      return v.map((item) => walk(item, depth + 1))
    }

    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {}
      for (const [k, child] of Object.entries(v)) {
        if (shouldRedactKey(k)) {
          out[k] = '[REDACTED]'
          continue
        }
        out[k] = walk(child, depth + 1)
      }
      return out
    }

    return v
  }

  return walk(value, 0)
}
