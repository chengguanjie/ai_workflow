import { describe, it, expect, vi } from 'vitest'
import { fetchApi, unwrapApiResponse } from './client'

describe('lib/api/client', () => {
  it('unwrapApiResponse returns data on success', () => {
    const data = unwrapApiResponse({ success: true, data: { ok: true } })
    expect(data).toEqual({ ok: true })
  })

  it('unwrapApiResponse throws message on error', () => {
    expect(() =>
      unwrapApiResponse({
        success: false,
        error: { message: 'boom' },
      })
    ).toThrow('boom')
  })

  it('fetchApi unwraps ApiResponse.success', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true, data: { value: 123 } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchApi<{ value: number }>('/api/test')).resolves.toEqual({ value: 123 })
    expect(fetchMock).toHaveBeenCalled()
  })

  it('fetchApi throws ApiResponse.error message', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ success: false, error: { message: 'nope' } }),
        { status: 403 }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchApi('/api/test')).rejects.toThrow('nope')
  })
})

