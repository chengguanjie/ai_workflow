export function normalizeModels(models: unknown): string[] {
  if (Array.isArray(models)) {
    return models.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
  }

  if (typeof models === 'string') {
    return models
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0)
  }

  if (!models || typeof models !== 'object') return []

  const maybeModels = (models as { models?: unknown }).models
  if (maybeModels !== undefined) return normalizeModels(maybeModels)

  const values = Object.values(models as Record<string, unknown>)
  const flattened = values.flatMap((v) => (Array.isArray(v) ? v : []))
  const normalized = normalizeModels(flattened)
  return Array.from(new Set(normalized))
}

