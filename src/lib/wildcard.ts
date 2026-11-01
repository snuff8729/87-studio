/**
 * Wildcard (list) bundles: pure parsing / selection logic.
 *
 * A wildcard bundle's content is a list of options, one per line (blank lines
 * ignored, lines starting with `#` are comments). Each generated image gets one
 * option, picked randomly or sequentially (option = image index % count).
 *
 * Synthesis leaves a marker `@{wc:N}` in the prompts and records the options in
 * `ResolvedPrompts.wildcards`; the generation loop picks per image.
 */
import type { StyleInfo, StyleParams } from '@/lib/style-bundles'

export type BundleKind = 'text' | 'wildcard' | 'style'
export type WildcardMode = 'random' | 'sequential'
/** Pick mode recorded per use: bundle modes plus a fixed single option */
export type PickMode = WildcardMode | 'fixed'

export interface BundleDef {
  id: number
  name: string
  content: string
  kind: BundleKind
  wildcardMode: WildcardMode
  /** Style bundles only */
  negative?: string
  styleParams?: StyleParams
}

/** One wildcard occurrence in a synthesized prompt set */
export interface WildcardEntry {
  /** Marker number (`@{wc:N}`) */
  id: number
  bundleId: number
  bundle: string
  mode: PickMode
  /** Fully resolved option texts (slots and text bundles already expanded) */
  options: Array<string>
  /** mode 'fixed': options holds only the chosen one; its 0-based line index */
  fixedIndex?: number
  /** Style of each option (first style bundle in the option line), if any */
  optionStyles?: Array<StyleInfo | null>
}

export interface WildcardPick {
  bundle: string
  mode: PickMode
  option: string
  /** 0-based index into the options; -1 when the bundle has no options */
  index: number
}

export const MODE_SUFFIXES: Record<string, WildcardMode> = {
  random: 'random',
  seq: 'sequential',
  sequential: 'sequential',
}

export function normalizeMode(value: unknown): WildcardMode {
  return value === 'sequential' ? 'sequential' : 'random'
}

export function normalizeKind(value: unknown): BundleKind {
  return value === 'wildcard' || value === 'style' ? value : 'text'
}

/** `@{bundle:...}` references (the captured group is the raw name incl. mode) */
export const BUNDLE_REF_SRC = String.raw`@\{bundle:([^}]+)\}`

export interface ParsedBundleRef {
  bundle: BundleDef
  /** Mode written at the usage site (`:random` / `:seq`), if any */
  override?: WildcardMode
  /** Fixed single option (`@{bundle:name:smile}` / `:2`), 0-based line index */
  fixed?: { index: number; option: string }
  /** The full matched text (`@{bundle:...}`), set by `replaceBundleRefs` */
  match?: string
}

/**
 * Resolve a raw reference name. An exact bundle name always wins; otherwise a
 * trailing `:random` / `:seq` / `:sequential` is a mode override of the base
 * bundle. Unknown bundles give null.
 */
export function parseBundleRef(
  raw: string,
  lookup: (name: string) => BundleDef | undefined,
): ParsedBundleRef | null {
  const exact = lookup(raw)
  if (exact) return { bundle: exact }
  const idx = raw.lastIndexOf(':')
  if (idx <= 0) return null
  const base = lookup(raw.slice(0, idx))
  if (!base) return null
  const suffix = raw.slice(idx + 1).trim()
  const mode = MODE_SUFFIXES[suffix.toLowerCase()]
  if (mode) return { bundle: base, override: mode }
  if (base.kind !== 'wildcard') return null
  const fixed = findOption(parseWildcardOptions(base.content), suffix)
  return fixed ? { bundle: base, fixed } : null
}

/**
 * Name of an option line: the referenced bundle name for a line that is a
 * single `@{bundle:x}` ref, otherwise the trimmed line.
 */
export function optionName(line: string): string {
  const m = /^@\{bundle:([^}]+)\}$/.exec(line.trim())
  return m ? m[1].trim() : line.trim()
}

/** Option by name (case-insensitive; the full line text also matches) */
export function findOption(
  options: ReadonlyArray<string>,
  query: string,
): { index: number; option: string } | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  let index = options.findIndex((o) => optionName(o).toLowerCase() === q)
  if (index < 0) index = options.findIndex((o) => o.toLowerCase() === q)
  return index >= 0 ? { index, option: options[index] } : null
}

/** Effective mode of a wildcard reference */
export function effectiveMode(ref: ParsedBundleRef): PickMode {
  if (ref.fixed) return 'fixed'
  return ref.override ?? ref.bundle.wildcardMode
}

/** Options of a wildcard bundle: non-empty, non-comment lines, trimmed */
export function parseWildcardOptions(content: string): Array<string> {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
}

/** Index to use for one image (-1 when there are no options) */
export function pickIndex(
  count: number,
  mode: WildcardMode,
  imageIndex: number,
  rng: () => number = Math.random,
): number {
  if (count <= 0) return -1
  if (mode === 'sequential') return Math.max(0, imageIndex) % count
  return Math.min(count - 1, Math.floor(rng() * count))
}

export function wildcardMarker(id: number): string {
  return `@{wc:${id}}`
}

/** Pick one option per entry for the image at `imageIndex` */
export function pickWildcards(
  entries: ReadonlyArray<WildcardEntry>,
  imageIndex: number,
  rng: () => number = Math.random,
): Array<WildcardPick & { id: number }> {
  return entries.map((e) => {
    if (e.mode === 'fixed') {
      return {
        id: e.id,
        bundle: e.bundle,
        mode: e.mode,
        option: e.options[0] ?? '',
        index: e.fixedIndex ?? 0,
      }
    }
    const index = pickIndex(e.options.length, e.mode, imageIndex, rng)
    return {
      id: e.id,
      bundle: e.bundle,
      mode: e.mode,
      option: index >= 0 ? e.options[index] : '',
      index,
    }
  })
}

function replaceMarkers(
  text: string,
  render: (id: number) => string | undefined,
): string {
  return text.replace(/@\{wc:(\d+)\}/g, (m, id) => render(Number(id)) ?? m)
}

/** Readable form of a wildcard for previews: `{a | b | c}` / `{seq: a | b}` */
export function previewWildcard(entry: WildcardEntry): string {
  if (entry.mode === 'fixed') return entry.options[0] ?? ''
  const body = entry.options.join(' | ')
  return entry.mode === 'sequential' ? `{seq: ${body}}` : `{${body}}`
}

interface PromptsLike {
  generalPrompt: string
  negativePrompt: string
  characterPrompts: Array<{ prompt: string; negative: string }>
  wildcards?: Array<WildcardEntry>
}

function mapPrompts<T extends PromptsLike>(
  prompts: T,
  render: (id: number) => string | undefined,
): T {
  const f = (s: string) => replaceMarkers(s, render)
  const { wildcards: _w, ...rest } = prompts
  return {
    ...rest,
    generalPrompt: f(prompts.generalPrompt),
    negativePrompt: f(prompts.negativePrompt),
    characterPrompts: prompts.characterPrompts.map((c) => ({
      ...c,
      prompt: f(c.prompt),
      negative: f(c.negative),
    })),
  } as T
}

/** Final per-image prompts: markers replaced by the picked options */
export function applyWildcardPicks<T extends PromptsLike>(
  prompts: T,
  picks: ReadonlyArray<WildcardPick & { id: number }>,
): T {
  if (!prompts.wildcards?.length) return prompts
  const byId = new Map(picks.map((p) => [p.id, p.option]))
  return mapPrompts(prompts, (id) => byId.get(id) ?? '')
}

/** Preview prompts: markers replaced by `{a | b | c}` */
export function previewWildcardPrompts<T extends PromptsLike>(prompts: T): T {
  if (!prompts.wildcards?.length) return prompts
  const byId = new Map(prompts.wildcards.map((w) => [w.id, w]))
  return mapPrompts(prompts, (id) => {
    const w = byId.get(id)
    return w ? previewWildcard(w) : ''
  })
}

/** Strip the transient `id` for storage in image metadata */
export function toStoredPicks(
  picks: ReadonlyArray<WildcardPick & { id: number }>,
): Array<WildcardPick> {
  return picks.map(({ bundle, mode, option, index }) => ({
    bundle,
    mode,
    option,
    index,
  }))
}

/**
 * Replace bundle references in a template. `onRef` returns the replacement for
 * a resolved reference (null = unknown bundle, becomes empty).
 */
export function replaceBundleRefs(
  template: string,
  lookup: (name: string) => BundleDef | undefined,
  onRef: (ref: ParsedBundleRef) => string,
  onUnknown: (match: string) => string = () => '',
): string {
  return template.replace(
    new RegExp(BUNDLE_REF_SRC, 'g'),
    (match, raw: string) => {
      const ref = parseBundleRef(raw, lookup)
      return ref ? onRef({ ...ref, match }) : onUnknown(match)
    },
  )
}

/**
 * Client-side preview of a template: text bundles inline, wildcard bundles as
 * `{a | b | c}`. Unknown bundles become empty (matches synthesis).
 */
export function resolveBundlesPreview(
  template: string,
  lookup: (name: string) => BundleDef | undefined,
): string {
  // Option lines may hold text-bundle refs (one level; wildcards dropped)
  const expandOption = (line: string) =>
    replaceBundleRefs(line, lookup, (ref) =>
      ref.bundle.kind === 'wildcard' ? '' : ref.bundle.content,
    )
  return replaceBundleRefs(template, lookup, (ref) =>
    ref.bundle.kind !== 'wildcard'
      ? ref.bundle.content
      : previewWildcard({
          id: 0,
          bundleId: ref.bundle.id,
          bundle: ref.bundle.name,
          mode: effectiveMode(ref),
          options: (ref.fixed
            ? [ref.fixed.option]
            : parseWildcardOptions(ref.bundle.content)
          ).map(expandOption),
        }),
  )
}
