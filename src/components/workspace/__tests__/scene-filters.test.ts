import { describe, expect, it } from 'vitest'
import { countByFilter, filterScenes } from '../scene-filters'

const scenes = [
  { id: 1, name: 'Smile', imageCount: 3 },
  { id: 2, name: 'Sad face', imageCount: 0 },
  { id: 3, name: 'Wave Hello', imageCount: 0 },
  { id: 4, name: 'angry', imageCount: 7 },
]

const ids = (list: Array<{ id: number }>) => list.map((s) => s.id)

describe('filterScenes', () => {
  it('returns everything for an empty query and the "all" filter', () => {
    expect(
      ids(filterScenes(scenes, { query: '', filter: 'all' }, {}, 0)),
    ).toEqual([1, 2, 3, 4])
    expect(
      ids(filterScenes(scenes, { query: '   ', filter: 'all' }, {}, 0)),
    ).toEqual([1, 2, 3, 4])
  })

  it('matches the query case-insensitively as a trimmed substring', () => {
    expect(
      ids(filterScenes(scenes, { query: 'SA', filter: 'all' }, {}, 0)),
    ).toEqual([2])
    expect(
      ids(filterScenes(scenes, { query: '  hello ', filter: 'all' }, {}, 0)),
    ).toEqual([3])
    expect(
      ids(filterScenes(scenes, { query: 'a', filter: 'all' }, {}, 0)),
    ).toEqual([2, 3, 4])
  })

  it('keeps scenes with a positive effective count for "reserved"', () => {
    const counts = { 1: 2, 2: 0, 4: 5 }
    expect(
      ids(filterScenes(scenes, { query: '', filter: 'reserved' }, counts, 0)),
    ).toEqual([1, 4])
  })

  it('uses defaultCount for scenes without an explicit count', () => {
    const counts = { 2: 0 }
    expect(
      ids(filterScenes(scenes, { query: '', filter: 'reserved' }, counts, 1)),
    ).toEqual([1, 3, 4])
  })

  it('keeps scenes without images for "noImages"', () => {
    expect(
      ids(filterScenes(scenes, { query: '', filter: 'noImages' }, {}, 0)),
    ).toEqual([2, 3])
  })

  it('combines the query with a filter', () => {
    expect(
      ids(filterScenes(scenes, { query: 'a', filter: 'noImages' }, {}, 0)),
    ).toEqual([2, 3])
    expect(
      ids(
        filterScenes(scenes, { query: 'a', filter: 'reserved' }, { 4: 1 }, 0),
      ),
    ).toEqual([4])
  })

  it('preserves input order and item identity', () => {
    const out = filterScenes(scenes, { query: '', filter: 'all' }, {}, 0)
    expect(out[0]).toBe(scenes[0])
  })
})

describe('countByFilter', () => {
  it('counts each chip with the query applied', () => {
    expect(countByFilter(scenes, '', { 1: 2 }, 0)).toEqual({
      all: 4,
      reserved: 1,
      noImages: 2,
    })
    expect(countByFilter(scenes, 'a', {}, 3)).toEqual({
      all: 3,
      reserved: 3,
      noImages: 2,
    })
  })

  it('is all zeros for no scenes', () => {
    expect(countByFilter([], '', {}, 5)).toEqual({
      all: 0,
      reserved: 0,
      noImages: 0,
    })
  })
})
