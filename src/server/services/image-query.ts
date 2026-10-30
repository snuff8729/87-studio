import { asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { generatedImages } from '../db/schema'

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
  return conditions
}

/** ORDER BY clauses; `id` is the final tiebreak so the order is stable. */
export function imageOrder(sortBy: ImageSort | undefined) {
  switch (sortBy ?? 'newest') {
    case 'oldest':
      return [asc(generatedImages.createdAt), asc(generatedImages.id)]
    case 'rating':
      return [
        desc(generatedImages.rating),
        desc(generatedImages.createdAt),
        desc(generatedImages.id),
      ]
    case 'favorites':
      return [
        desc(generatedImages.isFavorite),
        desc(generatedImages.createdAt),
        desc(generatedImages.id),
      ]
    default:
      return [desc(generatedImages.createdAt), desc(generatedImages.id)]
  }
}
