import https from 'node:https'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { tagRemoteCache } from '../db/schema'
import { createLogger } from './logger'
import type { RatingCounts, RemoteKind, RemoteTag } from '@/lib/tag-remote'
import {
  RATING_KEYS,
  isFresh,
  parseCount,
  parseRelatedTags,
} from '@/lib/tag-remote'
import { normalizeTagQuery } from '@/lib/tag-query'

/**
 * Danbooru-backed tag data (NOT NAI, so NAI_MOCK does not affect it):
 *  - related  = GET /related_tag.json?query=<tag>&order=Cosine
 *  - together = GET /related_tag.json?query=<tag>&order=Frequency
 *  - ratings  = GET /counts/posts.json?tags=<tag>+rating:g|s|q|e
 * Results are cached in the studio DB (7 days) and in memory; concurrent
 * identical requests share one fetch; at most 2 requests run at once.
 * `TAG_REMOTE_MOCK=1` returns fixed fake data without touching the network.
 */

export type RemoteResult =
  | {
      ok: true
      kind: 'related' | 'together'
      tags: Array<RemoteTag>
    }
  | {
      ok: true
      kind: 'ratings'
      ratings: RatingCounts
      /** Some of the 4 requests failed: shown, but not cached */
      partial?: boolean
    }
  | { ok: false; error: string }

const log = createLogger('tag-remote')
const HOST = 'danbooru.donmai.us'
const USER_AGENT = '87studio-tag-assist/1.0 (personal prompt manager)'
const RELATED_LIMIT = 30
const SHOW_LIMIT = 12
/** Failed loads are not retried automatically for this long (retry button skips it). */
const FAIL_BACKOFF_MS = 60_000

const isMock = () => process.env.TAG_REMOTE_MOCK === '1'

// ── concurrency limit ────────────────────────────────────────────────────────

const MAX_CONCURRENT = 2
const MIN_SPACING_MS = 250
let running = 0
let nextStart = 0
const waiting: Array<() => void> = []

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  running++
  try {
    // polite pacing: request starts are at least MIN_SPACING_MS apart
    const wait = nextStart - Date.now()
    nextStart = Math.max(nextStart, Date.now()) + MIN_SPACING_MS
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    return await fn()
  } finally {
    running--
    waiting.shift()?.()
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

// Reused connections avoid repeated TLS handshakes.
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: MAX_CONCURRENT,
})

function getJson(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        host: HOST,
        path,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        agent,
        timeout: 12_000,
      },
      (res) => {
        const chunks: Array<Buffer> = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error('invalid JSON'))
          }
        })
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

/** One request through the limiter; connection resets are retried (up to 6 tries; cold connections are often reset by Danbooru's Cloudflare, warm keep-alive ones rarely). */
function fetchJson(path: string): Promise<unknown> {
  return limited(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await getJson(path)
      } catch (e) {
        lastError = e
        const msg = e instanceof Error ? e.message : String(e)
        if (/HTTP 4/.test(msg) && !/HTTP 429/.test(msg)) throw e
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    throw lastError
  })
}

// ── per-kind fetchers ────────────────────────────────────────────────────────

async function fetchRelated(
  tag: string,
  order: 'cosine' | 'frequency',
): Promise<Array<RemoteTag>> {
  const q = encodeURIComponent(tag)
  const json = await fetchJson(
    `/related_tag.json?query=${q}&limit=${RELATED_LIMIT}&order=${order === 'cosine' ? 'Cosine' : 'Frequency'}`,
  )
  return parseRelatedTags(json, tag, order, SHOW_LIMIT)
}

async function fetchRatings(
  tag: string,
): Promise<{ ratings: RatingCounts; partial: boolean }> {
  const q = encodeURIComponent(tag)
  const out: RatingCounts = { g: null, s: null, q: null, e: null }
  const results = await Promise.allSettled(
    RATING_KEYS.map((k) =>
      fetchJson(`/counts/posts.json?tags=${q}+rating:${k}`),
    ),
  )
  RATING_KEYS.forEach((k, i) => {
    const r = results[i]
    if (r.status === 'fulfilled') out[k] = parseCount(r.value)
  })
  // Danbooru answers { posts: null } for very common tags (count too
  // expensive); that is a valid answer. Only failed requests are a problem:
  // all failed = error, some failed = partial (shown, not cached).
  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length === results.length) {
    throw new Error(String((failures[0].reason as Error).message))
  }
  return { ratings: out, partial: failures.length > 0 }
}

// ── mock ─────────────────────────────────────────────────────────────────────

const MOCK_TAGS: Array<[string, number]> = [
  ['1girl', 0],
  ['solo', 0],
  ['blue_eyes', 0],
  ['smile', 0],
  ['looking_at_viewer', 0],
  ['long_sleeves', 0],
  ['school_uniform', 0],
  ['bangs', 0],
]

function mockResult(
  tag: string,
  kind: RemoteKind,
  force: boolean,
): RemoteResult {
  if (kind === 'ratings') {
    const n = tag.length
    return {
      ok: true,
      kind,
      ratings: { g: 12000 + n, s: 3400 + n, q: 560 + n, e: 70 + n },
    }
  }
  // "solo" Recommended fails until retried with force (retry-button smoke)
  if (tag === 'solo' && kind === 'related' && !force) {
    return { ok: false, error: 'mock failure' }
  }
  const rotate = kind === 'together' ? 3 : 0
  const tags = MOCK_TAGS.filter(([n]) => n !== tag)
    .map(([, category], i, arr) => ({
      name: arr[(i + rotate) % arr.length][0],
      category,
      postCount: 100000 - i * 1000,
      score: 0.9 - i * 0.07,
    }))
    .slice(0, 8)
  return { ok: true, kind, tags }
}

// ── cache + entry point ──────────────────────────────────────────────────────

const memory = new Map<string, { at: number; result: RemoteResult }>()
const failedAt = new Map<string, number>()
const inflight = new Map<string, Promise<RemoteResult>>()

function readDb(tag: string, kind: RemoteKind): RemoteResult | null {
  try {
    const row = db
      .select()
      .from(tagRemoteCache)
      .where(and(eq(tagRemoteCache.tag, tag), eq(tagRemoteCache.kind, kind)))
      .get()
    if (!row || !isFresh(row.fetchedAt)) return null
    return JSON.parse(row.json) as RemoteResult
  } catch {
    return null
  }
}

function writeDb(tag: string, kind: RemoteKind, result: RemoteResult) {
  try {
    const now = Date.now()
    db.insert(tagRemoteCache)
      .values({ tag, kind, json: JSON.stringify(result), fetchedAt: now })
      .onConflictDoUpdate({
        target: [tagRemoteCache.tag, tagRemoteCache.kind],
        set: { json: JSON.stringify(result), fetchedAt: now },
      })
      .run()
  } catch (e) {
    log.warn('cache-write', 'tag remote cache write failed', {
      error: String(e),
    })
  }
}

async function load(tag: string, kind: RemoteKind): Promise<RemoteResult> {
  try {
    if (kind === 'ratings') {
      const r = await fetchRatings(tag)
      return {
        ok: true,
        kind,
        ratings: r.ratings,
        partial: r.partial || undefined,
      }
    }
    const tags = await fetchRelated(
      tag,
      kind === 'related' ? 'cosine' : 'frequency',
    )
    return { ok: true, kind, tags }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    log.warn('fetch', 'tag remote fetch failed', { tag, kind, error })
    return { ok: false, error }
  }
}

/**
 * Remote data for a canonical tag name. Never throws; failures come back as
 * `{ ok: false }` and are not cached (except a short back-off so a dead
 * network does not retrigger on every caret move). `force` skips caches.
 */
export function getTagRemoteFor(
  rawName: string,
  kind: RemoteKind,
  force = false,
): Promise<RemoteResult> {
  const tag = normalizeTagQuery(rawName)
  if (!tag) return Promise.resolve({ ok: false, error: 'empty tag' })
  if (isMock()) return Promise.resolve(mockResult(tag, kind, force))

  const key = `${kind}|${tag}`
  if (!force) {
    const mem = memory.get(key)
    if (mem && isFresh(mem.at)) return Promise.resolve(mem.result)
    const stored = readDb(tag, kind)
    if (stored) {
      memory.set(key, { at: Date.now(), result: stored })
      return Promise.resolve(stored)
    }
    const failed = failedAt.get(key)
    if (failed && Date.now() - failed < FAIL_BACKOFF_MS) {
      return Promise.resolve({ ok: false, error: 'recent failure' })
    }
  }
  const pending = inflight.get(key)
  if (pending) return pending
  const p = load(tag, kind)
    .then((result) => {
      if (result.ok && result.kind === 'ratings' && result.partial) {
        return result
      }
      if (result.ok) {
        failedAt.delete(key)
        if (memory.size > 2000) memory.clear()
        memory.set(key, { at: Date.now(), result })
        writeDb(tag, kind, result)
      } else {
        failedAt.set(key, Date.now())
      }
      return result
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}
