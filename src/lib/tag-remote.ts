/** Pure helpers for Danbooru-backed tag data (related tags, rating counts). */

export type RemoteKind = 'related' | 'together' | 'ratings'

/** Cache time-to-live for remote tag data: 7 days. */
export const REMOTE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface RemoteTag {
  name: string
  category: number
  postCount: number
  /** Cosine similarity (related) or co-occurrence frequency (together), 0..1 */
  score: number
}

export interface RatingCounts {
  g: number | null
  s: number | null
  q: number | null
  e: number | null
}

export const RATING_KEYS = ['g', 's', 'q', 'e'] as const

/** True while a cache row fetched at `fetchedAt` (epoch ms) may still be used. */
export function isFresh(
  fetchedAt: number,
  now: number = Date.now(),
  ttl: number = REMOTE_TTL_MS,
): boolean {
  return (
    Number.isFinite(fetchedAt) && now - fetchedAt >= 0 && now - fetchedAt < ttl
  )
}

type Order = 'cosine' | 'frequency'

/**
 * `GET /related_tag.json?query=<tag>` response -> related tags, best first.
 * Drops the queried tag itself, meta tags (highres, ...), deprecated tags and
 * malformed rows.
 */
export function parseRelatedTags(
  json: unknown,
  self: string,
  order: Order,
  limit = 12,
): Array<RemoteTag> {
  const rows = (json as { related_tags?: unknown } | null)?.related_tags
  if (!Array.isArray(rows)) return []
  const out: Array<RemoteTag> = []
  for (const row of rows) {
    const r = row as {
      tag?: {
        name?: unknown
        category?: unknown
        post_count?: unknown
        is_deprecated?: unknown
      }
      cosine_similarity?: unknown
      frequency?: unknown
    }
    const tag = r.tag
    if (!tag || typeof tag.name !== 'string' || !tag.name) continue
    if (tag.name === self) continue
    if (tag.category === 5 || tag.is_deprecated === true) continue
    const raw = order === 'cosine' ? r.cosine_similarity : r.frequency
    const score = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    out.push({
      name: tag.name,
      category: typeof tag.category === 'number' ? tag.category : 0,
      postCount: typeof tag.post_count === 'number' ? tag.post_count : 0,
      score,
    })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

/** `GET /counts/posts.json` response -> post count, null when unavailable. */
export function parseCount(json: unknown): number | null {
  const posts = (json as { counts?: { posts?: unknown } } | null)?.counts?.posts
  return typeof posts === 'number' && Number.isFinite(posts) ? posts : null
}

/** A ratings result with no number at all counts as a failed load. */
export function hasAnyCount(r: RatingCounts): boolean {
  return RATING_KEYS.some((k) => r[k] !== null)
}
