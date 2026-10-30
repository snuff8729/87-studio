import { describe, expect, it } from 'vitest'
import {
  RAIL_WIDTH_COMPACT,
  RAIL_WIDTH_EXPANDED,
  collapsedPacksKey,
  parseCollapsedPacks,
  parseRailPref,
  railPrefKey,
} from '../scene-rail-prefs'

describe('rail constants', () => {
  it('match the spec widths', () => {
    expect(RAIL_WIDTH_EXPANDED).toBe(216)
    expect(RAIL_WIDTH_COMPACT).toBe(56)
  })
})

describe('railPrefKey', () => {
  it('is namespaced per project', () => {
    expect(railPrefKey(3)).toBe('87studio-scene-rail:3')
  })
})

describe('parseRailPref', () => {
  it('reads the saved choice', () => {
    expect(parseRailPref('expanded')).toBe('expanded')
    expect(parseRailPref('compact')).toBe('compact')
  })

  it('defaults to expanded for missing or invalid values', () => {
    expect(parseRailPref(null)).toBe('expanded')
    expect(parseRailPref('')).toBe('expanded')
    expect(parseRailPref('wide')).toBe('expanded')
    expect(parseRailPref('"compact"')).toBe('expanded')
  })
})

describe('collapsedPacksKey', () => {
  it('is namespaced per project', () => {
    expect(collapsedPacksKey(3)).toBe('87studio-scene-groups-collapsed:3')
  })
})

describe('parseCollapsedPacks', () => {
  it('reads a JSON array of pack ids', () => {
    expect(parseCollapsedPacks('[1,5,9]')).toEqual([1, 5, 9])
  })

  it('drops invalid entries and duplicates', () => {
    expect(parseCollapsedPacks('[1,"2",-3,1.5,null,4,4]')).toEqual([1, 4])
  })

  it('falls back to none for missing or malformed values', () => {
    expect(parseCollapsedPacks(null)).toEqual([])
    expect(parseCollapsedPacks('nope')).toEqual([])
    expect(parseCollapsedPacks('{"a":1}')).toEqual([])
  })
})
