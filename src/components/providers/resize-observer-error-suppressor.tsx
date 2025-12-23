'use client'

import { useEffect } from 'react'

/**
 * Suppress the benign Chromium "ResizeObserver loop limit exceeded" error that can
 * appear when rapidly resizing panels. In Next.js dev mode this often surfaces as
 * an overlay "Console Error" even though the UI keeps working.
 */
export function ResizeObserverErrorSuppressor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const handler = (event: ErrorEvent) => {
      const message = event?.message || ''
      if (
        message.includes('ResizeObserver loop limit exceeded') ||
        message.includes('ResizeObserver loop completed with undelivered notifications')
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])

  return null
}

