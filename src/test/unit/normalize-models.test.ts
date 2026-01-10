import { describe, it, expect } from 'vitest'
import { normalizeModels } from '@/lib/ai/normalize-models'

describe('normalizeModels', () => {
  it('returns string arrays as-is (filtered)', () => {
    expect(normalizeModels(['a', ' ', 'b'])).toEqual(['a', 'b'])
  })

  it('parses comma-separated strings', () => {
    expect(normalizeModels('a, b,,c')).toEqual(['a', 'b', 'c'])
  })

  it('supports {models: ...} wrapper objects', () => {
    expect(normalizeModels({ models: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(normalizeModels({ models: 'a, b' })).toEqual(['a', 'b'])
  })

  it('flattens modality maps and de-duplicates', () => {
    expect(normalizeModels({ text: ['a', 'b'], code: ['b', 'c'] })).toEqual(['a', 'b', 'c'])
  })

  it('falls back to empty array for unsupported shapes', () => {
    expect(normalizeModels(null)).toEqual([])
    expect(normalizeModels(123)).toEqual([])
    expect(normalizeModels({ text: 'a' })).toEqual([])
  })
})

