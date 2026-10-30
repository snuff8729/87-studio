/** Geometry helpers for the floating Tag Search window (pure). */

export interface WindowRect {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_W = 320
export const MIN_H = 360
const DEFAULT_W = 440
const DEFAULT_H = 560
const MARGIN = 16

/** Keep the rect inside the viewport (size first, then position). */
export function clampRect(r: WindowRect, vw: number, vh: number): WindowRect {
  const w = Math.round(Math.min(Math.max(r.w, Math.min(MIN_W, vw)), vw))
  const h = Math.round(Math.min(Math.max(r.h, Math.min(MIN_H, vh)), vh))
  const x = Math.round(Math.min(Math.max(r.x, 0), Math.max(vw - w, 0)))
  const y = Math.round(Math.min(Math.max(r.y, 0), Math.max(vh - h, 0)))
  return { x, y, w, h }
}

/** Bottom-right default (~440x560), clamped for small viewports. */
export function defaultRect(vw: number, vh: number): WindowRect {
  const w = Math.min(DEFAULT_W, vw - MARGIN * 2)
  const h = Math.min(DEFAULT_H, vh - MARGIN * 2)
  return clampRect({ x: vw - w - MARGIN, y: vh - h - MARGIN, w, h }, vw, vh)
}

export function parseRect(json: string | null): WindowRect | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Partial<WindowRect>
    if (
      [v.x, v.y, v.w, v.h].every(
        (n) => typeof n === 'number' && Number.isFinite(n),
      )
    ) {
      return v as WindowRect
    }
  } catch {
    /* ignore */
  }
  return null
}
