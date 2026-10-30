import { describe, expect, it } from 'vitest'
import {
  defaultEditorLayout,
  isPanelCollapsed,
  parseEditorLayout,
} from '../use-editor-persist'

describe('defaultEditorLayout', () => {
  it('uses 24/66/10 by default', () => {
    expect(defaultEditorLayout()).toEqual({ left: 24, center: 66, right: 10 })
  })

  it('gives the right panel space to the center when collapsed', () => {
    expect(defaultEditorLayout(true)).toEqual({
      left: 24,
      center: 76,
      right: 0,
    })
  })
})

describe('parseEditorLayout', () => {
  it('accepts a valid layout', () => {
    expect(parseEditorLayout('{"left":30,"center":55,"right":15}')).toEqual({
      left: 30,
      center: 55,
      right: 15,
    })
  })

  it('accepts collapsed side panels', () => {
    expect(parseEditorLayout('{"left":0,"center":90,"right":10}')).toEqual({
      left: 0,
      center: 90,
      right: 10,
    })
    expect(
      parseEditorLayout('{"left":0.0001,"center":99.9999,"right":0}'),
    ).toEqual({ left: 0, center: 99.9999, right: 0 })
  })

  it('tolerates floating point drift', () => {
    expect(
      parseEditorLayout('{"left":17.9999,"center":72.0001,"right":10}'),
    ).not.toBeNull()
  })

  it.each([
    ['null', null],
    ['empty', ''],
    ['malformed JSON', '{left:'],
    ['array', '[24,66,10]'],
    ['primitive', '42'],
    ['missing key', '{"left":24,"center":76}'],
    ['string value', '{"left":"24","center":66,"right":10}'],
    ['sum not 100', '{"left":24,"center":50,"right":10}'],
    ['left below min', '{"left":10,"center":80,"right":10}'],
    ['left above max', '{"left":50,"center":40,"right":10}'],
    ['right below min', '{"left":24,"center":73,"right":3}'],
    ['right above max', '{"left":20,"center":40,"right":40}'],
    ['non-finite', '{"left":24,"center":1e999,"right":10}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseEditorLayout(raw)).toBeNull()
  })
})

describe('isPanelCollapsed', () => {
  it('treats ~0 as collapsed', () => {
    expect(isPanelCollapsed(0)).toBe(true)
    expect(isPanelCollapsed(0.2)).toBe(true)
    expect(isPanelCollapsed(7)).toBe(false)
    expect(isPanelCollapsed(undefined)).toBe(false)
  })
})
