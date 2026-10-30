export type NaiModelProfile = 'v3' | 'v4' | 'v4.5' | 'v5'

export const NAI_MODELS: ReadonlyArray<{
  id: string
  name: string
  profile: NaiModelProfile
}> = [
  { id: 'nai-diffusion-5-full', name: 'NAI Diffusion V5 Full', profile: 'v5' },
  {
    id: 'nai-diffusion-5-curated',
    name: 'NAI Diffusion V5 Curated',
    profile: 'v5',
  },
  {
    id: 'nai-diffusion-4-5-curated',
    name: 'NAI Diffusion V4.5 Curated',
    profile: 'v4.5',
  },
  {
    id: 'nai-diffusion-4-5-full',
    name: 'NAI Diffusion V4.5 Full',
    profile: 'v4.5',
  },
  {
    id: 'nai-diffusion-4-curated-preview',
    name: 'NAI Diffusion V4 Curated',
    profile: 'v4',
  },
  { id: 'nai-diffusion-4-full', name: 'NAI Diffusion V4 Full', profile: 'v4' },
  { id: 'nai-diffusion-3', name: 'NAI Diffusion V3 (Anime)', profile: 'v3' },
  {
    id: 'nai-diffusion-furry-3',
    name: 'NAI Diffusion Furry V3',
    profile: 'v3',
  },
]

export const DEFAULT_NAI_MODEL = 'nai-diffusion-4-5-full'

export function getModelProfile(id: string): NaiModelProfile {
  const known = NAI_MODELS.find((m) => m.id === id)
  if (known) return known.profile
  if (id.startsWith('nai-diffusion-5')) return 'v5'
  if (id.startsWith('nai-diffusion-4-5')) return 'v4.5'
  if (id.startsWith('nai-diffusion-4')) return 'v4'
  return 'v3'
}

/** Vibe Transfer is allowed on everything except V5. */
export function supportsVibe(id: string): boolean {
  return getModelProfile(id) !== 'v5'
}

/** Precise Reference is V4.5 only. */
export function supportsPrecise(id: string): boolean {
  return getModelProfile(id) === 'v4.5'
}

/** V5 requests are sent as multipart/form-data with a `request` JSON part. */
export function usesMultipartRequest(id: string): boolean {
  return getModelProfile(id) === 'v5'
}

/** undefined = omit the `skip_cfg_above_sigma` key entirely. */
export function defaultSkipCfgAboveSigma(id: string): number | undefined {
  switch (getModelProfile(id)) {
    case 'v5':
      return undefined
    case 'v4.5':
      return 58
    case 'v4':
      return 19
    default:
      return 0
  }
}

/** SMEA / DYN toggles exist only for the V3 profile. */
export function supportsSmea(id: string): boolean {
  return getModelProfile(id) === 'v3'
}

/** VAR+ (skip_cfg_above_sigma) is available on everything except V5. */
export function supportsVarietyPlus(id: string): boolean {
  return getModelProfile(id) !== 'v5'
}

/** DECRISP (dynamic thresholding) is hidden/forced off on V5 (unverified). */
export function supportsDecrisp(id: string): boolean {
  return getModelProfile(id) !== 'v5'
}

export function isDdimSampler(sampler?: string): boolean {
  return !!sampler && sampler.includes('ddim')
}

/**
 * API `sm` / `sm_dyn` values, or undefined when the keys must not be sent
 * (non-V3 models). DYN implies SMEA; ddim samplers force both off.
 */
export function resolveSmea(
  id: string,
  opts: { smea?: boolean; smeaDyn?: boolean; sampler?: string },
): { sm: boolean; sm_dyn: boolean } | undefined {
  if (!supportsSmea(id)) return undefined
  if (isDdimSampler(opts.sampler)) return { sm: false, sm_dyn: false }
  const dyn = !!opts.smeaDyn
  return { sm: !!opts.smea || dyn, sm_dyn: dyn }
}

/** VAR+ default when unset: on for v4/v4.5, off for v3. */
export function isVarietyPlusOn(id: string, varietyPlus?: boolean): boolean {
  if (varietyPlus !== undefined) return varietyPlus
  const profile = getModelProfile(id)
  return profile === 'v4' || profile === 'v4.5'
}

/**
 * `skip_cfg_above_sigma` value: number, null (explicit disable) or
 * undefined (omit the key, V5).
 */
export function resolveSkipCfgAboveSigma(
  id: string,
  varietyPlus?: boolean,
): number | null | undefined {
  const profile = getModelProfile(id)
  if (profile === 'v5') return undefined
  if (isVarietyPlusOn(id, varietyPlus)) return profile === 'v4.5' ? 58 : 19
  return profile === 'v3' ? 0 : null
}

export function resolveDynamicThresholding(
  id: string,
  decrisp?: boolean,
): boolean {
  return supportsDecrisp(id) && !!decrisp
}

export const RANDOM_RESOLUTIONS: ReadonlyArray<{
  width: number
  height: number
}> = [
  { width: 832, height: 1216 },
  { width: 1216, height: 832 },
  { width: 1024, height: 1024 },
]

export function pickRandomResolution(rng: () => number = Math.random): {
  width: number
  height: number
} {
  const i = Math.min(
    RANDOM_RESOLUTIONS.length - 1,
    Math.floor(rng() * RANDOM_RESOLUTIONS.length),
  )
  return { ...RANDOM_RESOLUTIONS[i] }
}

/**
 * Effective reference mode for a job. Unsupported modes only fail when the
 * project actually has enabled references of that type; otherwise they are
 * treated as 'none'.
 */
export function resolveReferenceMode(
  mode: string,
  model: string,
  enabled: { vibe: number; precise: number },
): 'vibe' | 'precise' | 'none' {
  if (mode === 'vibe') {
    if (enabled.vibe === 0) return 'none'
    if (!supportsVibe(model)) {
      throw new Error('Vibe Transfer is not supported with V5 models')
    }
    return 'vibe'
  }
  if (mode === 'precise') {
    if (enabled.precise === 0) return 'none'
    if (!supportsPrecise(model)) {
      throw new Error('Precise Reference requires V4.5 model')
    }
    return 'precise'
  }
  return 'none'
}
