import { describe, expect, it } from 'vitest'
import {
  applyBulkPresence,
  countAppearances,
  effectivePresence,
  isPresent,
  parseAppearance,
  parsePresenceSetting,
} from '../scene-characters'

describe('scene-characters', () => {
  it('parses unknown values safely', () => {
    expect(parseAppearance(undefined)).toBe('all')
    expect(parseAppearance('selected')).toBe('selected')
    expect(parsePresenceSetting('x')).toBeNull()
    expect(parsePresenceSetting('replace')).toBe('replace')
  })

  it('resolves default by appearance', () => {
    expect(effectivePresence('all', null)).toBe('on')
    expect(effectivePresence('selected', null)).toBe('off')
    expect(effectivePresence('selected', undefined)).toBe('off')
  })

  it('explicit presence wins over appearance', () => {
    expect(effectivePresence('all', 'off')).toBe('off')
    expect(effectivePresence('selected', 'on')).toBe('on')
    expect(effectivePresence('selected', 'replace')).toBe('replace')
  })

  it('isPresent is false only for off', () => {
    expect(isPresent('all', 'replace')).toBe(true)
    expect(isPresent('all', 'off')).toBe(false)
  })

  it('counts appearances including scenes without override rows', () => {
    expect(countAppearances('all', [null, 'off'], 4)).toBe(3)
    expect(countAppearances('selected', ['on', 'replace', null], 5)).toBe(2)
    expect(countAppearances('selected', [], 5)).toBe(0)
  })

  it('applies bulk choices', () => {
    expect(applyBulkPresence('off', 'keep')).toBe('off')
    expect(applyBulkPresence('off', 'default')).toBeNull()
    expect(applyBulkPresence(null, 'on')).toBe('on')
    expect(applyBulkPresence('replace', 'off')).toBe('off')
  })
})
