import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'

// Module-level cache for bundle names, updated externally
let bundleNames: Array<{ name: string; content: string }> = []

export function setBundleNames(names: Array<{ name: string; content: string }>) {
  bundleNames = names
}

export function getBundleNames(): Array<{ name: string; content: string }> {
  return bundleNames
}

export function bundleCompletion(context: CompletionContext): CompletionResult | null {
  // Look for @{ before cursor without a closing }
  const beforeCursor = context.state.sliceDoc(0, context.pos)
  const openIdx = beforeCursor.lastIndexOf('@{')
  if (openIdx === -1) return null

  // Check there's no closing } between @{ and cursor
  const afterOpen = beforeCursor.slice(openIdx + 2)
  if (afterOpen.includes('}')) return null

  const query = afterOpen.toLowerCase()
  const from = openIdx + 2 // position after @{

  const options: Completion[] = bundleNames
    .filter((b) => !query || b.name.toLowerCase().includes(query))
    .slice(0, 15)
    .map((b) => ({
      label: b.name,
      detail: b.content.length > 40 ? b.content.slice(0, 40) + '...' : b.content,
      type: 'variable',
      apply: b.name + '}',
    }))

  if (options.length === 0) return null

  return {
    from,
    options,
    validFor: /^[^}]*$/,
  }
}
