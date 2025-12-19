import { NextRequest } from 'next/server'

export interface MockRequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  url?: string
}

export function createMockRequest(options: MockRequestOptions = {}): NextRequest {
  const baseUrl = options.url || 'http://localhost:3000/api/test'
  const url = new URL(baseUrl)
  
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  const init: RequestInit = {
    method: options.method || 'GET',
    headers: new Headers(options.headers),
  }

  if (options.body && options.method !== 'GET') {
    init.body = JSON.stringify(options.body)
    if (!options.headers?.['content-type']) {
      (init.headers as Headers).set('content-type', 'application/json')
    }
  }

  return new NextRequest(url, init as RequestInit & { signal?: AbortSignal })
}

export function createMockGetRequest(
  searchParams?: Record<string, string>,
  headers?: Record<string, string>
): NextRequest {
  return createMockRequest({
    method: 'GET',
    searchParams,
    headers,
  })
}

export function createMockPostRequest(
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  return createMockRequest({
    method: 'POST',
    body,
    headers,
  })
}

export function createMockPutRequest(
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  return createMockRequest({
    method: 'PUT',
    body,
    headers,
  })
}

export function createMockDeleteRequest(
  headers?: Record<string, string>
): NextRequest {
  return createMockRequest({
    method: 'DELETE',
    headers,
  })
}
