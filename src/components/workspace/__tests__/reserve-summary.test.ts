import { describe, expect, it } from 'vitest'
import { reserveSummary } from '../reserve-summary'

describe('reserveSummary', () => {
  it('returns zeros for no scenes', () => {
    expect(reserveSummary([], {}, 3)).toEqual({ scenes: 0, images: 0 })
  })

  it('uses per-scene counts with the default as fallback', () => {
    expect(reserveSummary([1, 2, 3], { 1: 3, 2: 0 }, 2)).toEqual({
      scenes: 2,
      images: 5,
    })
  })

  it('returns zeros when default is 0 and no counts are set', () => {
    expect(reserveSummary([1, 2, 3], {}, 0)).toEqual({ scenes: 0, images: 0 })
  })

  it('ignores counts for scenes not in the list', () => {
    expect(reserveSummary([1], { 1: 1, 99: 10 }, 0)).toEqual({
      scenes: 1,
      images: 1,
    })
  })
})
