export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number
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
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

