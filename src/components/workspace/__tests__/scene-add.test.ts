import { describe, expect, it } from 'vitest'
import { defaultAddPackId, isDuplicateSceneName } from '../scene-add'

const packs = [
  { id: 1, name: 'A', sceneNames: ['Smile', 'Wave'] },
  { id: 2, name: 'B', sceneNames: [] },
]

describe('defaultAddPackId', () => {
  it('prefers the pack of the selected scene', () => {
    expect(defaultAddPackId(packs, 2)).toBe(2)
  })

  it('falls back to the first pack', () => {
    expect(defaultAddPackId(packs, null)).toBe(1)
    expect(defaultAddPackId(packs, 99)).toBe(1)
  })

  it('is null without packs', () => {
    expect(defaultAddPackId([], 1)).toBeNull()
  })
})

describe('isDuplicateSceneName', () => {
  it('matches trimmed, case-insensitive names within the pack', () => {
    expect(isDuplicateSceneName(packs[0], ' smile ')).toBe(true)
    expect(isDuplicateSceneName(packs[0], 'Cry')).toBe(false)
    expect(isDuplicateSceneName(packs[1], 'Smile')).toBe(false)
  })

  it('is false without a pack', () => {
    expect(isDuplicateSceneName(undefined, 'Smile')).toBe(false)
  })
})
