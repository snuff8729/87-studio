export type SceneFilter = 'all' | 'reserved' | 'noImages'

export const SCENE_FILTERS: Array<SceneFilter> = ['all', 'reserved', 'noImages']

export interface FilterableScene {
  id: number
  name: string
  imageCount: number
}

export interface SceneFilterCounts {
  all: number
  reserved: number
  noImages: number
}

function matchesQuery(scene: FilterableScene, q: string): boolean {
  return !q || scene.name.toLowerCase().includes(q)
}

function isReserved(
  scene: FilterableScene,
  counts: Record<number, number>,
  defaultCount: number,
): boolean {
  return (counts[scene.id] ?? defaultCount) > 0
}

/**
 * Scenes matching the search query (case-insensitive trimmed substring of the
 * name) and the filter chip. Input order and item identity are preserved.
 */
export function filterScenes<T extends FilterableScene>(
  scenes: Array<T>,
  opts: { query: string; filter: SceneFilter },
  counts: Record<number, number>,
  defaultCount: number,
): Array<T> {
  const q = opts.query.trim().toLowerCase()
  return scenes.filter((s) => {
    if (!matchesQuery(s, q)) return false
    if (opts.filter === 'reserved') return isReserved(s, counts, defaultCount)
    if (opts.filter === 'noImages') return s.imageCount === 0
    return true
  })
}

/** Chip labels: how many scenes each filter would show for `query`. */
export function countByFilter(
  scenes: Array<FilterableScene>,
  query: string,
  counts: Record<number, number>,
  defaultCount: number,
): SceneFilterCounts {
  const q = query.trim().toLowerCase()
  const result: SceneFilterCounts = { all: 0, reserved: 0, noImages: 0 }
  for (const s of scenes) {
    if (!matchesQuery(s, q)) continue
    result.all += 1
    if (isReserved(s, counts, defaultCount)) result.reserved += 1
    if (s.imageCount === 0) result.noImages += 1
  }
  return result
}

export type SceneSortBy =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'images_desc'
  | 'images_asc'
  | 'created_asc'
  | 'created_desc'

export const SCENE_SORT_OPTIONS: Array<SceneSortBy> = [
  'default',
  'name_asc',
  'name_desc',
  'images_desc',
  'images_asc',
  'created_asc',
  'created_desc',
]

/** Sorted copy (`default` returns the input as-is: pack sort order). */
export function sortScenes<T extends FilterableScene>(
  scenes: Array<T>,
  sortBy: SceneSortBy,
): Array<T> {
  if (sortBy === 'default') return scenes
  const sorted = [...scenes]
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'name_asc':
        return a.name.localeCompare(b.name)
      case 'name_desc':
        return b.name.localeCompare(a.name)
      case 'images_desc':
        return b.imageCount - a.imageCount
      case 'images_asc':
        return a.imageCount - b.imageCount
      case 'created_asc':
        return a.id - b.id
      case 'created_desc':
        return b.id - a.id
    }
  })
  return sorted
}
