import { describe, expect, it } from 'vitest'
import {
  applyWildcardPicks,
  effectiveMode,
  optionName,
  parseBundleRef,
  parseWildcardOptions,
  pickIndex,
  pickWildcards,
  previewWildcardPrompts,
  resolveBundlesPreview,
  toStoredPicks,
} from '../wildcard'
import type { BundleDef, WildcardEntry } from '../wildcard'

const def = (p: Partial<BundleDef> & { name: string }): BundleDef => ({
  id: 1,
  content: '',
  kind: 'text',
  wildcardMode: 'random',
  ...p,
})

const bundles: Record<string, BundleDef> = {
  expression: def({
    id: 2,
    name: 'expression',
    kind: 'wildcard',
    wildcardMode: 'sequential',
    content: 'smile\n# comment\n\n crying \nangry',
  }),
  'x:seq': def({ id: 3, name: 'x:seq', content: 'literal' }),
  x: def({ id: 4, name: 'x', kind: 'wildcard', content: 'a\nb' }),
  quality: def({ id: 5, name: 'quality', content: 'masterpiece' }),
}
const lookup = (n: string) => bundles[n]

describe('parseWildcardOptions', () => {
  it('ignores blanks and comments, trims lines', () => {
    expect(parseWildcardOptions(bundles.expression.content)).toEqual([
      'smile',
      'crying',
      'angry',
    ])
  })
  it('handles CRLF and empty content', () => {
    expect(parseWildcardOptions('a\r\nb\r\n')).toEqual(['a', 'b'])
    expect(parseWildcardOptions('')).toEqual([])
  })
})

describe('parseBundleRef', () => {
  it('uses the default mode without a suffix', () => {
    const ref = parseBundleRef('expression', lookup)!
    expect(effectiveMode(ref)).toBe('sequential')
  })
  it('accepts random / seq / sequential overrides', () => {
    expect(effectiveMode(parseBundleRef('expression:random', lookup)!)).toBe(
      'random',
    )
    expect(effectiveMode(parseBundleRef('expression:seq', lookup)!)).toBe(
      'sequential',
    )
    expect(
      effectiveMode(parseBundleRef('expression:sequential', lookup)!),
    ).toBe('sequential')
  })
  it('exact name wins over a mode suffix', () => {
    const ref = parseBundleRef('x:seq', lookup)!
    expect(ref.bundle.id).toBe(3)
    expect(ref.override).toBeUndefined()
  })
  it('ignores the suffix for text bundles (still a plain ref)', () => {
    const ref = parseBundleRef('quality:seq', lookup)!
    expect(ref.bundle.kind).toBe('text')
  })
  it('returns null for unknown bundles / unknown suffix', () => {
    expect(parseBundleRef('nope', lookup)).toBeNull()
    expect(parseBundleRef('expression:foo', lookup)).toBeNull()
  })
})

describe('pickIndex', () => {
  it('sequential wraps by image index', () => {
    expect([0, 1, 2, 3, 4].map((i) => pickIndex(3, 'sequential', i))).toEqual([
      0, 1, 2, 0, 1,
    ])
  })
  it('random uses rng uniformly and stays in range', () => {
    expect(pickIndex(3, 'random', 0, () => 0)).toBe(0)
    expect(pickIndex(3, 'random', 0, () => 0.5)).toBe(1)
    expect(pickIndex(3, 'random', 0, () => 0.999999)).toBe(2)
    expect(pickIndex(3, 'random', 0, () => 1)).toBe(2)
  })
  it('empty list gives -1', () => {
    expect(pickIndex(0, 'random', 0)).toBe(-1)
  })
})

const entries: Array<WildcardEntry> = [
  {
    id: 0,
    bundleId: 2,
    bundle: 'expression',
    mode: 'sequential',
    options: ['smile', 'crying', 'angry'],
  },
  {
    id: 1,
    bundleId: 2,
    bundle: 'expression',
    mode: 'sequential',
    options: ['red', 'blue'],
  },
]
const prompts = {
  generalPrompt: '1girl, @{wc:0}',
  negativePrompt: '',
  characterPrompts: [{ prompt: '@{wc:1} hair', negative: '@{wc:0}' }],
  wildcards: entries,
}

describe('picks and application', () => {
  it('sequential entries advance together', () => {
    const picks = pickWildcards(entries, 4)
    expect(picks.map((p) => p.option)).toEqual(['crying', 'red'])
    const out = applyWildcardPicks(prompts, picks)
    expect(out.generalPrompt).toBe('1girl, crying')
    expect(out.characterPrompts[0]).toEqual({
      prompt: 'red hair',
      negative: 'crying',
    })
    expect('wildcards' in out).toBe(false)
  })
  it('returns the same object when there are no wildcards', () => {
    const plain = { ...prompts, wildcards: undefined }
    expect(applyWildcardPicks(plain, [])).toBe(plain)
  })
  it('stored picks drop the marker id', () => {
    expect(toStoredPicks(pickWildcards(entries, 0))[0]).toEqual({
      bundle: 'expression',
      mode: 'sequential',
      option: 'smile',
      index: 0,
    })
  })
  it('previews readable lists', () => {
    const out = previewWildcardPrompts(prompts)
    expect(out.generalPrompt).toBe('1girl, {seq: smile | crying | angry}')
    expect(
      previewWildcardPrompts({
        ...prompts,
        wildcards: [{ ...entries[0], mode: 'random' }, entries[1]],
      }).generalPrompt,
    ).toBe('1girl, {smile | crying | angry}')
  })
})

describe('resolveBundlesPreview', () => {
  it('inlines text bundles and previews wildcards', () => {
    expect(
      resolveBundlesPreview(
        '@{bundle:quality}, @{bundle:expression:random}, @{bundle:nope}',
        lookup,
      ),
    ).toBe('masterpiece, {smile | crying | angry}, ')
  })
})

describe('fixed option', () => {
  const groups: Record<string, BundleDef> = {
    ...bundles,
    smile: def({ id: 10, name: 'smile', content: 'smile, closed eyes' }),
    cry: def({ id: 11, name: 'cry', content: 'crying, tears' }),
    mood: def({
      id: 12,
      name: 'mood',
      kind: 'wildcard',
      content: '@{bundle:smile}\n@{bundle:cry}\nangry, red face',
    }),
  }
  const look = (n: string) => groups[n]

  it('matches an option by text (case-insensitive)', () => {
    const ref = parseBundleRef('expression:ANGRY', look)!
    expect(ref.fixed).toEqual({ index: 2, option: 'angry' })
    expect(effectiveMode(ref)).toBe('fixed')
  })
  it('a line that is a bundle ref is named after the bundle', () => {
    expect(optionName('@{bundle:smile}')).toBe('smile')
    expect(parseBundleRef('mood:cry', look)!.fixed).toEqual({
      index: 1,
      option: '@{bundle:cry}',
    })
    expect(parseBundleRef('mood:angry, red face', look)!.fixed?.index).toBe(2)
  })
  it('no number syntax; unknown option is unresolved', () => {
    expect(parseBundleRef('expression:2', look)).toBeNull()
    expect(parseBundleRef('expression:nope', look)).toBeNull()
  })
  it('mode keyword beats option, exact name beats both', () => {
    const g: Record<string, BundleDef> = {
      ...groups,
      w: def({ id: 20, name: 'w', kind: 'wildcard', content: 'seq\nb' }),
      'w:b': def({ id: 21, name: 'w:b', content: 'exact' }),
    }
    const l = (n: string) => g[n]
    expect(parseBundleRef('w:seq', l)!.override).toBe('sequential')
    expect(parseBundleRef('w:b', l)!.bundle.id).toBe(21)
  })
  it('fixed picks always return the chosen option', () => {
    const picks = pickWildcards(
      [
        {
          id: 0,
          bundleId: 2,
          bundle: 'expression',
          mode: 'fixed',
          options: ['angry'],
          fixedIndex: 2,
        },
      ],
      7,
    )
    expect(picks[0]).toMatchObject({ mode: 'fixed', option: 'angry', index: 2 })
  })
  it('preview expands bundle-ref lines one level', () => {
    expect(resolveBundlesPreview('@{bundle:mood}', look)).toBe(
      '{smile, closed eyes | crying, tears | angry, red face}',
    )
    expect(resolveBundlesPreview('@{bundle:mood:cry}', look)).toBe(
      'crying, tears',
    )
  })
})
