import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import sharp from 'sharp'
import {
  buildMockPng,
  buildMockSvg,
  buildMockZip,
  consumeFailOnce,
  getMockDelayMs,
  promptTriggersMockFailure,
} from '../nai-mock'

const prompts = (general: string) => ({
  generalPrompt: general,
  negativePrompt: '',
  characterPrompts: [{ characterId: 1, name: 'c', prompt: '', negative: '' }],
})

describe('nai-mock', () => {
  it('builds a PNG of the requested size inside a ZIP', async () => {
    const png = await buildMockPng(64, 96, 1234)
    const files = unzipSync(buildMockZip(png))
    const names = Object.keys(files)
    expect(names).toEqual(['image_0.png'])
    const meta = await sharp(Buffer.from(files['image_0.png'])).metadata()
    expect(meta.format).toBe('png')
    expect([meta.width, meta.height]).toEqual([64, 96])
  })

  it('puts the seed in the image text', () => {
    expect(buildMockSvg(100, 100, 42)).toContain('MOCK seed 42')
  })

  it('detects the failure marker in any prompt', () => {
    expect(promptTriggersMockFailure(prompts('a, __mock_fail__'))).toBe(true)
    expect(promptTriggersMockFailure(prompts('a, b'))).toBe(false)
    expect(
      promptTriggersMockFailure({
        ...prompts('x'),
        characterPrompts: [
          { characterId: 1, name: 'c', prompt: '__mock_fail__', negative: '' },
        ],
      }),
    ).toBe(true)
  })

  it('reads the delay from env with a default', () => {
    expect(getMockDelayMs({})).toBe(1500)
    expect(getMockDelayMs({ NAI_MOCK_DELAY_MS: '200' })).toBe(200)
    expect(getMockDelayMs({ NAI_MOCK_DELAY_MS: 'x' })).toBe(1500)
  })

  it('fails only the first call per fail-once prompt', () => {
    const p = prompts('x, __mock_fail_once__ unique-1')
    expect(consumeFailOnce(p)).toBe(true)
    expect(consumeFailOnce(p)).toBe(false)
    expect(consumeFailOnce(prompts('plain'))).toBe(false)
    expect(promptTriggersMockFailure(p)).toBe(false)
  })
})
