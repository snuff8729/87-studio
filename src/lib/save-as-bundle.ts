/**
 * "Save as bundle": turn an image's prompt + generation settings (a stored
 * gallery image, or metadata parsed from an uploaded NAI image) into the
 * draft of a text / style bundle. Pure logic for the dialog.
 */
import type { NAIMetadata } from '@/lib/nai-metadata'
import type { StyleParams } from '@/lib/style-bundles'
import { naiMetadataToParams, naiMetadataToPrompts } from '@/lib/nai-import'
import { sanitizeStyleParams } from '@/lib/style-bundles'

/** Setting groups offered as checkboxes (a style stores them per group) */
export const SAVE_STYLE_SETTING_KEYS = [
  'size',
  'steps',
  'scale',
  'cfgRescale',
  'sampler',
] as const
export type SaveStyleSettingKey = (typeof SAVE_STYLE_SETTING_KEYS)[number]

const GROUP_FIELDS: Record<SaveStyleSettingKey, Array<keyof StyleParams>> = {
  size: ['width', 'height'],
  steps: ['steps'],
  scale: ['scale'],
  cfgRescale: ['cfgRescale'],
  sampler: ['sampler', 'scheduler'],
}

export interface BundleDraftSource {
  /** General prompt (character prompts are not included) */
  prompt: string
  negative: string
  /** Every setting the image carries (sanitized) */
  params: StyleParams
}

/** Metadata parsed from an uploaded NAI image (PNG tEXt / stealth alpha) */
export function draftFromNaiMetadata(metadata: NAIMetadata): BundleDraftSource {
  const prompts = naiMetadataToPrompts(metadata)
  const { parameters } = naiMetadataToParams(metadata)
  return {
    prompt: prompts.generalPrompt,
    negative: prompts.negativePrompt,
    params: sanitizeStyleParams(parameters),
  }
}

/** `generated_images.metadata` (JSON string or parsed): prompts + parameters */
export function draftFromStoredMetadata(stored: unknown): BundleDraftSource {
  let meta: any = stored
  if (typeof stored === 'string') {
    try {
      meta = JSON.parse(stored)
    } catch {
      meta = null
    }
  }
  const prompts = meta?.prompts ?? {}
  return {
    prompt:
      typeof prompts.generalPrompt === 'string' ? prompts.generalPrompt : '',
    negative:
      typeof prompts.negativePrompt === 'string' ? prompts.negativePrompt : '',
    params: sanitizeStyleParams(meta?.parameters),
  }
}

/** Setting groups the image actually has a value for, in display order */
export function availableStyleSettings(
  params: StyleParams,
): Array<SaveStyleSettingKey> {
  return SAVE_STYLE_SETTING_KEYS.filter((k) =>
    GROUP_FIELDS[k].some((f) => params[f] != null),
  )
}

/** Keep only the checked groups */
export function pickStyleParams(
  params: StyleParams,
  selected: ReadonlyArray<SaveStyleSettingKey>,
): StyleParams {
  const out: StyleParams = {}
  for (const k of selected) {
    for (const f of GROUP_FIELDS[k]) {
      if (params[f] != null) (out as Record<string, unknown>)[f] = params[f]
    }
  }
  return out
}

/** Bundle names are unique (exact match after trimming) */
export function isDuplicateBundleName(
  name: string,
  existing: ReadonlyArray<string>,
): boolean {
  const n = name.trim()
  return n !== '' && existing.includes(n)
}
