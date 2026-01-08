'use client'

import { useParams } from 'next/navigation'

/**
 * A wrapper around `useParams` that ensures it never returns null.
 *
 * Note: `useParams` returns a record of dynamic route segments.
 */
export function useSafeParams<T extends Record<string, string | string[]>>(): T {
  return (useParams() ?? {}) as T
}
