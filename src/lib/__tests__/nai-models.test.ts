import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NAI_MODEL,
  NAI_MODELS,
  defaultSkipCfgAboveSigma,
  getModelProfile,
  pickRandomResolution,
  resolveDynamicThresholding,
  resolveSkipCfgAboveSigma,
  resolveSmea,
  supportsPrecise,
  supportsVibe,
  usesMultipartRequest,
} from '../nai-models'

describe('nai-models', () => {
  it('lists V5 models first and keeps the default unchanged', () => {
    expect(NAI_MODELS[0].id).toBe('nai-diffusion-5-full')
    expect(NAI_MODELS[1].id).toBe('nai-diffusion-5-curated')
    expect(NAI_MODELS).toHaveLength(8)
    expect(DEFAULT_NAI_MODEL).toBe('nai-diffusion-4-5-full')
  })

  it('resolves profiles for known and unknown ids', () => {
    expect(getModelProfile('nai-diffusion-5-full')).toBe('v5')
    expect(getModelProfile('nai-diffusion-4-5-curated')).toBe('v4.5')
    expect(getModelProfile('nai-diffusion-4-full')).toBe('v4')
    expect(getModelProfile('nai-diffusion-furry-3')).toBe('v3')
    expect(getModelProfile('nai-diffusion-5-future')).toBe('v5')
    expect(getModelProfile('nai-diffusion-4-5-future')).toBe('v4.5')
    expect(getModelProfile('nai-diffusion-4-future')).toBe('v4')
    expect(getModelProfile('something-else')).toBe('v3')
  })

  it('computes capabilities', () => {
    expect(supportsVibe('nai-diffusion-5-full')).toBe(false)
    expect(supportsVibe('nai-diffusion-4-5-full')).toBe(true)
    expect(supportsVibe('nai-diffusion-3')).toBe(true)
    expect(supportsPrecise('nai-diffusion-4-5-full')).toBe(true)
    expect(supportsPrecise('nai-diffusion-4-full')).toBe(false)
    expect(supportsPrecise('nai-diffusion-5-curated')).toBe(false)
    expect(usesMultipartRequest('nai-diffusion-5-curated')).toBe(true)
    expect(usesMultipartRequest('nai-diffusion-4-5-full')).toBe(false)
  })

  it('picks skip_cfg_above_sigma per profile', () => {
    expect(defaultSkipCfgAboveSigma('nai-diffusion-5-full')).toBeUndefined()
    expect(defaultSkipCfgAboveSigma('nai-diffusion-4-5-full')).toBe(58)
    expect(defaultSkipCfgAboveSigma('nai-diffusion-4-full')).toBe(19)
    expect(defaultSkipCfgAboveSigma('nai-diffusion-3')).toBe(0)
  })

  it('resolves SMEA/DYN only for V3', () => {
    expect(
      resolveSmea('nai-diffusion-4-5-full', { smea: true }),
    ).toBeUndefined()
    expect(resolveSmea('nai-diffusion-5-full', { smea: true })).toBeUndefined()
    expect(resolveSmea('nai-diffusion-3', {})).toEqual({
      sm: false,
      sm_dyn: false,
    })
    expect(resolveSmea('nai-diffusion-3', { smea: true })).toEqual({
      sm: true,
      sm_dyn: false,
    })
    expect(resolveSmea('nai-diffusion-furry-3', { smeaDyn: true })).toEqual({
      sm: true,
      sm_dyn: true,
    })
    expect(
      resolveSmea('nai-diffusion-3', {
        smea: true,
        smeaDyn: true,
        sampler: 'ddim_v3',
      }),
    ).toEqual({ sm: false, sm_dyn: false })
  })

  it('resolves VAR+ skip_cfg_above_sigma', () => {
    // defaults preserve current behaviour
    expect(resolveSkipCfgAboveSigma('nai-diffusion-4-5-full')).toBe(58)
    expect(resolveSkipCfgAboveSigma('nai-diffusion-4-full')).toBe(19)
    expect(resolveSkipCfgAboveSigma('nai-diffusion-3')).toBe(0)
    expect(resolveSkipCfgAboveSigma('nai-diffusion-5-full')).toBeUndefined()
    // explicit
    expect(resolveSkipCfgAboveSigma('nai-diffusion-4-5-full', false)).toBeNull()
    expect(resolveSkipCfgAboveSigma('nai-diffusion-4-full', false)).toBeNull()
    expect(resolveSkipCfgAboveSigma('nai-diffusion-3', false)).toBe(0)
    expect(resolveSkipCfgAboveSigma('nai-diffusion-3', true)).toBe(19)
    expect(resolveSkipCfgAboveSigma('nai-diffusion-4-5-full', true)).toBe(58)
    expect(
      resolveSkipCfgAboveSigma('nai-diffusion-5-full', true),
    ).toBeUndefined()
  })

  it('resolves dynamic thresholding', () => {
    expect(resolveDynamicThresholding('nai-diffusion-4-5-full', true)).toBe(
      true,
    )
    expect(resolveDynamicThresholding('nai-diffusion-4-5-full')).toBe(false)
    expect(resolveDynamicThresholding('nai-diffusion-5-full', true)).toBe(false)
  })

  it('picks a random resolution from the three presets', () => {
    expect(pickRandomResolution(() => 0)).toEqual({ width: 832, height: 1216 })
    expect(pickRandomResolution(() => 0.5)).toEqual({
      width: 1216,
      height: 832,
    })
    expect(pickRandomResolution(() => 0.99)).toEqual({
      width: 1024,
      height: 1024,
    })
    expect(pickRandomResolution(() => 1)).toEqual({ width: 1024, height: 1024 })
  })
})
