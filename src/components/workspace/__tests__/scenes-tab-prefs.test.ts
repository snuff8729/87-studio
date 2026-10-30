import { describe, expect, it } from 'vitest'
import {
  SCENES_TAB_PREFS_DEFAULT,
  parseScenesTabPrefs,
  scenesTabPrefsKey,
} from '../scenes-tab-prefs'

describe('scenesTabPrefsKey', () => {
  it('is namespaced per project', () => {
    expect(scenesTabPrefsKey(7)).toBe('87studio-scenes-tab:7')
  })
})

describe('parseScenesTabPrefs', () => {
  it('falls back to defaults for missing or malformed values', () => {
    expect(parseScenesTabPrefs(null)).toEqual(SCENES_TAB_PREFS_DEFAULT)
    expect(parseScenesTabPrefs('not json')).toEqual(SCENES_TAB_PREFS_DEFAULT)
    expect(parseScenesTabPrefs('[]')).toEqual(SCENES_TAB_PREFS_DEFAULT)
  })

  it('reads valid values', () => {
    expect(parseScenesTabPrefs('{"view":"cards","size":"lg"}')).toEqual({
      view: 'cards',
      size: 'lg',
    })
  })

  it('replaces invalid fields individually', () => {
    expect(parseScenesTabPrefs('{"view":"grid","size":"sm"}')).toEqual({
      view: SCENES_TAB_PREFS_DEFAULT.view,
      size: 'sm',
    })
  })
})
