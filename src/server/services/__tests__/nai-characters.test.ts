import { describe, expect, it } from 'vitest'
import { buildCharacterPayload } from '../nai-characters'
import { resolveCharacterPositions } from '@/lib/character-positions'

const chars = [
  { prompt: '1girl, red hair', negative: 'bad hands' },
  { prompt: '1boy', negative: '' },
]

describe('buildCharacterPayload', () => {
  it('without positions equals the legacy centered payload', () => {
    const p = buildCharacterPayload(chars)
    expect(p.useCoords).toBe(false)
    expect(p.charCaptions).toEqual(
      chars.map((c) => ({
        char_caption: c.prompt,
        centers: [{ x: 0.5, y: 0.5 }],
      })),
    )
    expect(p.negCharCaptions).toEqual(
      chars.map((c) => ({
        char_caption: c.negative,
        centers: [{ x: 0.5, y: 0.5 }],
      })),
    )
    expect(p.characterPrompts).toEqual(
      chars.map((c) => ({
        center: { x: 0.5, y: 0.5 },
        enabled: true,
        prompt: c.prompt,
        uc: c.negative,
      })),
    )
  })

  it('all-ai positions are byte-identical to no positions', () => {
    const ai = buildCharacterPayload(
      chars,
      resolveCharacterPositions([{ mode: 'ai' }, { mode: 'ai' }]),
    )
    expect(JSON.stringify(ai)).toBe(
      JSON.stringify(buildCharacterPayload(chars)),
    )
  })

  it('mixed positions set coords and mirrored centers (V4.5 / V5 share the shape)', () => {
    const p = buildCharacterPayload(
      chars,
      resolveCharacterPositions([
        { mode: 'fixed', x: 0.3, y: 0.5 },
        { mode: 'ai' },
      ]),
    )
    expect(p.useCoords).toBe(true)
    expect(p.charCaptions.map((c) => c.centers)).toEqual([
      [{ x: 0.3, y: 0.5 }],
      [{ x: 0.5, y: 0.5 }],
    ])
    expect(p.negCharCaptions.map((c) => c.centers)).toEqual(
      p.charCaptions.map((c) => c.centers),
    )
    expect(p.characterPrompts.map((c) => c.center)).toEqual([
      { x: 0.3, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ])
  })
})
