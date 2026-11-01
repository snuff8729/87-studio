import { describe, expect, it } from 'vitest'
import {
  appendStyleNegative,
  applyStyleToParams,
  detectPromptStyle,
  formatStyleSummary,
  jitterDelay,
  normalizeStyleFollow,
  parseStyleParams,
  pickImageStyle,
  sanitizeStyleParams,
} from '../style-bundles'
import type { StyleInfo } from '../style-bundles'
import type { BundleDef, WildcardEntry } from '../wildcard'

const style = (id: number, name: string, extra: Partial<StyleInfo> = {}) => ({
  bundleId: id,
  name,
  negative: `neg-${name}`,
  params: { width: 1024, height: 1024, steps: 20, scale: 6 },
  ...extra,
})

const wc = (over: Partial<WildcardEntry>): WildcardEntry => ({
  id: 0,
  bundleId: 9,
  bundle: 'wc',
  mode: 'sequential',
  options: ['a', 'b'],
  ...over,
})

describe('normalizeStyleFollow', () => {
  it('treats missing keys as true and only false as off', () => {
    expect(normalizeStyleFollow(undefined)).toEqual({
      resolution: true,
      steps: true,
      scale: true,
      cfgRescale: true,
      sampler: true,
    })
    expect(normalizeStyleFollow({ steps: false, scale: 0 }).steps).toBe(false)
    expect(normalizeStyleFollow({ steps: false, scale: 0 }).scale).toBe(true)
  })
})

describe('pickImageStyle', () => {
  const a = style(1, 'A')
  const b = style(2, 'B')

  it('returns null with no slots', () => {
    expect(pickImageStyle([], [], [])).toBeNull()
  })

  it('first static slot wins', () => {
    const slots = [
      { kind: 'static' as const, style: a },
      { kind: 'static' as const, style: b },
    ]
    expect(pickImageStyle(slots, [], [])).toBe(a)
  })

  it('uses the picked wildcard option style', () => {
    const entries = [wc({ optionStyles: [a, b] })]
    const slots = [{ kind: 'wildcard' as const, wildcardId: 0 }]
    expect(pickImageStyle(slots, entries, [{ id: 0, index: 1 }])).toBe(b)
    expect(pickImageStyle(slots, entries, [{ id: 0, index: 0 }])).toBe(a)
  })

  it('falls through to the next slot when the picked option has no style', () => {
    const entries = [wc({ optionStyles: [a, null] })]
    const slots = [
      { kind: 'wildcard' as const, wildcardId: 0 },
      { kind: 'static' as const, style: b },
    ]
    expect(pickImageStyle(slots, entries, [{ id: 0, index: 0 }])).toBe(a)
    expect(pickImageStyle(slots, entries, [{ id: 0, index: 1 }])).toBe(b)
  })

  it('a fixed wildcard uses its single option', () => {
    const entries = [wc({ mode: 'fixed', options: ['x'], optionStyles: [b] })]
    const slots = [{ kind: 'wildcard' as const, wildcardId: 0 }]
    expect(pickImageStyle(slots, entries, [{ id: 0, index: 5 }])).toBe(b)
  })

  it('static before wildcard wins', () => {
    const entries = [wc({ optionStyles: [b, b] })]
    const slots = [
      { kind: 'static' as const, style: a },
      { kind: 'wildcard' as const, wildcardId: 0 },
    ]
    expect(pickImageStyle(slots, entries, [{ id: 0, index: 0 }])).toBe(a)
  })
})

describe('applyStyleToParams', () => {
  const follow = normalizeStyleFollow(undefined)
  const base = {
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5,
    cfgRescale: 0,
    sampler: 'k_euler',
    scheduler: 'native',
  }

  it('no style leaves params untouched', () => {
    const r = applyStyleToParams(base, null, follow)
    expect(r.parameters).toBe(base)
    expect(r.applied).toEqual([])
  })

  it('overrides only followed items that the style has', () => {
    const s = style(1, 'A', {
      params: { width: 1024, height: 1024, steps: 20, sampler: 'k_dpmpp_2m' },
    })
    const r = applyStyleToParams(base, s, { ...follow, steps: false })
    expect(r.parameters).toMatchObject({
      width: 1024,
      height: 1024,
      steps: 28,
      scale: 5,
      sampler: 'k_dpmpp_2m',
      scheduler: 'native',
    })
    expect(r.applied).toEqual(['resolution', 'sampler'])
  })

  it('random resolution beats the style resolution', () => {
    const r = applyStyleToParams(
      { ...base, randomResolution: true },
      style(1, 'A'),
      follow,
    )
    expect(r.parameters.width).toBe(832)
    expect(r.applied).not.toContain('resolution')
  })

  it('ignores style items without a value', () => {
    const r = applyStyleToParams(base, style(1, 'A', { params: {} }), follow)
    expect(r.parameters).toEqual(base)
    expect(r.applied).toEqual([])
  })
})

describe('appendStyleNegative', () => {
  it('joins with a comma', () => {
    expect(appendStyleNegative('bad hands', style(1, 'A'))).toBe(
      'bad hands, neg-A',
    )
  })
  it('handles empty parts and trailing commas', () => {
    expect(appendStyleNegative('', style(1, 'A'))).toBe('neg-A')
    expect(appendStyleNegative('x,', style(1, 'A'))).toBe('x, neg-A')
    expect(appendStyleNegative('x', style(1, 'A', { negative: ' ' }))).toBe('x')
    expect(appendStyleNegative('x', null)).toBe('x')
  })
})

describe('jitterDelay', () => {
  it('is unchanged when disabled', () => {
    expect(jitterDelay(500, false, () => 0.9)).toBe(500)
  })
  it('spans 0.5x to 1.5x', () => {
    expect(jitterDelay(1000, true, () => 0)).toBe(500)
    expect(jitterDelay(1000, true, () => 0.5)).toBe(1000)
    expect(jitterDelay(1000, true, () => 0.999)).toBe(1499)
  })
  it('stays in range for random inputs', () => {
    for (let i = 0; i < 200; i++) {
      const d = jitterDelay(800, true)
      expect(d).toBeGreaterThanOrEqual(400)
      expect(d).toBeLessThanOrEqual(1200)
    }
  })
})

describe('style params parsing', () => {
  it('sanitizes invalid values', () => {
    expect(
      sanitizeStyleParams({
        width: 832.4,
        steps: 999,
        scale: 'x',
        cfgRescale: 0.456,
        sampler: ' k_euler ',
        scheduler: '',
        extra: 1,
      }),
    ).toEqual({ width: 832, steps: 50, cfgRescale: 0.46, sampler: 'k_euler' })
  })
  it('rounds sizes to multiples of 64 within 64..4096', () => {
    expect(sanitizeStyleParams({ width: 1000, height: 10 })).toEqual({
      width: 1024,
      height: 64,
    })
    expect(sanitizeStyleParams({ width: 99999 }).width).toBe(4096)
  })
  it('parseStyleParams tolerates null / bad JSON', () => {
    expect(parseStyleParams(null)).toEqual({})
    expect(parseStyleParams('{oops')).toEqual({})
    expect(parseStyleParams('{"steps":30}')).toEqual({ steps: 30 })
  })
})

describe('formatStyleSummary', () => {
  it('formats all items', () => {
    expect(
      formatStyleSummary({
        width: 832,
        height: 1216,
        steps: 28,
        scale: 5,
        cfgRescale: 0,
        sampler: 'k_euler_ancestral',
        scheduler: 'karras',
      }),
    ).toBe('832×1216 · 28 steps · CFG 5 · Rescale 0 · Euler a / karras')
  })
  it('omits missing items', () => {
    expect(formatStyleSummary({ steps: 20 })).toBe('20 steps')
    expect(formatStyleSummary({})).toBe('')
  })
})

describe('detectPromptStyle', () => {
  const bundles: Array<BundleDef> = [
    {
      id: 1,
      name: 'S1',
      kind: 'style',
      content: 'artist a',
      wildcardMode: 'random',
      negative: 'n',
      styleParams: { steps: 20 },
    },
    {
      id: 2,
      name: 'S2',
      kind: 'style',
      content: 'artist b',
      wildcardMode: 'random',
      styleParams: { steps: 30 },
    },
    {
      id: 3,
      name: 'T',
      kind: 'text',
      content: 'text',
      wildcardMode: 'random',
    },
    {
      id: 4,
      name: 'W',
      kind: 'wildcard',
      content: '@{bundle:S1}\n@{bundle:S2}',
      wildcardMode: 'sequential',
    },
    {
      id: 5,
      name: 'W2',
      kind: 'wildcard',
      content: 'plain\nother',
      wildcardMode: 'random',
    },
  ]

  it('is null without styles', () => {
    expect(detectPromptStyle('1girl, @{bundle:T}, @{bundle:W2}', bundles)).toBe(
      null,
    )
  })
  it('static style: fixed params', () => {
    expect(detectPromptStyle('1girl, @{bundle:S1}', bundles)).toEqual({
      names: ['S1'],
      perImage: false,
      params: { steps: 20 },
    })
  })
  it('first static in text order provides params', () => {
    const r = detectPromptStyle('@{bundle:S2}, @{bundle:S1}', bundles)
    expect(r?.params).toEqual({ steps: 30 })
    expect(r?.names).toEqual(['S2', 'S1'])
  })
  it('wildcard with style options is per image', () => {
    expect(detectPromptStyle('@{bundle:W}', bundles)).toEqual({
      names: ['S1', 'S2'],
      perImage: true,
      params: null,
    })
  })
})
