export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number
}

let didPreferIpv4First = false

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

async function preferIpv4FirstOnce(): Promise<void> {
  if (didPreferIpv4First) return
  // 仅在服务端运行
  if (typeof window !== 'undefined') return
  // 使用 eval 阻止 webpack 静态分析
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

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {}
): Promise<Response> {
  const { timeoutMs = 60_000, signal, ...rest } = init

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
      // 提取更详细的错误信息
      if (error instanceof Error) {
        const cause = (error as Error & { cause?: Error }).cause
        if (cause) {
          throw new Error(`${error.message}: ${cause.message}`)
        }
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  try {
    return await attemptFetch()
  } catch (error) {
    // 某些网络环境下（IPv6/解析顺序问题）会出现 TLS 握手前断开；尝试切到 ipv4first 并重试一次
    if (isTlsHandshakeEarlyDisconnect(error) && !didPreferIpv4First) {
      await preferIpv4FirstOnce()
      return await attemptFetch()
    }
    throw error
  }
}
