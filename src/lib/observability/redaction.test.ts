import { describe, expect, it } from 'vitest'
import { redactDeep, redactHeaders, redactUrl } from '@/lib/observability/redaction'

describe('observability/redaction', () => {
  it('redacts sensitive keys recursively', () => {
    const input = {
      apiKey: 'sk-live-123',
      nested: {
        Authorization: 'Bearer secret-token',
        safe: 'ok',
        items: [{ refreshToken: 'rt-123', value: 1 }],
      },
    }

    expect(redactDeep(input)).toEqual({
      apiKey: '[REDACTED]',
      nested: {
        Authorization: '[REDACTED]',
        safe: 'ok',
        items: [{ refreshToken: '[REDACTED]', value: 1 }],
      },
    })
  })

  it('redacts sensitive query params in URLs', () => {
    expect(redactUrl('https://example.com/cb?code=1&token=abc&x=2')).toBe(
      'https://example.com/cb?code=1&token=%5BREDACTED%5D&x=2',
    )
  })

  it('redacts common sensitive headers', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer abc',
        cookie: 'sid=123',
        'x-webhook-signature': 't=1,v1=abc',
        'content-type': 'application/json',
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'x-webhook-signature': '[REDACTED]',
      'content-type': 'application/json',
    })
  })
})

