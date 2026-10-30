import { describe, expect, it } from 'vitest'
import {
  isNameTaken,
  moveAvailability,
  swapNeighbor,
  uniqueSuffixedName,
} from '../project-packs'

describe('isNameTaken', () => {
  it('compares trimmed and case-insensitive', () => {
    expect(isNameTaken(' Smile ', ['smile'])).toBe(true)
    expect(isNameTaken('Sad', ['smile'])).toBe(false)
    expect(isNameTaken('x', [])).toBe(false)
  })
})

describe('uniqueSuffixedName', () => {
  it('keeps a free name', () => {
    expect(uniqueSuffixedName('Smile', ['Sad'])).toBe('Smile')
  })
  it('appends (2) then (3)', () => {
    expect(uniqueSuffixedName('Smile', ['Smile'])).toBe('Smile (2)')
    expect(uniqueSuffixedName('Smile', ['smile', 'Smile (2)'])).toBe(
      'Smile (3)',
    )
  })
})

describe('swapNeighbor', () => {
  it('swaps with the neighbor', () => {
    expect(swapNeighbor([1, 2, 3], 2, 'up')).toEqual([2, 1, 3])
    expect(swapNeighbor([1, 2, 3], 2, 'down')).toEqual([1, 3, 2])
  })
  it('returns null at edges or for unknown ids', () => {
    expect(swapNeighbor([1, 2, 3], 1, 'up')).toBeNull()
    expect(swapNeighbor([1, 2, 3], 3, 'down')).toBeNull()
    expect(swapNeighbor([1, 2, 3], 9, 'down')).toBeNull()
  })
  it('does not mutate the input', () => {
    const ids = [1, 2]
    swapNeighbor(ids, 1, 'down')
    expect(ids).toEqual([1, 2])
  })
})

describe('moveAvailability', () => {
  it('flags the edges', () => {
    expect(moveAvailability([1, 2, 3], 1)).toEqual({ up: false, down: true })
    expect(moveAvailability([1, 2, 3], 2)).toEqual({ up: true, down: true })
    expect(moveAvailability([1, 2, 3], 3)).toEqual({ up: true, down: false })
    expect(moveAvailability([1], 1)).toEqual({ up: false, down: false })
    expect(moveAvailability([1], 5)).toEqual({ up: false, down: false })
  })
})
