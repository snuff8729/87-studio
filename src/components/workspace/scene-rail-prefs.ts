/** Explicit rail width chosen by the user; `null` = follow the width rule. */
export type RailPref = 'expanded' | 'compact' | null

export const RAIL_WIDTH_EXPANDED = 216
export const RAIL_WIDTH_COMPACT = 56
/** Center panel widths below this auto-compact the rail (no explicit choice). */
export const RAIL_AUTO_COMPACT_BELOW = 720

export function railPrefKey(projectId: number): string {
  return `87studio-scene-rail:${projectId}`
}

export function parseRailPref(raw: string | null): RailPref {
  return raw === 'expanded' || raw === 'compact' ? raw : null
}

/** An explicit choice wins; otherwise compact when the center is narrow. */
export function shouldCompact(centerWidth: number, pref: RailPref): boolean {
  return (
    pref === 'compact' ||
    (pref === null && centerWidth < RAIL_AUTO_COMPACT_BELOW)
  )
}
