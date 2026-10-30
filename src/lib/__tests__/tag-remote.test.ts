import { describe, expect, it } from 'vitest'
import {
  REMOTE_TTL_MS,
  hasAnyCount,
  isFresh,
  parseCount,
  parseRelatedTags,
} from '../tag-remote'
import { clampCardPos, parseStoredPos } from '../tag-card-pos'

const row = (name: string, cos: number, freq: number, category = 0) => ({
  tag: { name, category, post_count: 100, is_deprecated: false },
  cosine_similarity: cos,
  frequency: freq,
})

describe('parseRelatedTags', () => {
  const json = {
    query: 'long_hair',
    related_tags: [
      row('long_hair', 1, 1),
      row('1girl', 0.63, 0.74),
      row('highres', 0.61, 0.7, 5),
      row('very_long_hair', 0.4, 0.2),
      row('blue_eyes', 0.5, 0.3),
    ],
  }
  it('drops self and meta, sorts by cosine', () => {
    const r = parseRelatedTags(json, 'long_hair', 'cosine')
    expect(r.map((t) => t.name)).toEqual([
      '1girl',
      'blue_eyes',
      'very_long_hair',
    ])
    expect(r[0].score).toBeCloseTo(0.63)
  })
  it('sorts by frequency for used-together', () => {
    const r = parseRelatedTags(json, 'long_hair', 'frequency')
    expect(r.map((t) => t.name)).toEqual([
      '1girl',
      'blue_eyes',
      'very_long_hair',
    ])
  })
  it('respects the limit and tolerates malformed input', () => {
    expect(parseRelatedTags(json, 'x', 'cosine', 2)).toHaveLength(2)
    expect(parseRelatedTags(null, 'x', 'cosine')).toEqual([])
    expect(
      parseRelatedTags({ related_tags: [{}, { tag: {} }] }, 'x', 'cosine'),
    ).toEqual([])
    expect(
      parseRelatedTags({ related_tags: [], tag: null }, 'x', 'cosine'),
    ).toEqual([])
  })
})

describe('parseCount', () => {
  it('reads counts.posts', () => {
    expect(parseCount({ counts: { posts: 1234 } })).toBe(1234)
    expect(parseCount({ counts: { posts: 0 } })).toBe(0)
  })
  it('null when unavailable', () => {
    expect(parseCount({ counts: { posts: null } })).toBeNull()
    expect(parseCount({})).toBeNull()
    expect(parseCount(null)).toBeNull()
  })
  it('hasAnyCount', () => {
    expect(hasAnyCount({ g: null, s: null, q: null, e: null })).toBe(false)
    expect(hasAnyCount({ g: null, s: 0, q: null, e: null })).toBe(true)
  })
})

describe('isFresh (7 day TTL)', () => {
  const now = 1_000_000_000_000
  it('fresh within TTL, stale after', () => {
    expect(isFresh(now - 1000, now)).toBe(true)
    expect(isFresh(now - REMOTE_TTL_MS + 1, now)).toBe(true)
    expect(isFresh(now - REMOTE_TTL_MS, now)).toBe(false)
    expect(isFresh(now - REMOTE_TTL_MS - 1, now)).toBe(false)
  })
  it('rejects future / invalid timestamps', () => {
    expect(isFresh(now + 5000, now)).toBe(false)
    expect(isFresh(Number.NaN, now)).toBe(false)
  })
})

describe('card position', () => {
  it('clamps into the viewport', () => {
    const size = { w: 300, h: 200 }
    const vp = { w: 1000, h: 700 }
    expect(clampCardPos({ x: -50, y: -9 }, size, vp)).toEqual({ x: 4, y: 4 })
    expect(clampCardPos({ x: 900, y: 650 }, size, vp)).toEqual({
      x: 696,
      y: 496,
    })
    expect(clampCardPos({ x: 100.4, y: 120 }, size, vp)).toEqual({
      x: 100,
      y: 120,
    })
  })
  it('card larger than viewport pins to the margin', () => {
    expect(
      clampCardPos({ x: 50, y: 50 }, { w: 500, h: 500 }, { w: 300, h: 300 }),
    ).toEqual({ x: 4, y: 4 })
  })
  it('parseStoredPos', () => {
    expect(parseStoredPos('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 })
    expect(parseStoredPos(null)).toBeNull()
    expect(parseStoredPos('nope')).toBeNull()
    expect(parseStoredPos('{"x":"a","y":1}')).toBeNull()
  })
})
