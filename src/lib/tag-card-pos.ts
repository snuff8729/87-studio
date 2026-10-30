/** Pure helpers for the draggable tag info card position. */

export interface CardPos {
  x: number
  y: number
}

const MARGIN = 4

/** Keep a card of size w*h inside the viewport (never above/left of 4px). */
export function clampCardPos(
  pos: CardPos,
  size: { w: number; h: number },
  viewport: { w: number; h: number },
): CardPos {
  const maxX = Math.max(MARGIN, viewport.w - size.w - MARGIN)
  const maxY = Math.max(MARGIN, viewport.h - size.h - MARGIN)
  return {
    x: Math.min(Math.max(MARGIN, Math.round(pos.x)), maxX),
    y: Math.min(Math.max(MARGIN, Math.round(pos.y)), maxY),
  }
}

/** Parse the persisted position; null for anything malformed. */
export function parseStoredPos(raw: string | null): CardPos | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { x?: unknown; y?: unknown }
    if (
      typeof v.x === 'number' &&
      typeof v.y === 'number' &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y)
    ) {
      return { x: v.x, y: v.y }
    }
  } catch {
    /* ignore */
  }
  return null
}
