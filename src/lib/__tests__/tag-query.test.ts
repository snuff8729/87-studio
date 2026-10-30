import { describe, expect, it } from 'vitest'
import {
  allowsSubstring,
  extractTagQuery,
  formatCount,
  normalizeTagQuery,
  planTagInsert,
  rankSuggestions,
} from '../tag-query'
import type { TagCandidate } from '../tag-query'

describe('normalizeTagQuery', () => {
  it('strips weight syntax and escapes', () => {
    expect(normalizeTagQuery('1.2::Long Hair::')).toBe('long_hair')
    expect(normalizeTagQuery('{blue eyes}')).toBe('blue_eyes')
    expect(normalizeTagQuery('[smile]')).toBe('smile')
    expect(normalizeTagQuery('miku \\(vocaloid\\)')).toBe('miku_(vocaloid)')
    expect(normalizeTagQuery('  Long   Hair ')).toBe('long_hair')
  })
})

describe('extractTagQuery', () => {
  it('uses the text after the last comma', () => {
    const r = extractTagQuery('1girl, long ha')
    expect(r?.query).toBe('long_ha')
    expect(r?.from).toBe('1girl, '.length)
  })

  it('skips a leading weight and brackets', () => {
    const doc = 'a, 1.2::long ha'
    const r = extractTagQuery(doc)
    expect(r?.query).toBe('long_ha')
    expect(doc.slice(r!.from)).toBe('long ha')
    expect(extractTagQuery('{{blu')?.query).toBe('blu')
  })

  it('returns null for short, @{ and closed fragments', () => {
    expect(extractTagQuery('a')).toBeNull()
    expect(extractTagQuery('x, @{slot:ab')).toBeNull()
    expect(extractTagQuery('tag}')).toBeNull()
  })
})

describe('rankSuggestions', () => {
  const c = (
    name: string,
    kind: TagCandidate['kind'],
    postCount: number,
  ): TagCandidate => ({ name, kind, postCount, category: 0 })

  it('orders exact > alias exact > prefix > alias prefix > substring, then by count', () => {
    const out = rankSuggestions([
      c('sub', 'substring', 900),
      c('alias_p', 'alias_prefix', 800),
      c('pre_small', 'prefix', 10),
      c('pre_big', 'prefix', 500),
      c('alias_e', 'alias_exact', 5),
      c('exact', 'exact', 1),
    ])
    expect(out.map((x) => x.name)).toEqual([
      'exact',
      'alias_e',
      'pre_big',
      'pre_small',
      'alias_p',
      'sub',
    ])
  })

  it('dedupes keeping the best kind and applies the limit', () => {
    const out = rankSuggestions(
      [c('a', 'substring', 5), c('a', 'prefix', 5), c('b', 'prefix', 1)],
      1,
    )
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('prefix')
  })
})

describe('misc', () => {
  it('formats counts', () => {
    expect(formatCount(950)).toBe('950')
    expect(formatCount(12_345)).toBe('12.3k')
    expect(formatCount(1_234_567)).toBe('1.2M')
  })

  it('substring threshold differs for ASCII and non-ASCII', () => {
    expect(allowsSubstring('ha')).toBe(false)
    expect(allowsSubstring('hai')).toBe(true)
    expect(allowsSubstring('笑い')).toBe(true)
    expect(allowsSubstring('笑')).toBe(false)
  })
})

describe('planTagInsert', () => {
  const apply = (doc: string, pos: number | null, tag: string) => {
    const p = planTagInsert(doc, pos, tag)
    return doc.slice(0, p.from) + p.insert + doc.slice(p.to)
  }

  it('appends with a separator', () => {
    expect(apply('1girl, solo', null, 'smile')).toBe('1girl, solo, smile')
    expect(apply('1girl, solo,', null, 'smile')).toBe('1girl, solo, smile')
    expect(apply('', null, 'smile')).toBe('smile')
  })

  it('inserts at the cursor without double commas', () => {
    expect(apply('1girl, solo', 5, 'smile')).toBe('1girl, smile, solo')
    expect(apply('a, b', 1, 'x')).toBe('a, x, b')
    expect(apply('a b', 1, 'x')).toBe('a, x, b')
  })

  it('reports the caret position after the tag', () => {
    const p = planTagInsert('a', null, 'bc')
    expect(p.cursor).toBe('a, bc'.length)
  })
})
