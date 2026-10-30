import { describe, expect, it } from 'vitest'
import { duplicateName, moveItem, nextCharacterName } from '../characters'

describe('moveItem', () => {
  it('moves left and right', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
  })

  it('is a no-op at the edges and out of range', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 5, 1)).toEqual(['a', 'b'])
  })

  it('does not mutate the input', () => {
    const input = ['a', 'b']
    moveItem(input, 0, 1)
    expect(input).toEqual(['a', 'b'])
  })
})

describe('nextCharacterName', () => {
  it('numbers after the current count', () => {
    expect(nextCharacterName([])).toBe('Character 1')
    expect(nextCharacterName(['Alice'])).toBe('Character 2')
  })

  it('skips names already in use', () => {
    expect(nextCharacterName(['Character 2', 'Bob'])).toBe('Character 3')
  })
})

describe('duplicateName', () => {
  it('appends copy and a counter on collisions', () => {
    expect(duplicateName('Alice', ['Alice'])).toBe('Alice copy')
    expect(duplicateName('Alice', ['Alice', 'Alice copy'])).toBe('Alice copy 2')
  })
})
