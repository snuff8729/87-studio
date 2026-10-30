/** Minimum thumbnail edge (px) in the history strip. */
export const HISTORY_MIN_THUMB = 96
/** Gap (px) between history thumbnails. */
export const HISTORY_GAP = 6

/**
 * Number of thumbnail columns that fit into a history panel of `width` px.
 * Always at least 1; non-finite or negative widths yield 1.
 */
export function historyColumns(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  return Math.max(
    1,
    Math.floor((width + HISTORY_GAP) / (HISTORY_MIN_THUMB + HISTORY_GAP)),
  )
}
