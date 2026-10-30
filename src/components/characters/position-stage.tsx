import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  GRID_STEPS,
  cellLabel,
  roundCoord,
  snapToGrid,
} from '@/lib/character-positions'

export interface StageDot {
  id: string | number
  /** Number shown in the dot (1-based) */
  index: number
  name: string
  x: number
  y: number
  draggable: boolean
}

const SNAP_KEY = '87studio-position-snap'

/** "Snap to grid" preference shared by all pickers (localStorage) */
export function usePositionSnap(): [boolean, (v: boolean) => void] {
  const [snap, setSnap] = useState(false)
  useEffect(() => {
    try {
      setSnap(localStorage.getItem(SNAP_KEY) === '1')
    } catch {
      // storage unavailable: stay off
    }
  }, [])
  function update(v: boolean) {
    setSnap(v)
    try {
      localStorage.setItem(SNAP_KEY, v ? '1' : '0')
    } catch {
      // ignore
    }
  }
  return [snap, update]
}

export function formatPoint(x: number, y: number): string {
  return `${cellLabel(x, y)} · (${x.toFixed(2)}, ${y.toFixed(2)})`
}

/**
 * Canvas at the generation aspect ratio with numbered dots. Pointer (mouse +
 * touch) drag, arrow keys on a focused dot (0.01, Shift 0.1; a grid cell when
 * snapping). Clicking the canvas moves the active draggable dot there.
 */
export function PositionStage({
  aspect,
  dots,
  activeId,
  snap,
  onMove,
  onActivate,
  className,
}: {
  aspect: number
  dots: Array<StageDot>
  activeId?: string | number | null
  snap: boolean
  onMove: (id: string | number, x: number, y: number) => void
  onActivate?: (id: string | number) => void
  className?: string
}) {
  const { t } = useTranslation()
  const stageRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<string | number | null>(null)

  function pointFromEvent(e: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    let x = (e.clientX - rect.left) / rect.width
    let y = (e.clientY - rect.top) / rect.height
    if (snap) {
      x = snapToGrid(x)
      y = snapToGrid(y)
    }
    return { x: roundCoord(x), y: roundCoord(y) }
  }

  function handleStagePointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.grid)
      return
    const target =
      dots.find((d) => d.id === activeId && d.draggable) ??
      (dots.filter((d) => d.draggable).length === 1
        ? dots.find((d) => d.draggable)
        : undefined)
    if (!target) return
    const p = pointFromEvent(e)
    if (p) onMove(target.id, p.x, p.y)
    onActivate?.(target.id)
  }

  function handleDotPointerDown(e: React.PointerEvent, dot: StageDot) {
    onActivate?.(dot.id)
    if (!dot.draggable) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragIdRef.current = dot.id
  }

  function handleDotPointerMove(e: React.PointerEvent, dot: StageDot) {
    if (dragIdRef.current !== dot.id) return
    const p = pointFromEvent(e)
    if (p) onMove(dot.id, p.x, p.y)
  }

  function handleDotPointerUp(e: React.PointerEvent) {
    dragIdRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function handleDotKeyDown(e: React.KeyboardEvent, dot: StageDot) {
    if (!dot.draggable) return
    const dir = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key]
    if (!dir) return
    e.preventDefault()
    let x: number
    let y: number
    if (snap) {
      const step = (v: number, d: number) => {
        const cur = GRID_STEPS.findIndex((g) => g === snapToGrid(v))
        return GRID_STEPS[Math.min(4, Math.max(0, cur + d))]
      }
      x = step(dot.x, dir[0])
      y = step(dot.y, dir[1])
    } else {
      const amount = e.shiftKey ? 0.1 : 0.01
      x = roundCoord(dot.x + dir[0] * amount)
      y = roundCoord(dot.y + dir[1] * amount)
    }
    onMove(dot.id, x, y)
  }

  return (
    <div
      className={cn('flex justify-center', className)}
      data-position-stage-wrap
    >
      <div
        ref={stageRef}
        data-position-stage
        role="group"
        aria-label={t('positions.stageLabel')}
        onPointerDown={handleStagePointerDown}
        className="relative touch-none select-none overflow-hidden rounded-md border border-border bg-secondary/40"
        style={{
          aspectRatio: String(aspect),
          width: `min(100%, ${(240 * aspect).toFixed(1)}px)`,
        }}
      >
        {/* 5x5 grid: cell lines + A-E / 1-5 labels */}
        {[1, 2, 3, 4].map((i) => (
          <div key={`v${i}`}>
            <div
              data-grid="1"
              className="pointer-events-none absolute inset-y-0 w-px bg-border/60"
              style={{ left: `${i * 20}%` }}
            />
            <div
              data-grid="1"
              className="pointer-events-none absolute inset-x-0 h-px bg-border/60"
              style={{ top: `${i * 20}%` }}
            />
          </div>
        ))}
        {'ABCDE'.split('').map((c, i) => (
          <span
            key={c}
            className="pointer-events-none absolute top-0.5 -translate-x-1/2 text-[9px] leading-none text-muted-foreground/60"
            style={{ left: `${i * 20 + 10}%` }}
          >
            {c}
          </span>
        ))}
        {[1, 2, 3, 4, 5].map((n, i) => (
          <span
            key={n}
            className="pointer-events-none absolute left-1 -translate-y-1/2 text-[9px] leading-none text-muted-foreground/60"
            style={{ top: `${i * 20 + 10}%` }}
          >
            {n}
          </span>
        ))}

        {dots.map((dot) => (
          <button
            key={dot.id}
            type="button"
            data-position-dot={dot.index}
            data-draggable={dot.draggable ? '1' : '0'}
            aria-label={t('positions.dotLabel', {
              name: dot.name,
              position: formatPoint(dot.x, dot.y),
            })}
            onPointerDown={(e) => handleDotPointerDown(e, dot)}
            onPointerMove={(e) => handleDotPointerMove(e, dot)}
            onPointerUp={handleDotPointerUp}
            onPointerCancel={handleDotPointerUp}
            onKeyDown={(e) => handleDotKeyDown(e, dot)}
            className={cn(
              'absolute grid size-7 -translate-x-1/2 -translate-y-1/2 touch-none place-content-center rounded-full border-2 text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
              dot.draggable
                ? 'cursor-grab border-primary bg-primary text-primary-foreground active:cursor-grabbing'
                : 'cursor-default border-muted-foreground/60 bg-background/80 text-muted-foreground',
              dot.id === activeId && 'ring-2 ring-primary/50',
            )}
            style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
          >
            {dot.index}
          </button>
        ))}
      </div>
    </div>
  )
}
