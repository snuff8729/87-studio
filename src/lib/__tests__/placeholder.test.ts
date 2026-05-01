import { describe, expect, it } from 'vitest'
import { extractPlaceholders, resolvePlaceholders } from '../placeholder'

describe('extractPlaceholders', () => {
  it('extracts single placeholder', () => {
    expect(extractPlaceholders('hello @{slot:expression}')).toEqual([
      'expression',
    ])
  })

  it('extracts multiple placeholders', () => {
    const result = extractPlaceholders(
      '@{slot:pose}, @{slot:expression}, @{slot:background}',
    )
    expect(result).toEqual(['pose', 'expression', 'background'])
  })

  it('deduplicates repeated placeholders', () => {
    const result = extractPlaceholders('@{slot:pose} and @{slot:pose}')
    expect(result).toEqual(['pose'])
  })

  it('returns empty array when no placeholders', () => {
    expect(extractPlaceholders('no placeholders here')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractPlaceholders('')).toEqual([])
  })

  it('handles placeholders with underscores', () => {
    expect(extractPlaceholders('@{slot:hair_color}')).toEqual(['hair_color'])
  })

  it('handles placeholders with digits', () => {
    expect(extractPlaceholders('@{slot:slot1} @{slot:slot2}')).toEqual([
      'slot1',
      'slot2',
    ])
  })

  it('ignores malformed placeholders (missing closing)', () => {
    expect(extractPlaceholders('@{slot:open')).toEqual([])
  })

  it('handles placeholders adjacent to text', () => {
    expect(extractPlaceholders('text@{slot:key}more')).toEqual(['key'])
  })

  it('does not match bundle references', () => {
    expect(extractPlaceholders('@{bundle:quality}')).toEqual([])
  })

  it('does not match unprefixed references', () => {
    expect(extractPlaceholders('@{expression}')).toEqual([])
  })
})

describe('resolvePlaceholders', () => {
  it('resolves a single placeholder', () => {
    expect(
      resolvePlaceholders('@{slot:expression}', { expression: 'smiling' }),
    ).toBe('smiling')
  })

  it('resolves multiple placeholders', () => {
    const result = resolvePlaceholders('@{slot:pose}, @{slot:expression}', {
      pose: 'standing',
      expression: 'happy',
    })
    expect(result).toBe('standing, happy')
  })

  it('replaces unmatched placeholders with empty string', () => {
    expect(resolvePlaceholders('@{slot:missing}', {})).toBe('')
  })

  it('preserves surrounding text', () => {
    expect(
      resolvePlaceholders('1girl, @{slot:pose}, best quality', {
        pose: 'sitting',
      }),
    ).toBe('1girl, sitting, best quality')
  })

  it('resolves same placeholder multiple times', () => {
    expect(
      resolvePlaceholders('@{slot:x} and @{slot:x}', { x: 'yes' }),
    ).toBe('yes and yes')
  })

  it('handles empty values', () => {
    expect(resolvePlaceholders('@{slot:a}', { a: '' })).toBe('')
  })

  it('returns original string when no placeholders', () => {
    expect(resolvePlaceholders('no change', { key: 'val' })).toBe('no change')
  })

  it('returns empty string for empty template', () => {
    expect(resolvePlaceholders('', { key: 'val' })).toBe('')
  })

  it('does not resolve bundle references', () => {
    expect(
      resolvePlaceholders('@{bundle:quality}', { quality: 'best' }),
    ).toBe('@{bundle:quality}')
  })
})
