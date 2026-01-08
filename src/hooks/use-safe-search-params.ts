'use client'

import { useSearchParams } from 'next/navigation'

/**
 * A wrapper around `useSearchParams` that ensures it never returns null.
 * This prevents the need for optional chaining or null checks in components.
 * @returns A URLSearchParams object, guaranteed to be non-null.
 */
export function useSafeSearchParams(): URLSearchParams {
  return useSearchParams() ?? new URLSearchParams()
}
