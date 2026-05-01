import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import { searchTags } from './danbooru-completion'

// Module-level cache, updated externally
let bundleNames: Array<{ name: string; content: string }> = []
let slotNames: Array<string> = []

export function setBundleNames(
  names: Array<{ name: string; content: string }>,
) {
  bundleNames = names
}

export function getBundleNames(): Array<{ name: string; content: string }> {
  return bundleNames
}

export function setSlotNames(names: Array<string>) {
  slotNames = names
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
      detail: b.content.length > 30 ? b.content.slice(0, 30) + '...' : b.content,
      type: 'variable',
      apply: `@{bundle:${b.name}}`,
      boost: 1,
    }))
}

export function unifiedCompletion(
  context: CompletionContext,
): CompletionResult | null {
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
            detail: 'slot',
            type: 'property',
            apply: `slot:${name}}`,
          }))
        return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
      }

      // Already typed "bundle:" prefix
      if (query.startsWith('bundle:')) {
        const nameQuery = query.slice(7)
        const options: Array<Completion> = bundleNames
          .filter((b) => !nameQuery || b.name.toLowerCase().includes(nameQuery))
          .slice(0, 15)
          .map((b) => ({
            label: `bundle:${b.name}`,
            detail:
              b.content.length > 30
                ? b.content.slice(0, 30) + '...'
                : b.content,
            type: 'variable',
            apply: `bundle:${b.name}}`,
          }))
        return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
      }

      // No prefix yet — show both slot: and bundle: options
      const options: Array<Completion> = [
        ...slotNames
          .filter((n) => !query || n.toLowerCase().includes(query) || 'slot:'.includes(query))
          .slice(0, 8)
          .map((name) => ({
            label: `slot:${name}`,
            detail: 'slot',
            type: 'property' as const,
            apply: `slot:${name}}`,
            boost: 2,
          })),
        ...bundleNames
          .filter((b) => !query || b.name.toLowerCase().includes(query) || 'bundle:'.includes(query))
          .slice(0, 8)
          .map((b) => ({
            label: `bundle:${b.name}`,
            detail:
              b.content.length > 30
                ? b.content.slice(0, 30) + '...'
                : b.content,
            type: 'variable' as const,
            apply: `bundle:${b.name}}`,
            boost: 1,
          })),
      ]

      return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
    }
  }

  // ── Mode 2: General text (after comma, 2+ chars) ──
  const lastComma = beforeCursor.lastIndexOf(',')
  const afterComma = beforeCursor.slice(lastComma + 1).trimStart()

  if (afterComma.length < 2) return null

  // Don't trigger if we're inside @{...}
  if (afterComma.includes('@{')) return null

  const from = context.pos - afterComma.length
  const query = afterComma.toLowerCase()

  const slots = slotCompletions(query)
  const bundles = bundleCompletions(query)
  const tags = searchTags(afterComma, 10)

  const options = [...slots, ...bundles, ...tags]

  if (options.length === 0) return null

  return {
    from,
    options,
    validFor: /^[^\s,]*$/,
  }
}
