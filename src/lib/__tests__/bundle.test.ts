import { describe, it, expect } from 'vitest'
import { extractBundleReferences, resolveBundles } from '../bundle'

describe('extractBundleReferences', () => {
  it('extracts single bundle reference', () => {
    expect(extractBundleReferences('use @{quality}')).toEqual(['quality'])
  })

  it('extracts multiple bundle references', () => {
    const result = extractBundleReferences('@{quality}, @{style}')
    expect(result).toEqual(['quality', 'style'])
  })

  it('deduplicates repeated references', () => {
    expect(extractBundleReferences('@{a} and @{a}')).toEqual(['a'])
  })

  it('returns empty array when no references', () => {
    expect(extractBundleReferences('no bundles')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractBundleReferences('')).toEqual([])
  })

  it('handles references with spaces in name', () => {
    expect(extractBundleReferences('@{my bundle}')).toEqual(['my bundle'])
  })

  it('handles references with special characters', () => {
    expect(extractBundleReferences('@{quality-v2}')).toEqual(['quality-v2'])
  })

  it('does not match empty braces', () => {
    expect(extractBundleReferences('@{}')).toEqual([])
  })

  it('handles references adjacent to text', () => {
    expect(extractBundleReferences('prefix@{name}suffix')).toEqual(['name'])
  })
})

describe('resolveBundles', () => {
  it('resolves a single bundle', () => {
    expect(resolveBundles('@{quality}', { quality: 'masterpiece, best quality' }))
      .toBe('masterpiece, best quality')
  })

  it('resolves multiple bundles', () => {
    const result = resolveBundles(
      '@{quality}, @{style}',
      { quality: 'masterpiece', style: 'anime' },
    )
    expect(result).toBe('masterpiece, anime')
  })

  it('replaces unmatched bundles with empty string', () => {
    expect(resolveBundles('@{missing}', {})).toBe('')
  })

  it('preserves surrounding text', () => {
    expect(resolveBundles('1girl, @{pose}, outdoor', { pose: 'standing' }))
      .toBe('1girl, standing, outdoor')
  })

  it('resolves same bundle multiple times', () => {
    expect(resolveBundles('@{x} @{x}', { x: 'val' }))
      .toBe('val val')
  })

  it('returns original string when no bundles', () => {
    expect(resolveBundles('no change', { key: 'val' })).toBe('no change')
  })
})
