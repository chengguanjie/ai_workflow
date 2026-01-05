'use client'

import { useEffect } from 'react'

/**
 * Suppress benign errors:
 * - Chromium "ResizeObserver loop limit exceeded"
 * - FetchError from browser extensions or benign fetch failures
 */
export function ResizeObserverErrorSuppressor() {
  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      const message = event?.message || ''
      if (
        message.includes('ResizeObserver loop limit exceeded') ||
        message.includes('ResizeObserver loop completed with undelivered notifications')
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      if (reason && typeof reason === 'object' && reason.name === 'FetchError') {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Suppressed FetchError]', reason)
        }
        event.preventDefault()
        return
      }
    }

    window.addEventListener('error', errorHandler)
    window.addEventListener('unhandledrejection', rejectionHandler)
    return () => {
      window.removeEventListener('error', errorHandler)
      window.removeEventListener('unhandledrejection', rejectionHandler)
    }
  }, [])

  return null
}

