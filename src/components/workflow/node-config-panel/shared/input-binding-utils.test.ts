import { describe, expect, it } from 'vitest'
import {
  findNearestSlotBeforeCursor,
  upsertInputBindingForReference,
  getInputBindingSlots,
} from './input-binding-utils'

describe('input-binding-utils', () => {
  it('findNearestSlotBeforeCursor returns nearest cleaned slot', () => {
    const prompt = '【文章内容（可选）】\nhello\n【输出】\nworld\n'
    const cursorAtWorld = prompt.indexOf('world') + 1
    expect(findNearestSlotBeforeCursor(prompt, cursorAtWorld)).toBe('输出')
  })

  it('upsertInputBindingForReference prefers preferredSlot and overrides', () => {
    const bindings = { 输出: '{{Upstream.结果}}' }
    const { slot, nextBindings } = upsertInputBindingForReference({
      bindings,
      reference: '{{Upstream.text}}',
      preferredSlot: '输出',
    })
    expect(slot).toBe('输出')
    expect(nextBindings).toEqual({ 输出: '{{Upstream.text}}' })
  })

  it('upsertInputBindingForReference reuses existing slot for same reference', () => {
    const bindings = { a: '{{N.结果}}' }
    const { slot, nextBindings } = upsertInputBindingForReference({
      bindings,
      reference: '{{N.结果}}',
      preferredSlot: null,
    })
    expect(slot).toBe('a')
    expect(nextBindings).toBe(bindings)
  })

  it('getInputBindingSlots merges prompt slots and bindings keys', () => {
    const prompt = '【A】\n{{inputs.A}}\n'
    const bindings = { B: '{{N.结果}}' }
    expect(getInputBindingSlots(prompt, bindings)).toEqual(['A', 'B'])
  })
})

