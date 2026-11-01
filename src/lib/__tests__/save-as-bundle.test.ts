import { describe, expect, it } from 'vitest'
import {
  availableStyleSettings,
  draftFromNaiMetadata,
  draftFromStoredMetadata,
  isDuplicateBundleName,
  pickStyleParams,
} from '../save-as-bundle'

describe('draftFromStoredMetadata', () => {
  it('reads general / negative prompt and settings', () => {
    const d = draftFromStoredMetadata(
      JSON.stringify({
        prompts: {
          generalPrompt: 'watercolor, soft light',
          negativePrompt: 'lowres',
          characterPrompts: [{ prompt: '1girl' }],
        },
        parameters: {
          width: 832,
          height: 1216,
          steps: 28,
          scale: 5,
          cfgRescale: 0.2,
          sampler: 'k_euler_ancestral',
          scheduler: 'karras',
          seed: 1,
          model: 'x',
        },
      }),
    )
    expect(d.prompt).toBe('watercolor, soft light')
    expect(d.negative).toBe('lowres')
    expect(d.params).toEqual({
      width: 832,
      height: 1216,
      steps: 28,
      scale: 5,
      cfgRescale: 0.2,
      sampler: 'k_euler_ancestral',
      scheduler: 'karras',
    })
  })

  it('tolerates broken / empty metadata', () => {
    expect(draftFromStoredMetadata('{nope')).toEqual({
      prompt: '',
      negative: '',
      params: {},
    })
    expect(draftFromStoredMetadata(null).prompt).toBe('')
  })
})

describe('draftFromNaiMetadata', () => {
  it('prefers the V4 base caption and ignores characters', () => {
    const d = draftFromNaiMetadata({
      prompt: 'fallback',
      negativePrompt: 'bad',
      steps: 23,
      cfgScale: 6,
      cfgRescale: 0.1,
      width: 1024,
      height: 1024,
      sampler: 'k_euler',
      scheduler: 'native',
      v4_prompt: {
        caption: {
          base_caption: 'base style',
          char_captions: [{ char_caption: 'girl', centers: [] }],
        },
      },
    })
    expect(d.prompt).toBe('base style')
    expect(d.negative).toBe('bad')
    expect(d.params).toMatchObject({
      width: 1024,
      height: 1024,
      steps: 23,
      scale: 6,
      cfgRescale: 0.1,
      sampler: 'k_euler',
      scheduler: 'native',
    })
  })
})

describe('settings selection', () => {
  const params = { width: 832, height: 1216, steps: 28, sampler: 'k_euler' }

  it('lists only groups with values', () => {
    expect(availableStyleSettings(params)).toEqual(['size', 'steps', 'sampler'])
  })

  it('keeps only checked groups', () => {
    expect(pickStyleParams(params, ['size', 'sampler'])).toEqual({
      width: 832,
      height: 1216,
      sampler: 'k_euler',
    })
    expect(pickStyleParams(params, [])).toEqual({})
  })
})

describe('isDuplicateBundleName', () => {
  it('matches trimmed exact names', () => {
    expect(isDuplicateBundleName(' soft ', ['soft'])).toBe(true)
    expect(isDuplicateBundleName('soft2', ['soft'])).toBe(false)
    expect(isDuplicateBundleName('  ', [''])).toBe(false)
  })
})
