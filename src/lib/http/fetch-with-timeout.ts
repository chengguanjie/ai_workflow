export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number
  retries?: number
  retryDelay?: number
}

let didPreferIpv4First = false
const FORMATTED_NETWORK_ERROR = '__formattedNetworkError'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch {
    return 'unknown error'
  }
}

function getErrorCauseMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const maybe = error as { cause?: unknown }
  if (maybe.cause instanceof Error) return maybe.cause.message
  return null
}

function isTlsHandshakeEarlyDisconnect(error: unknown): boolean {
  const message = (getErrorMessage(error) + ' ' + (getErrorCauseMessage(error) || '')).toLowerCase()
  return message.includes('client network socket disconnected before secure tls connection was established')
}

export function isRetryableNetworkError(error: unknown): boolean {
  const message = (getErrorMessage(error) + ' ' + (getErrorCauseMessage(error) || '')).toLowerCase()
  
  const retryablePatterns = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'eai_again',
    'connect timeout',
    'connection timeout',
    'connecttimeouterror',
    'socket hang up',
    'network socket disconnected',
    'other side closed',
    'und_err_socket',
    'fetch failed',
    'network error',
    'dns lookup',
    'attempted addresses',
    'connection refused',
    'network is unreachable',
    'host is unreachable',
  ]
  
  return retryablePatterns.some(pattern => message.includes(pattern))
}

export function getNetworkErrorHint(error: unknown): string {
  const message = getErrorMessage(error)
  const cause = getErrorCauseMessage(error)
  const lower = (message + ' ' + (cause || '')).toLowerCase()
  
  let hint = ''
  
  if (lower.includes('connect timeout') || lower.includes('etimedout') || lower.includes('connecttimeouterror') || lower.includes('attempted addresses')) {
    hint = '连接超时，可能是网络不稳定或服务器节点暂时不可用，请重试'
  } else if (lower.includes('econnrefused')) {
    hint = '连接被拒绝，服务器可能未启动或端口被阻止'
  } else if (lower.includes('econnreset')) {
    hint = '连接被重置，网络不稳定或被防火墙中断'
  } else if (lower.includes('enotfound') || lower.includes('dns')) {
    hint = '域名解析失败，请检查网络或 DNS 设置'
  } else if (lower.includes('socket hang up')) {
    hint = '连接意外断开，网络不稳定'
  } else if (lower.includes('other side closed') || lower.includes('und_err_socket')) {
    hint = '连接被对端关闭，可能是服务端节点不稳定、长连接被回收或代理中断'
  } else if (lower.includes('tls') || lower.includes('ssl') || lower.includes('certificate')) {
    hint = 'TLS/SSL 握手失败，可能是证书问题或代理干扰'
  }
  
  return hint
}

export type FormattedNetworkError = Error & { __formattedNetworkError: true }

export function isFormattedNetworkError(error: unknown): error is FormattedNetworkError {
  return error instanceof Error && Boolean((error as unknown as Record<string, unknown>)[FORMATTED_NETWORK_ERROR])
}

export function formatNetworkError(error: unknown, context?: string): Error {
  if (isFormattedNetworkError(error)) return error

  const message = getErrorMessage(error)
  const cause = getErrorCauseMessage(error)
  const hint = getNetworkErrorHint(error)
  
  let fullMessage = context ? `${context}: ` : ''
  fullMessage += cause ? `${message}: ${cause}` : message
  
  if (hint) {
    fullMessage += `\n\n可能原因: ${hint}\n\n建议操作:\n- 检查网络连接是否正常\n- 如使用代理/VPN，请确认配置正确\n- 稍后重试`
  }
  
  const formatted = new Error(fullMessage)
  ;(formatted as unknown as Record<string, unknown>)[FORMATTED_NETWORK_ERROR] = true
  if (error instanceof Error) {
    formatted.stack = error.stack
  }
  return formatted
}

async function preferIpv4FirstOnce(): Promise<void> {
  if (didPreferIpv4First) return
  if (typeof window !== 'undefined') return
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const dns = await (new Function('return import("node:dns")'))() as typeof import('node:dns')
    dns.setDefaultResultOrder?.('ipv4first')
    didPreferIpv4First = true
  } catch {
    // 忽略：非 Node 环境或不支持
  }
}

function mergeAbortSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter(Boolean) as AbortSignal[]
  if (activeSignals.length === 0) return undefined
  if (activeSignals.length === 1) return activeSignals[0]

  const controller = new AbortController()

  const abort = (signal: AbortSignal) => {
    try {
      controller.abort(signal.reason)
    } catch {
      controller.abort()
    }
  }

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal)
      break
    }
    signal.addEventListener('abort', () => abort(signal), { once: true })
  }

  return controller.signal
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {}
): Promise<Response> {
  const { 
    timeoutMs = 60_000, 
    retries = 2,
    retryDelay = 1500,
    signal, 
    ...rest 
  } = init

  const attemptFetch = async (): Promise<Response> => {
    if (!timeoutMs || timeoutMs <= 0) {
      return fetch(input, { ...rest, signal })
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
    const mergedSignal = mergeAbortSignals([signal, timeoutController.signal])

    try {
      return await fetch(input, { ...rest, signal: mergedSignal })
    } catch (error) {
      if (timeoutController.signal.aborted && !signal?.aborted) {
        throw new Error(`请求超时（${timeoutMs}ms）`)
      }
      if (error instanceof Error) {
        const cause = (error as Error & { cause?: Error }).cause
        if (cause) {
          throw new Error(`${error.message}: ${cause.message}`, { cause })
        }
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const executeWithRetry = async (attempt: number): Promise<Response> => {
    try {
      return await attemptFetch()
    } catch (error) {
      if (isTlsHandshakeEarlyDisconnect(error) && !didPreferIpv4First) {
        await preferIpv4FirstOnce()
        return await attemptFetch()
      }

      if (signal?.aborted) {
        throw error
      }

      const isRetryable = isRetryableNetworkError(error)
      const hasRetriesLeft = attempt < retries

      if (isRetryable && hasRetriesLeft) {
        const baseDelay = retryDelay * Math.pow(1.5, attempt)
        const jitter = 0.8 + Math.random() * 0.4
        const delay = Math.round(baseDelay * jitter)
        console.log(`[fetchWithTimeout] 网络错误，${delay}ms 后重试 (${attempt + 1}/${retries}):`, getErrorMessage(error))
        await sleep(delay)
        return executeWithRetry(attempt + 1)
      }

      throw error
    }
  }

  return executeWithRetry(0)
}

export async function fetchTextWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {}
): Promise<{ response: Response; text: string }> {
  const {
    timeoutMs = 60_000,
    retries = 2,
    retryDelay = 1500,
    signal,
    ...rest
  } = init

  const attemptFetch = async (): Promise<{ response: Response; text: string }> => {
    if (!timeoutMs || timeoutMs <= 0) {
      const response = await fetch(input, { ...rest, signal })
      const text = await response.text()
      return { response, text }
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
    const mergedSignal = mergeAbortSignals([signal, timeoutController.signal])

    try {
      const response = await fetch(input, { ...rest, signal: mergedSignal })
      const text = await response.text()
      return { response, text }
    } catch (error) {
      if (timeoutController.signal.aborted && !signal?.aborted) {
        throw new Error(`请求超时（${timeoutMs}ms）`)
      }
      if (error instanceof Error) {
        const cause = (error as Error & { cause?: Error }).cause
        if (cause) {
          throw new Error(`${error.message}: ${cause.message}`, { cause })
        }
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const executeWithRetry = async (
    attempt: number
  ): Promise<{ response: Response; text: string }> => {
    try {
      return await attemptFetch()
    } catch (error) {
      if (isTlsHandshakeEarlyDisconnect(error) && !didPreferIpv4First) {
        await preferIpv4FirstOnce()
        return await attemptFetch()
      }

      if (signal?.aborted) {
        throw error
      }

      const isRetryable = isRetryableNetworkError(error)
      const hasRetriesLeft = attempt < retries

      if (isRetryable && hasRetriesLeft) {
        const baseDelay = retryDelay * Math.pow(1.5, attempt)
        const jitter = 0.8 + Math.random() * 0.4
        const delay = Math.round(baseDelay * jitter)
        console.log(
          `[fetchTextWithTimeout] 网络错误，${delay}ms 后重试 (${attempt + 1}/${retries}):`,
          getErrorMessage(error)
        )
        await sleep(delay)
        return executeWithRetry(attempt + 1)
      }

      throw error
    }
  }

  return executeWithRetry(0)
}
