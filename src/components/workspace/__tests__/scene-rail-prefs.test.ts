import { describe, expect, it } from 'vitest'
import {
  RAIL_AUTO_COMPACT_BELOW,
  RAIL_WIDTH_COMPACT,
  RAIL_WIDTH_EXPANDED,
  collapsedPacksKey,
  parseCollapsedPacks,
  parseRailPref,
  railPrefKey,
  shouldCompact,
} from '../scene-rail-prefs'

describe('rail constants', () => {
  it('match the spec widths', () => {
    expect(RAIL_WIDTH_EXPANDED).toBe(216)
    expect(RAIL_WIDTH_COMPACT).toBe(56)
    expect(RAIL_AUTO_COMPACT_BELOW).toBe(720)
  })
})

describe('railPrefKey', () => {
  it('is namespaced per project', () => {
    expect(railPrefKey(3)).toBe('87studio-scene-rail:3')
  })
})

describe('parseRailPref', () => {
  it('reads explicit choices', () => {
    expect(parseRailPref('expanded')).toBe('expanded')
    expect(parseRailPref('compact')).toBe('compact')
  })

  it('treats missing or invalid values as no choice', () => {
    expect(parseRailPref(null)).toBeNull()
    expect(parseRailPref('')).toBeNull()
    expect(parseRailPref('wide')).toBeNull()
    expect(parseRailPref('"compact"')).toBeNull()
    expect(parseRailPref('null')).toBeNull()
  })
})

describe('shouldCompact', () => {
  it('auto-compacts below 720px when there is no explicit choice', () => {
    expect(shouldCompact(719, null)).toBe(true)
    expect(shouldCompact(720, null)).toBe(false)
    expect(shouldCompact(1600, null)).toBe(false)
  })

  it('lets an explicit choice win over the width rule', () => {
    expect(shouldCompact(300, 'expanded')).toBe(false)
    expect(shouldCompact(2000, 'compact')).toBe(true)
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
