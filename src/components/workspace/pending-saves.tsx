import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * Registry of debounced editor saves, so an action that must see the latest
 * values (Generate) can flush every pending save first.
 */
export interface PendingSaveEntry {
  /** Saves the pending edit now (or awaits an in-flight save). */
  flush: () => Promise<void>
  /** Drops the pending edit without saving (e.g. its target was deleted). */
  discard?: () => void
  /** Groups entries for `discard(key)` (e.g. `scene:12`). */
  key?: string
}

export interface PendingSaves {
  register: (entry: PendingSaveEntry) => () => void
  /** Flushes all registered entries; resolves when every save settled. */
  flushAll: () => Promise<void>
  /** Discards the pending edits of entries registered under `key`. */
  discard: (key: string) => void
}

export function createPendingSaves(): PendingSaves {
  const entries = new Set<PendingSaveEntry>()
  return {
    register(entry) {
      entries.add(entry)
      return () => {
        entries.delete(entry)
      }
    },
    async flushAll() {
      await Promise.allSettled([...entries].map((e) => e.flush()))
    },
    discard(key) {
      for (const e of entries) if (e.key === key) e.discard?.()
    },
  }
}

const PendingSavesContext = createContext<PendingSaves | null>(null)

export function PendingSavesProvider({
  value,
  children,
}: {
  value: PendingSaves
  children: ReactNode
}) {
  return (
    <PendingSavesContext.Provider value={value}>
      {children}
    </PendingSavesContext.Provider>
  )
}

/**
 * Registers `entry` with the nearest provider for the component's lifetime
 * (no-op without a provider). The latest `entry` is always used.
 */
export function usePendingSave(entry: PendingSaveEntry) {
  const registry = useContext(PendingSavesContext)
  const ref = useRef(entry)
  ref.current = entry
  const key = entry.key
  useEffect(() => {
    if (!registry) return
    return registry.register({
      key,
      flush: () => ref.current.flush(),
      discard: () => ref.current.discard?.(),
    })
  }, [registry, key])
}
