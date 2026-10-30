import { describe, expect, it } from 'vitest'
import {
  parseReservePrefs,
  reserveKey,
  serializeReservePrefs,
} from '../reserve-prefs'

describe('reserve prefs', () => {
  it('is per project', () => {
    expect(reserveKey(3)).toBe('87studio-scene-reserve:3')
  })

  it('round-trips', () => {
    const prefs = { counts: { 4: 2, 9: 0 }, defaultCount: 5 }
    expect(parseReservePrefs(serializeReservePrefs(prefs))).toEqual(prefs)
  })

  it('falls back on missing or corrupt data', () => {
    const empty = { counts: {}, defaultCount: 0 }
    expect(parseReservePrefs(null)).toEqual(empty)
    expect(parseReservePrefs('{nope')).toEqual(empty)
  })

  it('drops invalid entries', () => {
    expect(
      parseReservePrefs(
        '{"counts":{"1":3,"x":2,"2":-1,"3":1.5},"defaultCount":"a"}',
      ),
    ).toEqual({ counts: { 1: 3 }, defaultCount: 0 })
  })
})
