import { describe, expect, it } from 'vitest'
import {
  getActiveNavItem,
  isEditorRoute,
  shouldAutoCollapse,
} from '../nav-items'

describe('getActiveNavItem', () => {
  it('matches root only exactly', () => {
    expect(getActiveNavItem('/')?.to).toBe('/')
    expect(getActiveNavItem('/gallery')?.to).toBe('/gallery')
  })
  it('matches nested paths by prefix', () => {
    expect(getActiveNavItem('/gallery/12')?.to).toBe('/gallery')
    expect(getActiveNavItem('/characters')?.to).toBe('/characters')
  })
  it('does not match partial segments', () => {
    expect(getActiveNavItem('/generate')?.to).toBe('/generate')
    expect(getActiveNavItem('/galleryx')).toBeUndefined()
  })
  it('returns undefined for workspace', () => {
    expect(getActiveNavItem('/workspace/1')).toBeUndefined()
  })
})

describe('isEditorRoute', () => {
  it.each([
    ['/generate', true],
    ['/workspace/1', true],
    ['/workspace/1/scenes/3', true],
    ['/gallery', false],
    ['/', false],
  ])('%s → %s', (p, v) => expect(isEditorRoute(p)).toBe(v))
})

describe('shouldAutoCollapse', () => {
  it('collapses on entering an editor route', () => {
    expect(shouldAutoCollapse('/gallery', '/generate')).toBe(true)
    expect(shouldAutoCollapse(null, '/workspace/1')).toBe(true)
  })
  it('does not re-collapse between editor routes', () => {
    expect(shouldAutoCollapse('/workspace/1', '/workspace/1/scenes/3')).toBe(
      false,
    )
    expect(shouldAutoCollapse('/generate', '/workspace/2')).toBe(false)
  })
  it('does nothing for non-editor targets', () => {
    expect(shouldAutoCollapse('/generate', '/gallery')).toBe(false)
  })
})
