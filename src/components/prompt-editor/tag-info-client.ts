import type { TagInfo } from '@/server/functions/tag-assist'
import type { Locale } from '@/lib/i18n'
import { createT } from '@/lib/i18n/t'
import { getTagInfo } from '@/server/functions/tag-assist'

/** UI locale outside React (CodeMirror plugins): <html lang> is kept in sync. */
export function currentLocale(): Locale {
  if (typeof document === 'undefined') return 'en'
  return document.documentElement.lang === 'ko' ? 'ko' : 'en'
}

export function translator() {
  return createT(currentLocale())
}

const cache = new Map<string, Promise<TagInfo | null>>()

/** Cached tag info (also negative results); never rejects. */
export function loadTagInfo(name: string): Promise<TagInfo | null> {
  const locale = currentLocale()
  const key = `${locale}|${name.toLowerCase().replace(/\s+/g, '_')}`
  let p = cache.get(key)
  if (!p) {
    p = getTagInfo({ data: { name, locale } }).catch(() => null)
    if (cache.size > 800) cache.clear()
    cache.set(key, p)
  }
  return p
}

// ── caret-card toggle (persisted) ────────────────────────────────────────────

const TOGGLE_KEY = '87studio-tag-info'
const TOGGLE_EVENT = 'studio-tag-info-change'

export function isTagInfoEnabled(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) !== '0'
  } catch {
    return true
  }
}

export function setTagInfoEnabled(on: boolean) {
  try {
    localStorage.setItem(TOGGLE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(TOGGLE_EVENT))
}

export function subscribeTagInfoEnabled(cb: () => void): () => void {
  window.addEventListener(TOGGLE_EVENT, cb)
  return () => window.removeEventListener(TOGGLE_EVENT, cb)
}
