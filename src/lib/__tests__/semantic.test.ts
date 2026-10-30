import { describe, expect, it } from 'vitest'
import {
  buildDocPrompt,
  dequantizeInt8,
  firstSentences,
  indexBaseName,
  isIndexCompatible,
  mockEmbed,
  parseIndexMeta,
  progressStats,
  quantizeInt8,
  queryPrompt,
  topK,
  truncateNormalize,
} from '../semantic'

const norm = (v: ArrayLike<number>) =>
  Math.sqrt(Array.from(v).reduce((a, x) => a + x * x, 0))

describe('prompts', () => {
  it('formats the query prompt', () => {
    expect(queryPrompt('  red ribbon ')).toBe(
      'task: search result | query: red ribbon',
    )
  })
  it('builds a document prompt with category, wiki and aliases', () => {
    const p = buildDocPrompt({
      name: 'hair_ribbon',
      categoryLabel: 'Hair',
      wiki: 'A ribbon tied in the hair. More text.',
      aliases: ['hair_ribbons'],
      otherNames: ['リボン'],
    })
    expect(p.startsWith('title: hair ribbon | text: Hair. ')).toBe(true)
    expect(p).toContain('Also: hair ribbons, リボン.')
  })
  it('caps the document text length', () => {
    const p = buildDocPrompt({
      name: 'x',
      categoryLabel: 'C',
      wiki: 'word '.repeat(500),
    })
    expect(p.length).toBeLessThan(420)
  })
  it('firstSentences cuts at a sentence end', () => {
    const t = 'One two three. Four five six seven eight nine ten eleven.'
    expect(firstSentences(t, 30)).toBe('One two three.')
    expect(firstSentences('short', 30)).toBe('short')
  })
})

describe('vector math', () => {
  it('truncates then L2-normalizes', () => {
    const v = truncateNormalize([3, 4, 100, 100], 2)
    expect(v[0]).toBeCloseTo(0.6, 5)
    expect(v[1]).toBeCloseTo(0.8, 5)
    expect(norm(v)).toBeCloseTo(1, 5)
  })
  it('int8 round-trips within quantization error', () => {
    const v = truncateNormalize([0.3, -0.5, 0.2, 0.7, -0.1], 5)
    const back = dequantizeInt8(quantizeInt8(v))
    for (let i = 0; i < v.length; i++) expect(back[i]).toBeCloseTo(v[i], 1)
    expect(quantizeInt8([2, -2])).toEqual(Int8Array.from([127, -127]))
  })
  it('topK returns descending best rows', () => {
    const dims = 4
    const rows = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0.7, 0.7, 0, 0],
      [-1, 0, 0, 0],
    ].map((r) => quantizeInt8(truncateNormalize(r, dims)))
    const m = new Int8Array(rows.length * dims)
    rows.forEach((r, i) => m.set(r, i * dims))
    const q = truncateNormalize([1, 0.1, 0, 0], dims)
    const top = topK(m, dims, q, 2)
    expect(top.map((t) => t.index)).toEqual([0, 2])
    expect(top[0].score).toBeGreaterThan(top[1].score)
    expect(topK(m, dims, q, 10)).toHaveLength(4)
  })
  it('mock embedder is deterministic and word-overlap sensitive', () => {
    const a = mockEmbed('smiling girl')
    expect(Array.from(a)).toEqual(Array.from(mockEmbed('smiling girl')))
    const dot = (x: Float32Array, y: Float32Array) =>
      x.reduce((s, v, i) => s + v * y[i], 0)
    expect(dot(a, mockEmbed('smile'))).toBeGreaterThan(
      dot(a, mockEmbed('red ribbon')),
    )
  })
})

describe('index meta', () => {
  const meta = {
    version: 1 as const,
    indexVersion: '1',
    model: 'm',
    dtype: 'q8',
    quantization: 'int8' as const,
    dims: 4,
    size: 5000,
    count: 2,
    dbVersion: '1',
    builtAt: 'now',
    sha256: 'abc',
    bytes: 8,
    names: ['a', 'b'],
  }
  const want = { indexVersion: '1', model: 'm', dims: 4, size: 5000 }
  it('parses valid and rejects broken meta', () => {
    expect(parseIndexMeta(meta)).toEqual(meta)
    expect(parseIndexMeta({ ...meta, count: 3 })).toBeNull()
    expect(parseIndexMeta(null)).toBeNull()
  })
  it('checks compatibility', () => {
    expect(isIndexCompatible(meta, want, 8)).toBe(true)
    expect(isIndexCompatible(meta, { ...want, size: 20000 }, 8)).toBe(false)
    expect(isIndexCompatible(meta, { ...want, indexVersion: '2' }, 8)).toBe(
      false,
    )
    expect(isIndexCompatible(meta, want, 7)).toBe(false)
  })
  it('names index files', () => {
    expect(indexBaseName('m', 50000, 256)).toBe('tag-index-m-50000-256')
  })
  it('computes progress stats', () => {
    expect(progressStats(100, 300, 10_000)).toEqual({
      docsPerSec: 10,
      etaSec: 20,
    })
    expect(progressStats(0, 300, 0).etaSec).toBeNull()
  })
})
