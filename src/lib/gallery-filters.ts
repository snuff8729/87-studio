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
  /** Danbooru tag that must appear in the positive prompt */
  promptTag?: string
  /** `axisId:valueId` pairs, comma-separated (one value per axis) */
  axis?: string
  libraryCharacter?: number
  outfitItem?: number
}

export type AxisFilter = { axisId: number; valueId: number }

/** Parses the `axis` search param; malformed entries and duplicate axes are dropped. */
export function parseAxisParam(raw: string | undefined): Array<AxisFilter> {
  if (!raw) return []
  const out: Array<AxisFilter> = []
  for (const part of raw.split(',')) {
    const m = /^(\d+):(\d+)$/.exec(part.trim())
    if (!m) continue
    const axisId = Number(m[1])
    if (out.some((a) => a.axisId === axisId)) continue
    out.push({ axisId, valueId: Number(m[2]) })
  }
  return out
}

export function serializeAxisParam(
  axes: Array<AxisFilter>,
): string | undefined {
  return axes.length > 0
    ? axes.map((a) => `${a.axisId}:${a.valueId}`).join(',')
    : undefined
}

/** Sets (replacing any previous value of the same axis) or clears one axis entry. */
export function withAxisValue(
  raw: string | undefined,
  axisId: number,
  valueId: number | null,
): string | undefined {
  const rest = parseAxisParam(raw).filter((a) => a.axisId !== axisId)
  if (valueId != null) rest.push({ axisId, valueId })
  return serializeAxisParam(rest)
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
    promptTag: f.promptTag,
    axes: (() => {
      const a = parseAxisParam(f.axis)
      return a.length > 0 ? a : undefined
    })(),
    libraryCharacterId: f.libraryCharacter,
    outfitItemId: f.outfitItem,
  }
}
