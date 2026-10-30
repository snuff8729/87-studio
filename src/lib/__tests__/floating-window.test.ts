import { describe, expect, it } from 'vitest'
import {
  MIN_H,
  MIN_W,
  clampRect,
  defaultRect,
  parseRect,
} from '../floating-window'

describe('floating window geometry', () => {
  it('default is bottom-right ~440x560', () => {
    expect(defaultRect(1440, 900)).toEqual({ x: 984, y: 324, w: 440, h: 560 })
  })

  it('default shrinks to fit small viewports', () => {
    const r = defaultRect(390, 700)
    expect(r.w).toBeLessThanOrEqual(390)
    expect(r.x).toBeGreaterThanOrEqual(0)
  })

  it('clamps position inside the viewport', () => {
    expect(clampRect({ x: -50, y: 2000, w: 400, h: 400 }, 1000, 800)).toEqual({
      x: 0,
      y: 400,
      w: 400,
      h: 400,
    })
    expect(clampRect({ x: 900, y: 0, w: 400, h: 400 }, 1000, 800).x).toBe(600)
  })

  it('enforces min and max size', () => {
    const small = clampRect({ x: 0, y: 0, w: 10, h: 10 }, 1000, 800)
    expect([small.w, small.h]).toEqual([MIN_W, MIN_H])
    const big = clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, 1000, 800)
    expect([big.w, big.h]).toEqual([1000, 800])
  })

  it('parses stored rects defensively', () => {
    expect(parseRect('{"x":1,"y":2,"w":3,"h":4}')).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    })
    expect(parseRect('nope')).toBeNull()
    expect(parseRect('{"x":1}')).toBeNull()
    expect(parseRect(null)).toBeNull()
  })
})
