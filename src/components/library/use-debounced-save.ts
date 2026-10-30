import { useCallback, useEffect, useRef } from 'react'

/**
 * Debounced "latest wins" saver. The scheduled function runs after `delay` ms
 * of quiet, immediately on `flush()`, and on unmount (so switching selection
 * or leaving the page never loses an edit). `cancel()` drops it.
 */
export function useDebouncedSave(delay = 800) {
  const fnRef = useRef<(() => unknown) | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    const fn = fnRef.current
    fnRef.current = null
    fn?.()
  }, [])

  const schedule = useCallback(
    (fn: () => unknown) => {
      fnRef.current = fn
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    fnRef.current = null
  }, [])

  const isPending = useCallback(() => fnRef.current !== null, [])

  useEffect(() => flush, [flush])

  return { schedule, flush, cancel, isPending }
}
