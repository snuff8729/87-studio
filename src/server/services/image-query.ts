import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { generatedImages } from '../db/schema'
import type { SQL } from 'drizzle-orm'
import { likeFragments, metadataHasPromptTag } from '@/lib/prompt-tags'

// Exact whole-token match inside SQL, so pagination and prev/next keyset
// queries stay correct. Registered once on the shared connection.
const PROMPT_TAG_FN = 'prompt_has_tag'
let promptTagFnRegistered = false
function ensurePromptTagFn() {
  if (promptTagFnRegistered) return
  db.$client.function(
    PROMPT_TAG_FN,
    { deterministic: true },
    (metadata: unknown, tag: unknown) =>
      metadataHasPromptTag(
        typeof metadata === 'string' ? metadata : null,
        String(tag),
      )
        ? 1
        : 0,
  )
  promptTagFnRegistered = true
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type ImageSort = 'newest' | 'oldest' | 'rating' | 'favorites'

/** Filters shared by the gallery list and the detail view's prev/next. */
export interface ImageFilters {
  projectId?: number
  projectSceneId?: number
  sourceSceneId?: number
  isFavorite?: boolean
  minRating?: number
  /** Percent; only images with at least one tournament match qualify */
  minWinRate?: number
  tagIds?: Array<number>
  bundleId?: number
  quickGenerate?: boolean
  /** Danbooru tag that must be a whole token of the positive prompts */
  promptTag?: string
}

export function buildImageConditions(data: ImageFilters) {
  const conditions = []
  if (data.quickGenerate) conditions.push(isNull(generatedImages.projectId))
  if (data.projectId)
    conditions.push(eq(generatedImages.projectId, data.projectId))
  if (data.projectSceneId)
    conditions.push(eq(generatedImages.projectSceneId, data.projectSceneId))
  if (data.sourceSceneId)
    conditions.push(eq(generatedImages.sourceSceneId, data.sourceSceneId))
  if (data.isFavorite) conditions.push(eq(generatedImages.isFavorite, 1))
  if (data.minRating)
    conditions.push(sql`${generatedImages.rating} >= ${data.minRating}`)
  if (data.minWinRate) {
    conditions.push(
      sql`(${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) > 0 AND CAST(${generatedImages.tournamentWins} AS REAL) / (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) * 100 >= ${data.minWinRate}`,
    )
  }
  if (data.bundleId) {
    conditions.push(
      sql`${generatedImages.id} IN (SELECT image_id FROM image_bundles WHERE bundle_id = ${data.bundleId})`,
    )
  }
  // Tag filter as SQL subquery (not post-filter)
  if (data.tagIds && data.tagIds.length > 0) {
    conditions.push(
      sql`${generatedImages.id} IN (SELECT image_id FROM image_tags WHERE tag_id IN (${sql.join(
        data.tagIds.map((id) => sql`${id}`),
        sql`, `,
      )}))`,
    )
  }
  // Prompt tag: cheap LIKE pre-filter first, then the exact token match
  const promptTag = data.promptTag?.trim()
  if (promptTag) {
    const fragments = likeFragments(promptTag)
    if (fragments.length > 0) {
      ensurePromptTagFn()
      const likes = fragments.map(
        (f) =>
          sql`${generatedImages.metadata} LIKE ${`%${escapeLike(f)}%`} ESCAPE '\\'`,
      )
      conditions.push(
        sql`(${sql.join(likes, sql` OR `)}) AND prompt_has_tag(${generatedImages.metadata}, ${promptTag}) = 1`,
      )
    } else {
      conditions.push(sql`0`)
    }
  }
  return conditions
}

interface SortKey {
  expr: SQL
  desc: boolean
}

const createdAt = sql`${generatedImages.createdAt}`
const idKey = sql`${generatedImages.id}`
const ratingKey = sql`coalesce(${generatedImages.rating}, -1)`
const favoriteKey = sql`coalesce(${generatedImages.isFavorite}, 0)`

/** Sort keys in order; `id` is the final tiebreak so the order is total. */
function sortKeys(sortBy: ImageSort | undefined): Array<SortKey> {
  switch (sortBy ?? 'newest') {
    case 'oldest':
      return [
        { expr: createdAt, desc: false },
        { expr: idKey, desc: false },
      ]
    case 'rating':
      return [
        { expr: ratingKey, desc: true },
        { expr: createdAt, desc: true },
        { expr: idKey, desc: true },
      ]
    case 'favorites':
      return [
        { expr: favoriteKey, desc: true },
        { expr: createdAt, desc: true },
        { expr: idKey, desc: true },
      ]
    default:
      return [
        { expr: createdAt, desc: true },
        { expr: idKey, desc: true },
      ]
  }
}

/** ORDER BY clauses (`reverse` flips every direction). */
export function imageOrder(sortBy: ImageSort | undefined, reverse = false) {
  return sortKeys(sortBy).map((k) =>
    k.desc !== reverse ? desc(k.expr) : asc(k.expr),
  )
}

/** The sort-key values of one image, in `sortKeys` order. */
export function sortValues(
  sortBy: ImageSort | undefined,
  image: {
    id: number
    createdAt: string | null
    rating: number | null
    isFavorite: number | null
  },
): Array<string | number | null> {
  return sortKeys(sortBy).map((k) =>
    k.expr === createdAt
      ? image.createdAt
      : k.expr === ratingKey
        ? (image.rating ?? -1)
        : k.expr === favoriteKey
          ? (image.isFavorite ?? 0)
          : image.id,
  )
}

/**
 * Keyset predicate: rows strictly after (`side: 'after'`) or before the given
 * sort position in the list order. Works even when the image itself no longer
 * matches the filters.
 */
export function afterPosition(
  sortBy: ImageSort | undefined,
  values: Array<string | number | null>,
  side: 'after' | 'before',
) {
  const keys = sortKeys(sortBy)
  const terms: Array<SQL> = []
  for (let i = 0; i < keys.length; i++) {
    const eqs = keys.slice(0, i).map((k, j) => sql`${k.expr} = ${values[j]}`)
    const greater = keys[i].desc !== (side === 'before')
    const cmp = greater
      ? sql`${keys[i].expr} < ${values[i]}`
      : sql`${keys[i].expr} > ${values[i]}`
    terms.push(and(...eqs, cmp) as SQL)
  }
  return or(...terms) as SQL
}
