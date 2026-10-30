/**
 * Single mapping from parsed NAI metadata to our project / Quick Generate
 * state. Everything that imports metadata (create project, send to Quick
 * Generate, Quick Generate drop dialog) goes through here.
 */

import { detectNaiModel } from './nai-model-detect'
import { getModelProfile } from './nai-models'
import type { NAIMetadata } from './nai-metadata'
import type { NaiModelDetection } from './nai-model-detect'

// ─── Settings ───────────────────────────────────────────────────────────────

export type ImportSettingKey =
  | 'model'
  | 'size'
  | 'steps'
  | 'scale'
  | 'cfgRescale'
  | 'sampler'
  | 'scheduler'
  | 'ucPreset'
  | 'smea'
  | 'varietyPlus'
  | 'decrisp'
  | 'seed'

/** Display / toggle order. */
export const IMPORT_SETTING_KEYS: ReadonlyArray<ImportSettingKey> = [
  'model',
  'size',
  'steps',
  'scale',
  'cfgRescale',
  'sampler',
  'scheduler',
  'ucPreset',
  'smea',
  'varietyPlus',
  'decrisp',
  'seed',
]

/** Not covered by the "sync all" master toggle; off unless picked. */
export const IMPORT_SETTINGS_OPT_IN: ReadonlyArray<ImportSettingKey> = ['seed']

/** `parameters` JSON keys written by each setting. */
export const IMPORT_SETTING_PARAM_KEYS: Record<
  ImportSettingKey,
  ReadonlyArray<string>
> = {
  model: ['model'],
  size: ['width', 'height'],
  steps: ['steps'],
  scale: ['scale'],
  cfgRescale: ['cfgRescale'],
  sampler: ['sampler'],
  scheduler: ['scheduler'],
  ucPreset: ['ucPreset'],
  smea: ['smea', 'smeaDyn'],
  varietyPlus: ['varietyPlus'],
  decrisp: ['decrisp'],
  seed: ['seed'],
}

const KNOWN_SAMPLERS = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_2m',
  'k_dpmpp_sde',
  'ddim_v3',
]
const KNOWN_SCHEDULERS = ['native', 'karras', 'exponential', 'polyexponential']

export interface NaiImportParams {
  /** Keys exactly as `ParameterForm` / the generator read them. */
  parameters: Record<string, unknown>
  /** Model detection (null = nothing usable in the metadata). */
  model: NaiModelDetection | null
  /** Human-readable reasons something was left out. */
  skipped: Array<string>
  /** The imported negative already contains UC preset tags (preset -> None). */
  ucPresetBaked: boolean
}

export const UC_PRESET_NONE = 4

const UC_PRESET_MARKERS = [
  'lowres',
  'worst quality',
  'bad quality',
  'jpeg artifacts',
  'very displeasing',
  'too many watermarks',
  'scan artifacts',
  'film grain',
  'chromatic aberration',
  'artistic error',
]

/** True when a negative prompt visibly contains NAI UC preset tags. */
export function negativeContainsPresetText(negative?: string): boolean {
  if (!negative) return false
  const lower = negative.toLowerCase()
  return UC_PRESET_MARKERS.filter((m) => lower.includes(m)).length >= 4
}

export function naiMetadataToParams(metadata: NAIMetadata): NaiImportParams {
  const p: Record<string, unknown> = {}
  const skipped: Array<string> = []
  const model = detectNaiModel(metadata.model, metadata.raw)
  if (model) p.model = model.id

  const profile = model ? getModelProfile(model.id) : null
  const hasV4Prompt = !!metadata.v4_prompt
  const isV3 = profile ? profile === 'v3' : !hasV4Prompt

  if (metadata.width != null && metadata.height != null) {
    p.width = metadata.width
    p.height = metadata.height
  }
  if (metadata.steps != null) p.steps = metadata.steps
  if (metadata.cfgScale != null) p.scale = metadata.cfgScale
  if (metadata.cfgRescale != null) p.cfgRescale = metadata.cfgRescale

  if (metadata.sampler) {
    if (KNOWN_SAMPLERS.includes(metadata.sampler)) p.sampler = metadata.sampler
    else skipped.push(`sampler:${metadata.sampler}`)
  }
  if (metadata.scheduler) {
    if (KNOWN_SCHEDULERS.includes(metadata.scheduler))
      p.scheduler = metadata.scheduler
    else skipped.push(`scheduler:${metadata.scheduler}`)
  }
  // NAI clients write the preset tags into `uc` themselves; our generator
  // sends `ucPreset` to the API as well, so keeping the preset would apply it
  // twice. When the negative already carries preset text, import "None" (4).
  const ucBaked = negativeContainsPresetText(metadata.negativePrompt)
  if (ucBaked) p.ucPreset = UC_PRESET_NONE
  else if (metadata.ucPreset != null) p.ucPreset = metadata.ucPreset
  else if (metadata.negativePrompt) p.ucPreset = UC_PRESET_NONE
  if (metadata.seed != null) p.seed = metadata.seed

  // SMEA / DYN only exist on the V3 profile
  if (isV3 && (metadata.smea != null || metadata.smeaDyn != null)) {
    const dyn = !!metadata.smeaDyn
    p.smea = !!metadata.smea || dyn
    p.smeaDyn = dyn
  }
  // VAR+ / DECRISP are not available on V5
  if (profile !== 'v5') {
    if (metadata.variety != null) p.varietyPlus = metadata.variety
    if (metadata.dynamicThresholding != null)
      p.decrisp = metadata.dynamicThresholding
  }

  return { parameters: p, model, skipped, ucPresetBaked: ucBaked }
}

/** Settings that this metadata actually carries a value for. */
export function availableSettings(
  imported: NaiImportParams,
): Array<ImportSettingKey> {
  return IMPORT_SETTING_KEYS.filter((k) =>
    IMPORT_SETTING_PARAM_KEYS[k].some((pk) => pk in imported.parameters),
  )
}

// ─── Prompts ────────────────────────────────────────────────────────────────

export interface ImportedCharacter {
  name: string
  prompt: string
  negative: string
}

export interface NaiImportPrompts {
  generalPrompt: string
  negativePrompt: string
  characters: Array<ImportedCharacter>
}

export function naiMetadataToPrompts(metadata: NAIMetadata): NaiImportPrompts {
  const captions = metadata.v4_prompt?.caption?.char_captions ?? []
  const negCaptions = metadata.v4_negative_prompt?.caption?.char_captions ?? []
  return {
    generalPrompt:
      metadata.v4_prompt?.caption?.base_caption || metadata.prompt || '',
    negativePrompt: metadata.negativePrompt ?? '',
    characters: captions.map((cc, i) => ({
      name: `Character ${i + 1}`,
      prompt: cc.char_caption,
      negative: negCaptions[i]?.char_caption ?? '',
    })),
  }
}

// ─── Selection ──────────────────────────────────────────────────────────────

export interface ImportSelection {
  generalPrompt: boolean
  negativePrompt: boolean
  characters: boolean
  settings: Record<ImportSettingKey, boolean>
}

export function defaultImportSelection(
  imported: NaiImportParams,
): ImportSelection {
  const avail = new Set(availableSettings(imported))
  const settings = {} as Record<ImportSettingKey, boolean>
  for (const k of IMPORT_SETTING_KEYS) {
    settings[k] = avail.has(k) && !IMPORT_SETTINGS_OPT_IN.includes(k)
  }
  return {
    generalPrompt: true,
    negativePrompt: true,
    characters: true,
    settings,
  }
}

export interface NaiImportResult {
  generalPrompt?: string
  negativePrompt?: string
  characters?: Array<ImportedCharacter>
  parameters?: Record<string, unknown>
}

export function buildImport(
  metadata: NAIMetadata,
  selection: ImportSelection,
): NaiImportResult {
  const prompts = naiMetadataToPrompts(metadata)
  const imported = naiMetadataToParams(metadata)
  const out: NaiImportResult = {}

  if (selection.generalPrompt) out.generalPrompt = prompts.generalPrompt
  if (selection.negativePrompt) out.negativePrompt = prompts.negativePrompt
  if (selection.characters && prompts.characters.length > 0)
    out.characters = prompts.characters

  const parameters: Record<string, unknown> = {}
  for (const k of IMPORT_SETTING_KEYS) {
    if (!selection.settings[k]) continue
    for (const pk of IMPORT_SETTING_PARAM_KEYS[k]) {
      if (pk in imported.parameters) parameters[pk] = imported.parameters[pk]
    }
  }
  if (Object.keys(parameters).length > 0) out.parameters = parameters
  return out
}

/** Merge imported parameters over existing ones (Quick Generate state). */
export function mergeImportedParameters(
  current: Record<string, unknown>,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current, ...imported }
  // an explicit size must win over random resolution
  if ('width' in imported && next.randomResolution === true)
    delete next.randomResolution
  return next
}
