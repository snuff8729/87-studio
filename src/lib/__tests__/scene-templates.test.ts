import { describe, expect, it } from 'vitest'
import {
  filterByName,
  isDuplicateName,
  moveId,
  nextCopyName,
  parsePlaceholders,
  parseTemplatesLayout,
  renameKey,
  stepSelection,
  suggestKeys,
} from '../scene-templates'

describe('parsePlaceholders', () => {
  it('parses objects and coerces non-strings', () => {
    expect(parsePlaceholders('{"a":"x","b":1}')).toEqual({ a: 'x', b: '' })
  })
  it('falls back to empty on bad input', () => {
    expect(parsePlaceholders(null)).toEqual({})
    expect(parsePlaceholders('nope')).toEqual({})
    expect(parsePlaceholders('[1]')).toEqual({})
  })
})

describe('nextCopyName', () => {
  it('appends (copy) then numbers', () => {
    expect(nextCopyName('Smile', ['Smile'])).toBe('Smile (copy)')
    expect(nextCopyName('Smile', ['Smile', 'Smile (copy)'])).toBe(
      'Smile (copy 2)',
    )
    expect(nextCopyName('Smile (copy)', ['Smile', 'Smile (copy)'])).toBe(
      'Smile (copy 2)',
    )
  })
})

describe('isDuplicateName', () => {
  it('is case-insensitive and can exempt the current name', () => {
    expect(isDuplicateName(['Smile'], ' smile ')).toBe(true)
    expect(isDuplicateName(['Smile'], 'SMILE', 'Smile')).toBe(false)
    expect(isDuplicateName(['Smile'], 'Sad')).toBe(false)
  })
})

describe('moveId', () => {
  it('swaps neighbours', () => {
    expect(moveId([1, 2, 3], 2, 'up')).toEqual([2, 1, 3])
    expect(moveId([1, 2, 3], 2, 'down')).toEqual([1, 3, 2])
  })
  it('returns null at the edges or for unknown ids', () => {
    expect(moveId([1, 2, 3], 1, 'up')).toBeNull()
    expect(moveId([1, 2, 3], 3, 'down')).toBeNull()
    expect(moveId([1, 2, 3], 9, 'up')).toBeNull()
  })
})

describe('suggestKeys', () => {
  it('lists pack keys then slots, without existing or duplicates', () => {
    expect(
      suggestKeys(
        [
          { a: '', b: '' },
          { b: '', c: '' },
        ],
        ['c', 'd', 'a'],
        ['b'],
      ),
    ).toEqual(['a', 'c', 'd'])
  })
})

describe('renameKey', () => {
  it('keeps order', () => {
    const out = renameKey({ a: '1', b: '2', c: '3' }, 'b', 'x')
    expect(Object.keys(out ?? {})).toEqual(['a', 'x', 'c'])
    expect(out?.x).toBe('2')
  })
  it('rejects empty, same, missing and conflicting names', () => {
    expect(renameKey({ a: '' }, 'a', ' ')).toBeNull()
    expect(renameKey({ a: '' }, 'a', 'a')).toBeNull()
    expect(renameKey({ a: '' }, 'z', 'y')).toBeNull()
    expect(renameKey({ a: '', b: '' }, 'a', 'b')).toBeNull()
  })
})

describe('filterByName / stepSelection', () => {
  it('filters case-insensitively', () => {
    expect(filterByName([{ name: 'Smile' }, { name: 'Sad' }], 'SM')).toEqual([
      { name: 'Smile' },
    ])
  })
  it('steps and clamps', () => {
    expect(stepSelection([1, 2, 3], 1, 1)).toBe(2)
    expect(stepSelection([1, 2, 3], 3, 1)).toBe(3)
    expect(stepSelection([1, 2, 3], 1, -1)).toBe(1)
    expect(stepSelection([1, 2, 3], null, 1)).toBe(1)
    expect(stepSelection([], null, 1)).toBeNull()
  })
})

describe('parseTemplatesLayout', () => {
  it('accepts valid and rejects bad layouts', () => {
    expect(
      parseTemplatesLayout('{"packs":17,"scenes":22,"editor":61}'),
    ).toEqual({ packs: 17, scenes: 22, editor: 61 })
    expect(
      parseTemplatesLayout('{"packs":50,"scenes":22,"editor":61}'),
    ).toBeNull()
    expect(parseTemplatesLayout('x')).toBeNull()
    expect(parseTemplatesLayout(null)).toBeNull()
  })
})
