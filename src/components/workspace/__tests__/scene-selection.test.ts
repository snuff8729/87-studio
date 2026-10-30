import { describe, expect, it } from 'vitest'
import { selectAllState, setChecked, visibleChecked } from '../scene-selection'

describe('setChecked', () => {
  it('adds and removes without mutating', () => {
    const base = new Set([1, 2])
    const added = setChecked(base, 3, true)
    expect([...added]).toEqual([1, 2, 3])
    expect([...base]).toEqual([1, 2])
    expect([...setChecked(added, 1, false)]).toEqual([2, 3])
  })
})

describe('visibleChecked', () => {
  it('keeps checked ids that are visible, in visible order', () => {
    expect(visibleChecked(new Set([5, 1, 9]), [1, 2, 5])).toEqual([1, 5])
  })

  it('is empty when nothing visible is checked', () => {
    expect(visibleChecked(new Set([9]), [1, 2])).toEqual([])
  })
})

describe('selectAllState', () => {
  it('reports none, some and all', () => {
    expect(selectAllState(0, 5)).toBe('none')
    expect(selectAllState(2, 5)).toBe('some')
    expect(selectAllState(5, 5)).toBe('all')
  })

  it('treats an empty list as none', () => {
    expect(selectAllState(0, 0)).toBe('none')
  })
})
