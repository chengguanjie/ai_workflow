const MODEL_COSTS_USD_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-coder': { input: 0.00014, output: 0.00028 },
  'qwen-turbo': { input: 0.0008, output: 0.002 },
  'qwen-plus': { input: 0.004, output: 0.012 },
  'qwen-max': { input: 0.02, output: 0.06 },
}

function normalizeModelKey(model: string): string {
  // e.g. "openai/gpt-4o" -> "gpt-4o"; "anthropic/claude-3.5-sonnet:thinking" -> "claude-3.5-sonnet"
  const slashKey = model.includes('/') ? model.split('/').pop() || model : model
  return slashKey.split(':')[0]
}

export function calculateTokenCostUSD(model: string, promptTokens: number, completionTokens: number): number {
  const key = normalizeModelKey(model)
  const costs = MODEL_COSTS_USD_PER_1K[key] || MODEL_COSTS_USD_PER_1K[model] || { input: 0.001, output: 0.002 }
  const cost = (promptTokens / 1000) * costs.input + (completionTokens / 1000) * costs.output
  return Number.isFinite(cost) ? cost : 0
}

