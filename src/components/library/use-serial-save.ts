import { useEffect, useRef, useState } from 'react'

/**
 * Optimistic local copy of a server value with serialized saves.
 *
 * `commit(updater)` computes the next value from the LATEST local value (never
 * from stale props), shows it immediately and queues `save(next)` after the
 * previous save finished. Props only re-sync the local value while nothing is
 * in flight; a failed save resets the value to the latest server value.
 */
export function useSerialSave<T>(
  serverValue: T,
  save: (next: T) => Promise<void>,
  onError?: () => void,
) {
  const [value, setValue] = useState(serverValue)
  const valueRef = useRef(serverValue)
  const serverRef = useRef(serverValue)
  serverRef.current = serverValue
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const inFlightRef = useRef(0)
  const failedRef = useRef(false)
  const saveRef = useRef(save)
  saveRef.current = save
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const key = JSON.stringify(serverValue)
  useEffect(() => {
    if (inFlightRef.current > 0) return
    valueRef.current = serverRef.current
    setValue(serverRef.current)
  }, [key])

  function commit(updater: (cur: T) => T) {
    const next = updater(valueRef.current)
    valueRef.current = next
    setValue(next)
    inFlightRef.current++
    chainRef.current = chainRef.current
      .then(() => saveRef.current(next))
      .catch(() => {
        failedRef.current = true
        onErrorRef.current?.()
      })
      .finally(() => {
        inFlightRef.current--
        if (inFlightRef.current === 0 && failedRef.current) {
          failedRef.current = false
          valueRef.current = serverRef.current
          setValue(serverRef.current)
        }
      })
  }

  return { value, commit }
}
