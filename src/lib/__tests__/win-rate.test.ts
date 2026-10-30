import { describe, expect, it } from 'vitest'
import { meetsMinWinRate, winRate } from '../win-rate'

describe('winRate', () => {
  it('is null without matches', () => {
    expect(winRate(0, 0)).toBeNull()
  })

  it('computes wins / (wins + losses) in percent', () => {
    expect(winRate(3, 1)).toBe(75)
    expect(winRate(0, 4)).toBe(0)
    expect(winRate(2, 0)).toBe(100)
  })
})

describe('meetsMinWinRate', () => {
  it('excludes images with no matches', () => {
    expect(meetsMinWinRate(0, 0, 50)).toBe(false)
  })

  it('is inclusive at the threshold', () => {
    expect(meetsMinWinRate(1, 1, 50)).toBe(true)
    expect(meetsMinWinRate(3, 2, 60)).toBe(true)
    expect(meetsMinWinRate(3, 2, 70)).toBe(false)
  })
})
