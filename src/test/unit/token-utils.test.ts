import { describe, it, expect } from 'vitest'
import { getModelContextLimit, MODEL_CONTEXT_LIMITS } from '@/lib/ai/token-utils'

describe('token-utils', () => {
  it('resolves Claude Sonnet 4.5 context limit for namespaced ids', () => {
    expect(getModelContextLimit('anthropic/claude-sonnet-4.5')).toBe(200000)
    expect(getModelContextLimit('anthropic/claude-sonnet-4.5:thinking')).toBe(200000)
  })

  it('resolves Claude context limit for normalized ids', () => {
    expect(getModelContextLimit('claude-sonnet-4.5')).toBe(200000)
    expect(getModelContextLimit('claude-3-5-sonnet-20241022')).toBe(200000)
  })

  it('keeps legacy Claude-2 limits', () => {
    expect(getModelContextLimit('claude-2.1')).toBe(200000)
    expect(getModelContextLimit('claude-2')).toBe(100000)
  })

  it('falls back to default for unknown models', () => {
    expect(getModelContextLimit('some-unknown-model')).toBe(MODEL_CONTEXT_LIMITS.default)
  })
})

