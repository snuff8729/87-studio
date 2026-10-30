import type { RemoteResult, TagInfo } from '@/server/functions/tag-assist'
import type { RemoteKind } from '@/lib/tag-remote'
import type { Locale } from '@/lib/i18n'
import { createT } from '@/lib/i18n/t'
import { getTagInfo, getTagRemote } from '@/server/functions/tag-assist'

/** UI locale outside React (CodeMirror plugins): <html lang> is kept in sync. */
export function currentLocale(): Locale {
  if (typeof document === 'undefined') return 'en'
  return document.documentElement.lang === 'ko' ? 'ko' : 'en'
}

export function translator() {
  return createT(currentLocale())
}

const cache = new Map<string, Promise<TagInfo | null>>()

/**
 * Tag info for a name. An unknown tag (server answered null) is cached; a
 * failed request (server restarting, network blip) is NOT, so one transient
 * error cannot silence the card for that tag until reload.
 */
export function loadTagInfo(name: string): Promise<TagInfo | null> {
  const locale = currentLocale()
  const key = `${locale}|${name.toLowerCase().replace(/\s+/g, '_')}`
  let p = cache.get(key)
  if (!p) {
    const req: Promise<TagInfo | null> = getTagInfo({
      data: { name, locale },
    })
    p = req.catch(() => {
      cache.delete(key)
      return null
    })
    if (cache.size > 800) cache.clear()
    cache.set(key, p)
  }
  return p
}

// ── Danbooru-backed sections (Recommended / Used together / Rating counts) ───

const remoteDone = new Map<string, RemoteResult>()
const remotePending = new Map<string, Promise<RemoteResult>>()
/** Consecutive failed remote loads (any success resets it). */
let remoteFailStreak = 0
export const REMOTE_UNREACHABLE_AFTER = 3
export function isDanbooruUnreachable(): boolean {
  return remoteFailStreak >= REMOTE_UNREACHABLE_AFTER
}
const remoteKey = (name: string, kind: RemoteKind) => `${kind}|${name}`

/** Cached successful remote result, if any (synchronous). */
export function peekRemote(
  name: string,
  kind: RemoteKind,
): RemoteResult | null {
  return remoteDone.get(remoteKey(name, kind)) ?? null
}

/** Remote data; successes are cached for the session, failures are not. */
export function loadRemote(
  name: string,
  kind: RemoteKind,
  force = false,
): Promise<RemoteResult> {
  const key = remoteKey(name, kind)
  const done = force ? undefined : remoteDone.get(key)
  if (done) return Promise.resolve(done)
  let p = remotePending.get(key)
  if (!p) {
    const req: Promise<RemoteResult> = getTagRemote({
      data: { name, kind, force },
    })
    p = req
      .catch((): RemoteResult => ({ ok: false, error: 'request failed' }))
      .then((r) => {
        remoteFailStreak = r.ok ? 0 : remoteFailStreak + 1
        const partial = r.ok && r.kind === 'ratings' && r.partial
        if (r.ok && !partial) {
          if (remoteDone.size > 500) remoteDone.clear()
          remoteDone.set(key, r)
        }
        return r
      })
      .finally(() => remotePending.delete(key))
    remotePending.set(key, p)
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
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOGGLE_KEY) cb()
  }
  window.addEventListener(TOGGLE_EVENT, cb)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(TOGGLE_EVENT, cb)
    window.removeEventListener('storage', onStorage)
  }
}
