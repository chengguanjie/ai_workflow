'use client'

export function extractSlotsFromPrompt(prompt: string): string[] {
  if (!prompt) return []
  const slots: string[] = []
  const seen = new Set<string>()

  const pattern = /【([^】]{1,80})】/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt)) !== null) {
    const cleaned = cleanSlotName(match[1])
    if (!cleaned) continue
    if (seen.has(cleaned)) continue
    seen.add(cleaned)
    slots.push(cleaned)
  }

  return slots
}

export function getInputBindingSlots(
  prompt: string,
  bindings?: Record<string, string>
): string[] {
  const fromPrompt = extractSlotsFromPrompt(prompt)
  const fromBindings = Object.keys(bindings || {})

  const seen = new Set<string>()
  const merged: string[] = []
  for (const slot of [...fromPrompt, ...fromBindings]) {
    const s = String(slot || '').trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    merged.push(s)
  }
  return merged
}

export function findNearestSlotBeforeCursor(
  prompt: string,
  cursorOffset: number
): string | null {
  if (!prompt) return null
  if (!Number.isFinite(cursorOffset)) return null

  const slice = prompt.slice(0, Math.max(0, Math.min(prompt.length, cursorOffset)))
  const pattern = /【([^】]{1,80})】/g
  let match: RegExpExecArray | null
  let last: string | null = null

  while ((match = pattern.exec(slice)) !== null) {
    last = cleanSlotName(match[1])
  }

  return last
}

export function upsertInputBindingForReference(args: {
  bindings: Record<string, string> | undefined
  reference: string
  preferredSlot?: string | null
}): { slot: string; nextBindings: Record<string, string> } {
  const current = args.bindings || {}
  const reference = String(args.reference || '').trim()

  const preferred = cleanSlotName(args.preferredSlot || '')
  if (preferred) {
    const slot = sanitizeSlotKey(preferred)
    const existing = current[slot]
    if (existing === reference) return { slot, nextBindings: current }
    return { slot, nextBindings: { ...current, [slot]: reference } }
  }

  // If already bound somewhere, reuse that slot.
  for (const [slot, ref] of Object.entries(current)) {
    if (ref === reference) return { slot, nextBindings: current }
  }

  const base = deriveSlotKeyFromReference(reference)
  const slot = ensureUniqueSlot(base, current)
  return { slot, nextBindings: { ...current, [slot]: reference } }
}

export function sanitizeSlotKey(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return 'input'

  // Avoid dot-path ambiguity: `inputs.a.b` means nested access; replace dots with underscores.
  const noDots = trimmed.replace(/[.．。]/g, '_')

  // Normalize whitespace and remove braces that break template readability.
  const normalized = noDots
    .replace(/\s+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()

  const cleaned = normalized
    .replace(/[\\/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const limited = cleaned.slice(0, 40).trim()
  return limited || 'input'
}

function cleanSlotName(raw: string): string | null {
  const text = String(raw || '').trim()
  if (!text) return null

  // Remove trailing notes like （...） / (...) and collapse whitespace
  const cleaned = text
    .split('（')[0]
    .split('(')[0]
    .trim()
    .replace(/\s+/g, ' ')

  if (!cleaned) return null
  if (cleaned.length > 40) return null
  return cleaned
}

function deriveSlotKeyFromReference(reference: string): string {
  const trimmed = String(reference || '').trim()
  const match = trimmed.match(/^\{\{([^}]+)\}\}$/)
  const content = (match?.[1] || '').trim()
  if (!content) return 'input'

  // `inputs.xxx` should map to `xxx`
  if (content.startsWith('inputs.')) {
    return sanitizeSlotKey(content.slice('inputs.'.length))
  }

  const parts = content.split('.').filter(Boolean)
  if (parts.length === 0) return 'input'
  if (parts.length === 1) return sanitizeSlotKey(parts[0])

  const node = parts[0]
  const last = parts[parts.length - 1]
  return sanitizeSlotKey(`${node}_${last}`)
}

function ensureUniqueSlot(base: string, bindings: Record<string, string>): string {
  const normalizedBase = sanitizeSlotKey(base)
  if (!bindings[normalizedBase]) return normalizedBase

  for (let i = 2; i < 1000; i++) {
    const suffix = `_${i}`
    const candidate = sanitizeSlotKey(`${normalizedBase}${suffix}`)
    if (!bindings[candidate]) return candidate
  }

  // Extremely unlikely fallback
  return sanitizeSlotKey(`${normalizedBase}_${Date.now()}`)
}

