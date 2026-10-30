import { describe, expect, it } from 'vitest'
import { isScenePaletteShortcut } from '../scene-palette-shortcut'

const base = {
  key: 'k',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
}

describe('isScenePaletteShortcut', () => {
  it('matches Ctrl+K off macOS', () => {
    expect(isScenePaletteShortcut({ ...base, ctrlKey: true }, false)).toBe(true)
    expect(
      isScenePaletteShortcut({ ...base, key: 'K', ctrlKey: true }, false),
    ).toBe(true)
  })

  it('matches Cmd+K on macOS but leaves Ctrl+K to the editor', () => {
    expect(isScenePaletteShortcut({ ...base, metaKey: true }, true)).toBe(true)
    expect(isScenePaletteShortcut({ ...base, ctrlKey: true }, true)).toBe(false)
  })

  it('ignores other keys and modifier combinations', () => {
    expect(isScenePaletteShortcut(base, false)).toBe(false)
    expect(
      isScenePaletteShortcut({ ...base, ctrlKey: true, shiftKey: true }, false),
    ).toBe(false)
    expect(
      isScenePaletteShortcut({ ...base, ctrlKey: true, altKey: true }, false),
    ).toBe(false)
    expect(
      isScenePaletteShortcut({ ...base, key: 'Enter', ctrlKey: true }, false),
    ).toBe(false)
  })
})
