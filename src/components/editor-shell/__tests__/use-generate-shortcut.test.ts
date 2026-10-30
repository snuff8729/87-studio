import { describe, expect, it } from 'vitest'
import { isGenerateShortcut } from '../use-generate-shortcut'

const base = {
  key: 'Enter',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
}

describe('isGenerateShortcut', () => {
  it('matches Ctrl+Enter and Cmd+Enter', () => {
    expect(isGenerateShortcut({ ...base, ctrlKey: true })).toBe(true)
    expect(isGenerateShortcut({ ...base, metaKey: true })).toBe(true)
  })

  it('ignores plain Enter and other modifiers', () => {
    expect(isGenerateShortcut(base)).toBe(false)
    expect(isGenerateShortcut({ ...base, ctrlKey: true, shiftKey: true })).toBe(
      false,
    )
    expect(isGenerateShortcut({ ...base, ctrlKey: true, altKey: true })).toBe(
      false,
    )
    expect(isGenerateShortcut({ ...base, key: 'a', ctrlKey: true })).toBe(false)
  })
})
