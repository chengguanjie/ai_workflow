export type ApiErrorShape = {
  success: false
  error: {
    message: string
    details?: unknown
  }
}

export type ApiSuccessShape<T> = {
  success: true
  data: T
}

export type ApiResponseShape<T> = ApiSuccessShape<T> | ApiErrorShape

export function unwrapApiResponse<T>(json: ApiResponseShape<T>): T {
  if (json.success) return json.data
  throw new Error(json.error?.message || '请求失败')
}

async function safeParseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function fetchApi<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const json = (await safeParseJson(res)) as ApiResponseShape<T> | unknown

  if (json && typeof json === 'object' && 'success' in json) {
    return unwrapApiResponse(json as ApiResponseShape<T>)
  }

  if (!res.ok) {
    throw new Error(`请求失败 (${res.status})`)
  }

  return json as T
}

