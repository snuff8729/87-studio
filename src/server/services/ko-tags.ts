import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { dataPath } from '../data-dir'
import { createLogger } from './logger'
import { NAI_MOCK } from './nai-mock'
import type { KoKeywordRow } from '@/lib/ko-tags'
import {
  KO_TAGS_BASE_URL,
  KO_TAGS_FILE,
  KO_TAGS_VERSION,
  koQueryForms,
} from '@/lib/ko-tags'

/**
 * Korean tag data (NAIA2.0, GPL-3.0): a small SQLite file hosted next to
 * danbooru.db. Downloaded in the background on first need; everything that
 * uses it falls back silently while it is not there (offline, not uploaded).
 *
 * KO_TAGS_URL overrides the base URL (must end with `/`). A file placed in the
 * data directory by hand is used as is. NAI_MOCK servers only download when
 * KO_TAGS_URL is set, so smoke runs never touch the network.
 */

const log = createLogger('ko-tags')
const LOGICAL_PATH = `./data/${KO_TAGS_FILE}`
const RETRY_MS = 10 * 60 * 1000
const HIGH = '￿'

export type KoTagsState = 'ready' | 'downloading' | 'unavailable'

export interface KoTagsStatus {
  state: KoTagsState
  version: string
  tags: number
}

let koDb: Database.Database | null = null
let downloading: Promise<void> | null = null
let failedAt = 0
const readyListeners: Array<() => void> = []

/** Called once when the Korean data becomes available (cache invalidation). */
export function onKoTagsReady(fn: () => void) {
  readyListeners.push(fn)
}

function filePath(): string {
  return dataPath(LOGICAL_PATH)
}

function openDb(): Database.Database | null {
  if (koDb) return koDb
  if (!existsSync(filePath())) return null
  try {
    const d = new Database(filePath(), { readonly: true })
    d.prepare('SELECT 1 FROM ko_tags LIMIT 1').get()
    koDb = d
    for (const fn of readyListeners) fn()
    return koDb
  } catch (err) {
    log.warn('open', 'Korean tag data is unreadable', { error: String(err) })
    return null
  }
}

function downloadAllowed(): boolean {
  return !NAI_MOCK || !!process.env.KO_TAGS_URL
}

async function download() {
  const base = process.env.KO_TAGS_URL || KO_TAGS_BASE_URL
  const res = await fetch(base + KO_TAGS_FILE)
  if (!res.ok) {
    throw new Error(`Korean tag data download failed (${res.status})`)
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  const dest = filePath()
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = dest + '.tmp'
  writeFileSync(tmp, bytes)
  try {
    const d = new Database(tmp, { readonly: true })
    const v = d
      .prepare("SELECT value FROM meta WHERE key = 'version'")
      .get() as { value: string } | undefined
    d.close()
    if (v?.value !== KO_TAGS_VERSION) {
      throw new Error(`Unexpected Korean tag data version ${v?.value}`)
    }
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  renameSync(tmp, dest)
  // drop older versions
  for (const f of readdirSync(dirname(dest))) {
    if (/^naia-ko-v\d+\.db$/.test(f) && f !== KO_TAGS_FILE) {
      rmSync(join(dirname(dest), f), { force: true })
    }
  }
  log.info('download', 'Korean tag data downloaded', { bytes: bytes.length })
}

/** Start the background download when needed (idempotent, never throws). */
export function ensureKoTags() {
  if (koDb || downloading || existsSync(filePath())) return
  if (!downloadAllowed()) return
  if (Date.now() - failedAt < RETRY_MS) return
  downloading = download()
    .catch((err) => {
      failedAt = Date.now()
      log.warn('download', 'Korean tag data unavailable', {
        error: String(err),
      })
    })
    .finally(() => {
      downloading = null
    })
}

/** Handle on the Korean data, or null (and kick off the download). */
export function getKoDb(): Database.Database | null {
  const d = openDb()
  if (d) return d
  ensureKoTags()
  return null
}

export function getKoStatus(): KoTagsStatus {
  const d = getKoDb()
  if (d) {
    const n = d.prepare('SELECT COUNT(*) AS n FROM ko_tags').get() as {
      n: number
    }
    return { state: 'ready', version: KO_TAGS_VERSION, tags: n.n }
  }
  return {
    state: downloading ? 'downloading' : 'unavailable',
    version: KO_TAGS_VERSION,
    tags: 0,
  }
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
