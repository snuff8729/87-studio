import { describe, expect, it } from 'vitest'
import {
  SCENE_CARD_SIZE_DEFAULT,
  parseSceneCardSize,
  sceneBoardSizeKey,
} from '../scene-board-prefs'

describe('sceneBoardSizeKey', () => {
  it('is namespaced per project', () => {
    expect(sceneBoardSizeKey(7)).toBe('87studio-scene-board-size:7')
  })
})

describe('parseSceneCardSize', () => {
  it('reads valid sizes', () => {
    expect(parseSceneCardSize('sm')).toBe('sm')
    expect(parseSceneCardSize('md')).toBe('md')
    expect(parseSceneCardSize('lg')).toBe('lg')
  })

  it('falls back to the default for missing or invalid values', () => {
    expect(SCENE_CARD_SIZE_DEFAULT).toBe('lg')
    expect(parseSceneCardSize(null)).toBe('lg')
    expect(parseSceneCardSize('xl')).toBe('lg')
    expect(parseSceneCardSize('{"size":"sm"}')).toBe('lg')
  })
})
