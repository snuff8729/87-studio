import { describe, expect, it } from 'vitest'
import {
  parseAxisParam,
  serializeAxisParam,
  toImageQuery,
  withAxisValue,
} from '../gallery-filters'

describe('axis filter param', () => {
  it('parses pairs, drops malformed and duplicate axes', () => {
    expect(parseAxisParam('1:3,2:4,x,1:9,5:')).toEqual([
      { axisId: 1, valueId: 3 },
      { axisId: 2, valueId: 4 },
    ])
    expect(parseAxisParam(undefined)).toEqual([])
  })

  it('serializes and replaces/clears one axis', () => {
    expect(serializeAxisParam([])).toBeUndefined()
    expect(withAxisValue('1:3', 2, 4)).toBe('1:3,2:4')
    expect(withAxisValue('1:3,2:4', 1, 1)).toBe('2:4,1:1')
    expect(withAxisValue('1:3', 1, null)).toBeUndefined()
  })

  it('maps to image query', () => {
    const q = toImageQuery({
      axis: '1:3',
      libraryCharacter: 5,
      outfitItem: 6,
    })
    expect(q.axes).toEqual([{ axisId: 1, valueId: 3 }])
    expect(q.libraryCharacterId).toBe(5)
    expect(q.outfitItemId).toBe(6)
    expect(toImageQuery({}).axes).toBeUndefined()
  })
})
