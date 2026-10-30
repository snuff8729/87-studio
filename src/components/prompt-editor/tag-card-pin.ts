import type { CardPos } from '@/lib/tag-card-pos'
import { parseStoredPos } from '@/lib/tag-card-pos'

/**
 * Pinned position of the caret tag info card (shared by all editors).
 * A stored position = pinned; null = the card follows the caret. Pinning is
 * disabled on small screens.
 */

const POS_KEY = '87studio-tag-card-pos'
const PIN_EVENT = 'studio-tag-card-pin-change'

export function isCompactViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  )
}

export function getPinnedPos(): CardPos | null {
  if (isCompactViewport()) return null
  try {
    return parseStoredPos(localStorage.getItem(POS_KEY))
  } catch {
    return null
  }
}

export function setPinnedPos(pos: CardPos | null) {
  try {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos))
    else localStorage.removeItem(POS_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PIN_EVENT))
}

export function subscribePinned(cb: () => void): () => void {
  window.addEventListener(PIN_EVENT, cb)
  return () => window.removeEventListener(PIN_EVENT, cb)
}
