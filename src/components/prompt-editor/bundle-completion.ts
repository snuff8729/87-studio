import { searchTags } from './danbooru-completion'
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import type { BundleDef } from '@/lib/wildcard'
import { extractTagQuery } from '@/lib/tag-query'
import {
  normalizeKind,
  normalizeMode,
  optionName,
  parseBundleRef,
  parseWildcardOptions,
} from '@/lib/wildcard'

/** Bundle info the editor needs (kind / mode are absent for older callers) */
export interface EditorBundle {
  name: string
  content: string
  kind?: string
  wildcardMode?: string
}

// Module-level cache, updated externally
let bundleNames: Array<EditorBundle> = []
let slotNames: Array<string> = []

export function setBundleNames(names: Array<EditorBundle>) {
  bundleNames = names
}

export function getBundleNames(): Array<EditorBundle> {
  return bundleNames
}

export function toBundleDef(b: EditorBundle): BundleDef {
  return {
    id: 0,
    name: b.name,
    content: b.content,
    kind: normalizeKind(b.kind),
    wildcardMode: normalizeMode(b.wildcardMode),
  }
}

/** Resolve a raw `@{bundle:...}` name against the cached bundles */
export function lookupBundleRef(raw: string) {
  return parseBundleRef(raw, (n) => {
    const b = bundleNames.find((x) => x.name === n)
    return b ? toBundleDef(b) : undefined
  })
}

function bundleDetail(b: EditorBundle): string {
  if (normalizeKind(b.kind) === 'wildcard') {
    const n = parseWildcardOptions(b.content).length
    return `wildcard · ${n} option${n === 1 ? '' : 's'}`
  }
  return b.content.length > 30 ? b.content.slice(0, 30) + '...' : b.content
}

/** After `bundle:name:` — mode keywords, then each option of a wildcard */
function modeCompletions(query: string): Array<Completion> | null {
  const m = /^bundle:(.+?):([^:}]*)$/.exec(query)
  if (!m) return null
  const base = bundleNames.find((b) => b.name.toLowerCase() === m[1])
  if (!base || normalizeKind(base.kind) !== 'wildcard') return null
  const typed = m[2]
  const options: Array<Completion> = [
    { label: 'random', detail: 'mode', apply: 'random}' },
    { label: 'seq', detail: 'mode (sequential)', apply: 'seq}' },
    ...parseWildcardOptions(base.content).map((o) => ({
      label: optionName(o),
      detail: o === optionName(o) ? 'option' : 'bundle',
      apply: `${optionName(o)}}`,
    })),
  ]
    .filter((o) => !typed || o.label.toLowerCase().includes(typed))
    .slice(0, 30)
    .map((o, i) => ({ ...o, type: 'enum', boost: 30 - i }))
  return options.length > 0 ? options : null
}

export function setSlotNames(names: Array<string>) {
  slotNames = names
}

// Character-parts tokens (replaced by the linked library character / outfit)
const PARTS_TOKENS = ['char', 'outfit'] as const

function partsTokenOptions(
  query: string,
  allowParts: boolean,
): Array<Completion> {
  if (!allowParts) return []
  return PARTS_TOKENS.filter((t) => !query || t.includes(query)).map((t) => ({
    label: t,
    detail: 'parts',
    type: 'keyword' as const,
    apply: `${t}}`,
    boost: 3,
  }))
}

function slotCompletions(query: string): Array<Completion> {
  return slotNames
    .filter((n) => !query || n.toLowerCase().includes(query))
    .slice(0, 10)
    .map((name) => ({
      label: name,
      detail: 'slot',
      type: 'property',
      apply: `@{slot:${name}}`,
      boost: 2,
    }))
}

function bundleCompletions(query: string): Array<Completion> {
  return bundleNames
    .filter((b) => !query || b.name.toLowerCase().includes(query))
    .slice(0, 10)
    .map((b) => ({
      label: b.name,
      detail: bundleDetail(b),
      type: 'variable',
      apply: `@{bundle:${b.name}}`,
      boost: 1,
    }))
}

/** Default completion: no @{char} / @{outfit} (only the workspace Chars tab prompt has them). */
export function unifiedCompletion(
  context: CompletionContext,
): Promise<CompletionResult | null> {
  return completeRefs(context, false)
}

/** Completion for the workspace character prompt (offers @{char} / @{outfit}). */
export function partsCompletion(
  context: CompletionContext,
): Promise<CompletionResult | null> {
  return completeRefs(context, true)
}

async function completeRefs(
  context: CompletionContext,
  allowParts: boolean,
): Promise<CompletionResult | null> {
  const beforeCursor = context.state.sliceDoc(0, context.pos)

  // ── Mode 1: Inside @{ ... } ──
  const openIdx = beforeCursor.lastIndexOf('@{')
  if (openIdx >= 0) {
    const afterOpen = beforeCursor.slice(openIdx + 2)
    if (!afterOpen.includes('}')) {
      const from = openIdx + 2
      const query = afterOpen.toLowerCase()

      // Already typed "slot:" prefix
      if (query.startsWith('slot:')) {
        const nameQuery = query.slice(5)
        const options: Array<Completion> = slotNames
          .filter((n) => !nameQuery || n.toLowerCase().includes(nameQuery))
          .slice(0, 15)
          .map((name) => ({
            label: `slot:${name}`,
            type: 'property',
            apply: `slot:${name}}`,
          }))
        return options.length > 0
          ? { from, options, validFor: /^[^}]*$/ }
          : null
      }

      // Already typed "bundle:" prefix
      if (query.startsWith('bundle:')) {
        const modeOptions = modeCompletions(query)
        if (modeOptions) {
          const optFrom = openIdx + 2 + afterOpen.lastIndexOf(':') + 1
          return { from: optFrom, options: modeOptions, validFor: /^[^}:]*$/ }
        }
        const nameQuery = query.slice(7)
        const options: Array<Completion> = bundleNames
          .filter((b) => !nameQuery || b.name.toLowerCase().includes(nameQuery))
          .slice(0, 15)
          .map((b) => ({
            label: `bundle:${b.name}`,
            detail: bundleDetail(b),
            type: 'variable',
            apply: `bundle:${b.name}}`,
          }))
        return options.length > 0
          ? { from, options, validFor: /^[^}]*$/ }
          : null
      }

      // No prefix yet — show both slot: and bundle: options
      const options: Array<Completion> = [
        ...partsTokenOptions(query, allowParts),
        ...slotNames
          .filter(
            (n) =>
              !query ||
              n.toLowerCase().includes(query) ||
              'slot:'.includes(query),
          )
          .slice(0, 8)
          .map((name) => ({
            label: `slot:${name}`,
            type: 'property' as const,
            apply: `slot:${name}}`,
            boost: 2,
          })),
        ...bundleNames
          .filter(
            (b) =>
              !query ||
              b.name.toLowerCase().includes(query) ||
              'bundle:'.includes(query),
          )
          .slice(0, 8)
          .map((b) => ({
            label: `bundle:${b.name}`,
            detail: bundleDetail(b),
            type: 'variable' as const,
            apply: `bundle:${b.name}}`,
            boost: 1,
          })),
      ]

      return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
    }
  }

  // ── Mode 2: General text (after comma, 2+ chars) ──
  const typed = extractTagQuery(beforeCursor)
  if (!typed) return null

  const query = typed.text.toLowerCase()
  const slots = slotCompletions(query)
  const bundles = bundleCompletions(query)
  const tags = await searchTags(typed.text, 20)

  const options = [...slots, ...bundles, ...tags]
  if (options.length === 0) return null

  // filter: false keeps the server's ranking (alias hits do not contain the
  // typed text); no validFor so every keystroke re-queries.
  return { from: typed.from, options, filter: false }
}
