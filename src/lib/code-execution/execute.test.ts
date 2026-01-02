import { describe, expect, it } from 'vitest'
import { executeSandboxedCode } from './execute'

describe('executeSandboxedCode', () => {
  it('should run javascript and return value', async () => {
    const res = await executeSandboxedCode({
      enabled: true,
      language: 'javascript',
      code: 'return input.x + 1',
      input: { x: 1 },
      timeoutMs: 1000,
    })
    expect(res.ok).toBe(true)
    expect(res.result).toBe(2)
  })

  it('should block disabled execution', async () => {
    const res = await executeSandboxedCode({
      enabled: false,
      language: 'javascript',
      code: 'return 1',
      input: {},
    })
    expect(res.ok).toBe(false)
  })
})

