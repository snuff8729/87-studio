import { describe, expect, it } from 'vitest'
import {
  buildQuickPromptInput,
  quickCharHasParts,
  setAxisValue,
} from '../quick-parts'

const base = { name: 'A', prompt: 'p', negative: 'n' }

describe('quickCharHasParts', () => {
  it('is false without link or outfit', () => {
    expect(quickCharHasParts({ ...base, outfit: undefined })).toBe(false)
    expect(quickCharHasParts({ libraryCharacterId: null, outfit: [] })).toBe(
      false,
    )
  })
  it('is true with a link or an outfit', () => {
    expect(quickCharHasParts({ libraryCharacterId: 3 })).toBe(true)
    expect(quickCharHasParts({ outfit: [{ id: 1 }] })).toBe(true)
  })
})

describe('buildQuickPromptInput', () => {
  it('leaves plain characters untouched and omits global axes', () => {
    const out = buildQuickPromptInput({
      generalPrompt: 'g',
      negativePrompt: 'ng',
      characters: [base],
      globalAxisValues: { '1': 2 },
    })
    expect(out.characters[0]).toEqual({
      name: 'A',
      prompt: 'p',
      negative: 'n',
      position: undefined,
    })
    expect('globalAxisValues' in out).toBe(false)
  })
  it('sends parts fields and global axes when a character uses parts', () => {
    const out = buildQuickPromptInput({
      generalPrompt: 'g',
      negativePrompt: 'ng',
      characters: [{ ...base, libraryCharacterId: 5, outfit: [{ id: 2 }] }],
      globalAxisValues: { '1': 2 },
    })
    expect(out.characters[0]).toMatchObject({
      libraryCharacterId: 5,
      outfit: [{ id: 2 }],
      axisValues: {},
    })
    expect(out.globalAxisValues).toEqual({ '1': 2 })
  })
})

describe('setAxisValue', () => {
  it('sets and clears without mutating', () => {
    const a = { '1': 2 }
    expect(setAxisValue(a, 3, 4)).toEqual({ '1': 2, '3': 4 })
    expect(setAxisValue(a, 1, null)).toEqual({})
    expect(a).toEqual({ '1': 2 })
  })
})
