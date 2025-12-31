'use client'

import { useEffect } from 'react'

/**
 * Suppress benign errors that can appear in development:
 * - Chromium "ResizeObserver loop limit exceeded"
 * - FetchError from browser extensions or failed fetches
 */
export function ResizeObserverErrorSuppressor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

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

    // Handle unhandled promise rejections (like FetchError)
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      // Suppress FetchError from browser extensions or benign fetch failures
      if (reason && typeof reason === 'object' && reason.name === 'FetchError') {
        // Log details in development for debugging
        console.debug('[Suppressed FetchError]', reason)
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

