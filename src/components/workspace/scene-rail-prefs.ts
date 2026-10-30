/** Rail width chosen with the header toggle (persisted per project). */
export type RailPref = 'expanded' | 'compact'

export const RAIL_WIDTH_EXPANDED = 216
export const RAIL_WIDTH_COMPACT = 56

export function railPrefKey(projectId: number): string {
  return `87studio-scene-rail:${projectId}`
}

/** Missing or invalid values fall back to the expanded default. */
export function parseRailPref(raw: string | null): RailPref {
  return raw === 'compact' ? 'compact' : 'expanded'
}

/** Collapsed pack groups (shared by the rail, the board and the sheet). */
export function collapsedPacksKey(projectId: number): string {
  return `87studio-scene-groups-collapsed:${projectId}`
}

export function parseCollapsedPacks(raw: string | null): Array<number> {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const ids = value.filter(
    (v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0,
  )
  return [...new Set(ids)]
}
