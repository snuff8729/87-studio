export type GallerySort = 'newest' | 'oldest' | 'rating' | 'favorites'

/** URL search params of /gallery (also carried by the detail child route). */
export type GalleryFilters = {
  project?: number
  projectSceneId?: number
  tag?: number
  bundle?: number
  favorite?: boolean
  minRating?: number
  /** Percent; images without tournament matches never pass */
  minWinRate?: number
  sortBy?: GallerySort
  quick?: boolean
}

/** Server-side filter arguments for a gallery URL (listImages / detail prev-next). */
export function toImageQuery(f: GalleryFilters) {
  return {
    projectId: f.project,
    projectSceneId: f.projectSceneId,
    isFavorite: f.favorite,
    minRating: f.minRating,
    minWinRate: f.minWinRate,
    tagIds: f.tag ? [f.tag] : undefined,
    bundleId: f.bundle,
    sortBy: f.sortBy,
    quickGenerate: f.quick,
  }
}
