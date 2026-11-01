/**
 * Style bundles (kind 'style'): a prompt + negative prompt + generation
 * settings. Pure logic shared by synthesis, the generation loop and the UI.
 *
 * A style reference works like a text bundle (its prompt is inlined). Only
 * styles in the *general* prompt become "the image's style": their negative
 * is appended to the negative prompt and their settings are applied to the
 * parameters (per item, see `StyleFollow`).
 */
import type { BundleDef, WildcardEntry } from '@/lib/wildcard'
import { parseWildcardOptions, replaceBundleRefs } from '@/lib/wildcard'

export interface StyleParams {
  width?: number
  height?: number
  steps?: number
  scale?: number
  cfgRescale?: number
  sampler?: string
  scheduler?: string
}

export interface StyleInfo {
  bundleId: number
  name: string
  negative: string
  params: StyleParams
}

export const STYLE_FOLLOW_KEYS = [
  'resolution',
  'steps',
  'scale',
  'cfgRescale',
  'sampler',
] as const
export type StyleFollowKey = (typeof STYLE_FOLLOW_KEYS)[number]
export type StyleFollow = Record<StyleFollowKey, boolean>

/** Missing keys (and anything not `false`) follow the style */
export function normalizeStyleFollow(value: unknown): StyleFollow {
  const v =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(
    STYLE_FOLLOW_KEYS.map((k) => [k, v[k] !== false]),
  ) as StyleFollow
}

/** A style in the general prompt, in text order */
export type StyleSlot =
  | { kind: 'static'; style: StyleInfo }
  | { kind: 'wildcard'; wildcardId: number }

const SAMPLER_LABELS: Record<string, string> = {
  k_euler_ancestral: 'Euler a',
  k_euler: 'Euler',
  k_dpmpp_2s_ancestral: 'DPM++ 2S a',
  k_dpmpp_2m: 'DPM++ 2M',
  k_dpmpp_sde: 'DPM++ SDE',
  ddim_v3: 'DDIM v3',
}

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/** Validate untrusted style params; unknown / invalid keys are dropped */
export function sanitizeStyleParams(value: unknown): StyleParams {
  const v =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const out: StyleParams = {}
  const int = (k: 'width' | 'height' | 'steps', min: number, max: number) => {
    const n = v[k]
    if (finite(n)) out[k] = Math.min(max, Math.max(min, Math.round(n)))
  }
  int('width', 64, 4096)
  int('height', 64, 4096)
  int('steps', 1, 50)
  if (finite(v.scale)) {
    out.scale = Math.round(Math.min(20, Math.max(0, v.scale)) * 100) / 100
  }
  if (finite(v.cfgRescale)) {
    out.cfgRescale =
      Math.round(Math.min(1, Math.max(0, v.cfgRescale)) * 100) / 100
  }
  if (typeof v.sampler === 'string' && v.sampler.trim()) {
    out.sampler = v.sampler.trim()
  }
  if (typeof v.scheduler === 'string' && v.scheduler.trim()) {
    out.scheduler = v.scheduler.trim()
  }
  return out
}

/** Parse the stored JSON column (null / invalid → empty) */
export function parseStyleParams(json: string | null | undefined): StyleParams {
  if (!json) return {}
  try {
    return sanitizeStyleParams(JSON.parse(json))
  } catch {
    return {}
  }
}

/** The image's style: first slot (text order) that yields a style */
export function pickImageStyle(
  slots: ReadonlyArray<StyleSlot>,
  wildcards: ReadonlyArray<WildcardEntry>,
  picks: ReadonlyArray<{ id: number; index: number }>,
): StyleInfo | null {
  for (const slot of slots) {
    if (slot.kind === 'static') return slot.style
    const entry = wildcards.find((w) => w.id === slot.wildcardId)
    const pick = picks.find((p) => p.id === slot.wildcardId)
    if (!entry || !pick) continue
    // A fixed wildcard holds just the chosen option
    const idx = entry.mode === 'fixed' ? 0 : pick.index
    const style = idx >= 0 ? entry.optionStyles?.[idx] : null
    if (style) return style
  }
  return null
}

export interface AppliedStyle {
  parameters: Record<string, unknown>
  /** Follow keys whose value was actually taken from the style */
  applied: Array<StyleFollowKey>
}

/**
 * Overwrite the followed parameters with the style's values. Resolution is
 * left alone while Random resolution is on (the explicit choice wins); items
 * the style has no value for keep the project value.
 */
export function applyStyleToParams(
  params: Record<string, unknown>,
  style: StyleInfo | null,
  follow: StyleFollow,
): AppliedStyle {
  if (!style) return { parameters: params, applied: [] }
  const out = { ...params }
  const applied: Array<StyleFollowKey> = []
  const p = style.params
  if (
    follow.resolution &&
    params.randomResolution !== true &&
    finite(p.width) &&
    finite(p.height)
  ) {
    out.width = p.width
    out.height = p.height
    applied.push('resolution')
  }
  if (follow.steps && finite(p.steps)) {
    out.steps = p.steps
    applied.push('steps')
  }
  if (follow.scale && finite(p.scale)) {
    out.scale = p.scale
    applied.push('scale')
  }
  if (follow.cfgRescale && finite(p.cfgRescale)) {
    out.cfgRescale = p.cfgRescale
    applied.push('cfgRescale')
  }
  if (follow.sampler && (p.sampler || p.scheduler)) {
    if (p.sampler) out.sampler = p.sampler
    if (p.scheduler) out.scheduler = p.scheduler
    applied.push('sampler')
  }
  return { parameters: out, applied }
}

/** Final negative with the style's negative appended (`, `) */
export function appendStyleNegative(
  negative: string,
  style: StyleInfo | null,
): string {
  const extra = style?.negative.trim() ?? ''
  if (!extra) return negative
  const base = negative.trim().replace(/,\s*$/, '')
  return base ? `${base}, ${extra}` : extra
}

/** Delay with optional random jitter: 0.5x - 1.5x of the base */
export function jitterDelay(
  ms: number,
  enabled: boolean,
  rng: () => number = Math.random,
): number {
  return enabled ? Math.round(ms * (0.5 + rng())) : ms
}

/** `832×1216 · 28 steps · CFG 5 · Rescale 0 · Euler a / karras` */
export function formatStyleSummary(params: StyleParams): string {
  const parts: Array<string> = []
  if (finite(params.width) && finite(params.height)) {
    parts.push(`${params.width}×${params.height}`)
  }
  if (finite(params.steps)) parts.push(`${params.steps} steps`)
  if (finite(params.scale)) parts.push(`CFG ${params.scale}`)
  if (finite(params.cfgRescale)) parts.push(`Rescale ${params.cfgRescale}`)
  if (params.sampler || params.scheduler) {
    const s = params.sampler
      ? (SAMPLER_LABELS[params.sampler] ?? params.sampler)
      : ''
    parts.push([s, params.scheduler].filter(Boolean).join(' / '))
  }
  return parts.join(' · ')
}

/** Display value of one follow item (undefined when the style has none) */
export function styleItemValue(
  params: StyleParams,
  key: StyleFollowKey,
): string | undefined {
  switch (key) {
    case 'resolution':
      return finite(params.width) && finite(params.height)
        ? `${params.width} × ${params.height}`
        : undefined
    case 'steps':
      return finite(params.steps) ? String(params.steps) : undefined
    case 'scale':
      return finite(params.scale) ? String(params.scale) : undefined
    case 'cfgRescale':
      return finite(params.cfgRescale) ? String(params.cfgRescale) : undefined
    case 'sampler': {
      if (!params.sampler && !params.scheduler) return undefined
      const s = params.sampler
        ? (SAMPLER_LABELS[params.sampler] ?? params.sampler)
        : ''
      return [s, params.scheduler].filter(Boolean).join(' / ')
    }
  }
}

export function toStyleInfo(bundle: BundleDef): StyleInfo {
  return {
    bundleId: bundle.id,
    name: bundle.name,
    negative: bundle.negative ?? '',
    params: bundle.styleParams ?? {},
  }
}

/** First style bundle referenced in a text (null when none) */
export function firstStyleIn(
  text: string,
  lookup: (name: string) => BundleDef | undefined,
): StyleInfo | null {
  let found: StyleInfo | null = null
  replaceBundleRefs(text, lookup, (ref) => {
    if (!found && ref.bundle.kind === 'style') found = toStyleInfo(ref.bundle)
    return ''
  })
  return found
}

export interface PromptStyleInfo {
  /** Names of the candidate styles, text order */
  names: Array<string>
  /** The image's style depends on the picked wildcard option */
  perImage: boolean
  /** The style's settings (null when perImage) */
  params: StyleParams | null
}

/**
 * Client-side: which style the general prompt brings (for the Params tab).
 * Static styles and wildcards with style options both count; the first one in
 * text order decides whether the style is fixed or per image.
 */
export function detectPromptStyle(
  generalPrompt: string,
  bundles: ReadonlyArray<BundleDef>,
): PromptStyleInfo | null {
  const map = new Map(bundles.map((b) => [b.name, b]))
  const lookup = (name: string) => map.get(name)
  const names: Array<string> = []
  let first: { perImage: boolean; params: StyleParams } | null = null
  replaceBundleRefs(generalPrompt, lookup, (ref) => {
    const { bundle } = ref
    if (bundle.kind === 'style') {
      names.push(bundle.name)
      first ??= { perImage: false, params: bundle.styleParams ?? {} }
    } else if (bundle.kind === 'wildcard') {
      const options = ref.fixed
        ? [ref.fixed.option]
        : parseWildcardOptions(bundle.content)
      const styles = options
        .map((o) => firstStyleIn(o, lookup))
        .filter((s): s is StyleInfo => s != null)
      if (styles.length > 0) {
        for (const s of styles) if (!names.includes(s.name)) names.push(s.name)
        first ??= { perImage: true, params: {} }
      }
    }
    return ''
  })
  if (!first) return null
  const f = first as { perImage: boolean; params: StyleParams }
  return {
    names,
    perImage: f.perImage,
    params: f.perImage ? null : f.params,
  }
}
