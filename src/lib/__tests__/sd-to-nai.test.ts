import { describe, expect, it } from 'vitest'
import { convertSdPrompt, looksLikeSd } from '../sd-to-nai'

const c = (s: string) => convertSdPrompt(s).text

describe('convertSdPrompt', () => {
  it('converts explicit weights', () => {
    expect(c('(abc:1.2)')).toBe('1.2::abc::')
    expect(c('(red hair, blue eyes:1.3)')).toBe('1.3::red hair, blue eyes::')
    expect(c('a, (b:0.8), c')).toBe('a, 0.8::b::, c')
  })
  it('handles spaces and weight 1', () => {
    expect(c('( abc : 1.2 )')).toBe('1.2::abc::')
    expect(c('(abc:1), d')).toBe('abc, d')
  })
  it('converts unweighted emphasis', () => {
    expect(c('(abc)')).toBe('1.1::abc::')
    expect(c('((abc))')).toBe('1.21::abc::')
    expect(c('(((abc)))')).toBe('1.33::abc::')
  })
  it('converts [] as de-emphasis only in SD text', () => {
    expect(c('(a), [b]')).toBe('1.1::a::, 0.91::b::')
    expect(c('[b], c')).toBe('[b], c')
    expect(c('(a), [b|c]')).toBe('1.1::a::, [b|c]')
  })
  it('multiplies nested weights', () => {
    expect(c('((abc:1.2))')).toBe('1.32::abc::')
    expect(c('(a, (b:1.5):1.2)')).toBe('1.2::a::, 1.8::b::')
  })
  it('unescapes parentheses', () => {
    expect(c('ganyu \\(genshin impact\\)')).toBe('ganyu (genshin impact)')
    expect(c('(ganyu \\(genshin impact\\):1.2)')).toBe(
      '1.2::ganyu (genshin impact)::',
    )
  })
  it('removes lora and BREAK', () => {
    expect(c('a, <lora:x:0.8>, b')).toBe('a, b')
    expect(c('a <lyco:y:1> b, (c)')).toBe('a b, 1.1::c::')
    expect(c('a BREAK b')).toBe('a, b')
    expect(c('a,\nBREAK\nb')).toBe('a, b')
    expect(c('a, <lora:x:1>')).toBe('a')
  })
  it('leaves non-SD and NAI syntax alone', () => {
    for (const s of ['1.2::x::, {y}, [z]', 'plain, tags', '@{slot:a}, {b}']) {
      expect(convertSdPrompt(s)).toEqual({ text: s, changed: false })
    }
    expect(c('1.2::x::, (y)')).toBe('1.2::x::, (y)')
  })
  it('keeps @{} tokens', () => {
    expect(c('(@{slot:pose}:1.2), @{bundle:b}')).toBe(
      '1.2::@{slot:pose}::, @{bundle:b}',
    )
  })
  it('returns unchanged when unbalanced', () => {
    expect(convertSdPrompt('(abc')).toEqual({ text: '(abc', changed: false })
    expect(convertSdPrompt('abc)')).toEqual({ text: 'abc)', changed: false })
    expect(convertSdPrompt('a :) (b')).toMatchObject({ changed: false })
  })
  it('handles newlines', () => {
    expect(c('a,\n(b:1.2),\nc')).toBe('a,\n1.2::b::,\nc')
  })
  it('reports changed', () => {
    expect(convertSdPrompt('(a)').changed).toBe(true)
  })
})

describe('looksLikeSd', () => {
  it('detects', () => {
    expect(looksLikeSd('(a:1.2)')).toBe(true)
    expect(looksLikeSd('a \\(b\\)')).toBe(true)
    expect(looksLikeSd('<lora:x:1>')).toBe(true)
    expect(looksLikeSd('a BREAK b')).toBe(true)
    expect(looksLikeSd('1.2::a::, (b)')).toBe(false)
    expect(looksLikeSd('a, b')).toBe(false)
  })
})
