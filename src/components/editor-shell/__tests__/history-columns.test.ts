import { describe, expect, it } from 'vitest'
import {
  HISTORY_GAP,
  HISTORY_MIN_THUMB,
  historyColumns,
} from '../history-columns'

describe('historyColumns', () => {
  it('exposes the layout constants', () => {
    expect(HISTORY_MIN_THUMB).toBe(96)
    expect(HISTORY_GAP).toBe(6)
  })

  it('returns at least one column for tiny widths', () => {
    expect(historyColumns(0)).toBe(1)
    expect(historyColumns(96)).toBe(1)
  })

  it('switches to two columns exactly when two thumbs plus a gap fit', () => {
    expect(historyColumns(197)).toBe(1)
    expect(historyColumns(198)).toBe(2)
    expect(historyColumns(299)).toBe(2)
  })

  it('switches to three columns exactly at 3 * 96 + 2 * 6 = 300', () => {
    // Note: the brief listed 300 -> 2, which contradicts the specified
    // formula; the formula (spec) is authoritative.
    expect(historyColumns(300)).toBe(3)
  })

  it('scales to more columns for wide panels', () => {
    expect(historyColumns(500)).toBe(4)
  })

  it('treats negative and non-finite widths as one column', () => {
    expect(historyColumns(-50)).toBe(1)
    expect(historyColumns(Number.NaN)).toBe(1)
    expect(historyColumns(Number.POSITIVE_INFINITY)).toBe(1)
  })
})
