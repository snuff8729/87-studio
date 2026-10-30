import { describe, expect, it } from 'vitest'
import {
  applyOverride,
  cellLabel,
  parsePositionSpec,
  resolveCharacterPositions,
  roundCoord,
  snapToGrid,
} from '../character-positions'
import type { PositionSpec } from '../character-positions'

function seeded(values: Array<number>) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('resolveCharacterPositions', () => {
  it('all ai keeps today payload (no coords, centered)', () => {
    expect(resolveCharacterPositions([{ mode: 'ai' }, { mode: 'ai' }])).toEqual(
      {
        useCoords: false,
        centers: [
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.5 },
        ],
      },
    )
    expect(resolveCharacterPositions([])).toEqual({
      useCoords: false,
      centers: [],
    })
  })

  it('fixed uses its rounded coordinates, ai is ring placed', () => {
    const r = resolveCharacterPositions([
      { mode: 'fixed', x: 0.30049, y: 0.5 },
      { mode: 'ai' },
      { mode: 'ai' },
    ])
    expect(r.useCoords).toBe(true)
    expect(r.centers[0]).toEqual({ x: 0.3, y: 0.5 })
    expect(r.centers[1]).toEqual({ x: 0.5, y: 0.5 })
    expect(r.centers[2]).toEqual({ x: 0.7, y: 0.5 })
  })

  it('random stays in [0.1, 0.9] with 3 decimals', () => {
    const r = resolveCharacterPositions(
      [{ mode: 'random' }],
      seeded([0, 1, 0.123456, 0.987654]),
    )
    expect(r.useCoords).toBe(true)
    for (const c of r.centers) {
      expect(c.x).toBeGreaterThanOrEqual(0.1)
      expect(c.x).toBeLessThanOrEqual(0.9)
      expect(Math.round(c.y * 1000) / 1000).toBe(c.y)
    }
  })

  it('random keeps min distance from others, retrying up to 5 times', () => {
    const specs: Array<PositionSpec> = [
      { mode: 'fixed', x: 0.5, y: 0.5 },
      { mode: 'random' },
    ]
    // first try lands on the fixed point, second try is far away
    const r = resolveCharacterPositions(specs, seeded([0.5, 0.5, 0, 0]))
    expect(r.centers[1]).toEqual({ x: 0.1, y: 0.1 })
    // always colliding: keeps the last attempt
    const stuck = resolveCharacterPositions(specs, () => 0.5)
    expect(stuck.centers[1]).toEqual({ x: 0.5, y: 0.5 })
  })

  it('random differs between calls with a real rng', () => {
    const a = resolveCharacterPositions([{ mode: 'random' }])
    const b = resolveCharacterPositions([{ mode: 'random' }])
    expect(a.centers[0]).not.toEqual(b.centers[0])
  })
})

describe('helpers', () => {
  it('roundCoord clamps and rounds', () => {
    expect(roundCoord(1.4)).toBe(1)
    expect(roundCoord(-1)).toBe(0)
    expect(roundCoord(0.12349)).toBe(0.123)
  })
  it('parsePositionSpec handles json, invalid, inherit', () => {
    expect(parsePositionSpec(null)).toBeNull()
    expect(parsePositionSpec('nope')).toBeNull()
    expect(parsePositionSpec('{"mode":"fixed","x":2,"y":0.25}')).toEqual({
      mode: 'fixed',
      x: 1,
      y: 0.25,
    })
    expect(parsePositionSpec({ mode: 'inherit' })).toBeNull()
    expect(parsePositionSpec({ mode: 'inherit' }, true)).toEqual({
      mode: 'inherit',
    })
  })
  it('applyOverride inherits or replaces', () => {
    const base: PositionSpec = { mode: 'fixed', x: 0.1, y: 0.2 }
    expect(applyOverride(base, null)).toEqual(base)
    expect(applyOverride(base, { mode: 'inherit' })).toEqual(base)
    expect(applyOverride(base, { mode: 'random' })).toEqual({ mode: 'random' })
    expect(applyOverride(null, null)).toEqual({ mode: 'ai' })
  })
  it('cellLabel and snapToGrid', () => {
    expect(cellLabel(0.3, 0.5)).toBe('B3')
    expect(cellLabel(1, 1)).toBe('E5')
    expect(cellLabel(0, 0)).toBe('A1')
    expect(snapToGrid(0.33)).toBe(0.3)
    expect(snapToGrid(1)).toBe(0.9)
  })
})
