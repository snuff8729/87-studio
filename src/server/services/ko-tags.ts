import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { createLogger } from './logger'
import { koFilePath } from './data-registry'
import type { KoKeywordRow } from '@/lib/ko-tags'
import { koQueryForms } from '@/lib/ko-tags'

/**
 * Korean tag data (NAIA2.0, GPL-3.0): a small SQLite file hosted next to
 * danbooru.db. Installed from Settings > Data (nothing downloads by itself);
 * everything that uses it falls back silently while it is not there.
 * Download and replacement live in data-files.ts, the file lookup in
 * data-registry.ts.
 */

const log = createLogger('ko-tags')
const HIGH = '￿'

export interface KoTagsStatus {
  ready: boolean
  tags: number
}

let koDb: Database.Database | null = null
const readyListeners: Array<() => void> = []

/** Called when the Korean data appears or goes away (cache invalidation). */
export function onKoTagsReady(fn: () => void) {
  readyListeners.push(fn)
}

function openDb(): Database.Database | null {
  if (koDb) return koDb
  const path = koFilePath()
  if (!path || !existsSync(path)) return null
  try {
    const d = new Database(path, { readonly: true })
    d.prepare('SELECT 1 FROM ko_tags LIMIT 1').get()
    koDb = d
    for (const fn of readyListeners) fn()
    return koDb
  } catch (err) {
    log.warn('open', 'Korean tag data is unreadable', { error: String(err) })
    return null
  }
}

/** Close the handle (before the file is replaced or deleted) and reset caches. */
export function closeKoDb() {
  try {
    koDb?.close()
  } catch {
    /* already closed */
  }
  koDb = null
  for (const fn of readyListeners) fn()
}

/** Handle on the Korean data, or null when not installed. */
export function getKoDb(): Database.Database | null {
  return openDb()
}

export function getKoStatus(): KoTagsStatus {
  const d = getKoDb()
  if (!d) return { ready: false, tags: 0 }
  const n = d.prepare('SELECT COUNT(*) AS n FROM ko_tags').get() as {
    n: number
  }
  return { ready: true, tags: n.n }
}

export interface KoTagRow {
  tag: string
  small: string | null
  groupKey: string | null
  description: string
  keywords: string
}

const rowCache = new Map<string, KoTagRow | null>()
onKoTagsReady(() => rowCache.clear())

export function koTagFor(name: string): KoTagRow | null {
  const d = getKoDb()
  if (!d) return null
  if (rowCache.has(name)) return rowCache.get(name) ?? null
  const r = d
    .prepare(
      'SELECT tag, small_category, group_key, description, keywords FROM ko_tags WHERE tag = ?',
    )
    .get(name) as
    | {
        tag: string
        small_category: string | null
        group_key: string | null
        description: string
        keywords: string
      }
    | undefined
  const row = r
    ? {
        tag: r.tag,
        small: r.small_category,
        groupKey: r.group_key,
        description: r.description,
        keywords: r.keywords,
      }
    : null
  if (rowCache.size > 50_000) rowCache.clear()
  rowCache.set(name, row)
  return row
}

const SQL_PER_KIND = 120

/**
 * Keyword rows that may match a (normalised) Korean query: exact and prefix via
 * the keyword index, substring via a LIKE scan (>= 2 chars).
 */
export function koKeywordCandidates(query: string): Array<KoKeywordRow> {
  const d = getKoDb()
  if (!d) return []
  const forms = koQueryForms(query)
  if (forms.length === 0) return []
  const out = new Map<string, KoKeywordRow>()
  const add = (rows: Array<KoKeywordRow>) => {
    for (const r of rows) out.set(r.keyword + '\0' + r.tag, r)
  }
  const exact = d.prepare(
    `SELECT k.keyword, k.tag, k.kind, t.count FROM ko_keywords k
     JOIN ko_tags t ON t.tag = k.tag WHERE k.keyword = ?
     ORDER BY k.kind, t.count DESC LIMIT ?`,
  )
  const prefix = d.prepare(
    `SELECT k.keyword, k.tag, k.kind, t.count FROM ko_keywords k
     JOIN ko_tags t ON t.tag = k.tag WHERE k.keyword >= ? AND k.keyword < ?
     ORDER BY t.count DESC LIMIT ?`,
  )
  const sub = d.prepare(
    `SELECT k.keyword, k.tag, k.kind, t.count FROM ko_keywords k
     JOIN ko_tags t ON t.tag = k.tag WHERE k.keyword LIKE ? ESCAPE '\\'
     ORDER BY t.count DESC LIMIT ?`,
  )
  for (const f of forms) {
    add(exact.all(f, SQL_PER_KIND) as Array<KoKeywordRow>)
    add(prefix.all(f, f + HIGH, SQL_PER_KIND) as Array<KoKeywordRow>)
    if (f.length >= 2) {
      add(
        sub.all(
          `%${f.replace(/[\\%_]/g, '\\$&')}%`,
          SQL_PER_KIND,
        ) as Array<KoKeywordRow>,
      )
    }
  }
  return [...out.values()]
}

export interface KoCategoryCount {
  group: string
  /** Small category (the part after ">"), the same text koFineKey uses */
  small: string
  count: number
}

let categoryCache: Array<KoCategoryCount> | null = null
onKoTagsReady(() => {
  categoryCache = null
})

/** Small categories per group with tag counts (sub filters in Tag Search). */
export function koCategories(): Array<KoCategoryCount> {
  const d = getKoDb()
  if (!d) return []
  if (categoryCache) return categoryCache
  const rows = d
    .prepare(
      `SELECT group_key AS g, small_category AS s, COUNT(*) AS n
       FROM ko_tags WHERE group_key IS NOT NULL AND small_category IS NOT NULL
       GROUP BY g, s`,
    )
    .all() as Array<{ g: string; s: string; n: number }>
  const merged = new Map<string, KoCategoryCount>()
  for (const r of rows) {
    const parts = r.s.split('>').map((p) => p.trim())
    const small = parts[parts.length - 1] || r.s
    const key = r.g + '\0' + small
    const prev = merged.get(key)
    if (prev) prev.count += r.n
    else merged.set(key, { group: r.g, small, count: r.n })
  }
  categoryCache = [...merged.values()].sort((a, b) => b.count - a.count)
  return categoryCache
}
