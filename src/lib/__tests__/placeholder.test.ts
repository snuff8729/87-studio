import { describe, it, expect } from 'vitest'
import { extractPlaceholders, resolvePlaceholders } from '../placeholder'

describe('extractPlaceholders', () => {
  it('extracts single placeholder', () => {
    expect(extractPlaceholders('hello \\\\expression\\\\')).toEqual(['expression'])
  })

  it('extracts multiple placeholders', () => {
    const result = extractPlaceholders('\\\\pose\\\\, \\\\expression\\\\, \\\\background\\\\')
    expect(result).toEqual(['pose', 'expression', 'background'])
  })

  it('deduplicates repeated placeholders', () => {
    const result = extractPlaceholders('\\\\pose\\\\ and \\\\pose\\\\')
    expect(result).toEqual(['pose'])
  })

  it('returns empty array when no placeholders', () => {
    expect(extractPlaceholders('no placeholders here')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractPlaceholders('')).toEqual([])
  })

  it('handles placeholders with underscores', () => {
    expect(extractPlaceholders('\\\\hair_color\\\\')).toEqual(['hair_color'])
  })

  it('handles placeholders with digits', () => {
    expect(extractPlaceholders('\\\\slot1\\\\ \\\\slot2\\\\')).toEqual(['slot1', 'slot2'])
  })

  it('ignores malformed placeholders (missing closing)', () => {
    expect(extractPlaceholders('\\\\open')).toEqual([])
  })

  it('handles placeholders adjacent to text', () => {
    expect(extractPlaceholders('text\\\\key\\\\more')).toEqual(['key'])
  })
})

describe('resolvePlaceholders', () => {
  it('resolves a single placeholder', () => {
    expect(resolvePlaceholders('\\\\expression\\\\', { expression: 'smiling' }))
      .toBe('smiling')
  })

  it('resolves multiple placeholders', () => {
    const result = resolvePlaceholders(
      '\\\\pose\\\\, \\\\expression\\\\',
      { pose: 'standing', expression: 'happy' },
    )
    expect(result).toBe('standing, happy')
  })

  it('replaces unmatched placeholders with empty string', () => {
    expect(resolvePlaceholders('\\\\missing\\\\', {})).toBe('')
  })

  it('preserves surrounding text', () => {
    expect(resolvePlaceholders('1girl, \\\\pose\\\\, best quality', { pose: 'sitting' }))
      .toBe('1girl, sitting, best quality')
  })

  it('resolves same placeholder multiple times', () => {
    expect(resolvePlaceholders('\\\\x\\\\ and \\\\x\\\\', { x: 'yes' }))
      .toBe('yes and yes')
  })

  it('handles empty values', () => {
    expect(resolvePlaceholders('\\\\a\\\\', { a: '' })).toBe('')
  })

  it('returns original string when no placeholders', () => {
    expect(resolvePlaceholders('no change', { key: 'val' })).toBe('no change')
  })

  it('returns empty string for empty template', () => {
    expect(resolvePlaceholders('', { key: 'val' })).toBe('')
  })
})
